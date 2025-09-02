import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import db, { addComponentHistory } from '../database';
import { Component, SearchFilters } from '../../src/types';
import { validateSchema, validateQuery, validateParams, schemas, rateLimit } from '../middleware/validation';
import { generateComponentQRCodeHTML, generateMixedSizeComponentQRCodeHTML } from '../utils/htmlQR';

const router = express.Router();

// Helper function to get calculated costs for components from orders
const getComponentCalculatedCosts = (componentIds: string[]) => {
  if (componentIds.length === 0) return new Map();

  const placeholders = componentIds.map(() => '?').join(',');
  const costs = db.prepare(`
    SELECT 
      oi.component_id,
      COUNT(DISTINCT o.id) as order_count,
      SUM(oi.quantity) as total_quantity,
      AVG(oi.unit_cost) as average_unit_cost,
      SUM(oi.total_cost) as total_value,
      MAX(o.order_date) as last_order_date
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    WHERE oi.component_id IN (${placeholders})
    GROUP BY oi.component_id
  `).all(componentIds) as any[];

  const costsMap = new Map();
  for (const cost of costs) {
    costsMap.set(cost.component_id, {
      orderCount: cost.order_count,
      totalQuantity: cost.total_quantity,
      averageUnitCost: cost.average_unit_cost,
      totalValue: cost.total_value,
      lastOrderDate: cost.last_order_date
    });
  }
  return costsMap;
};

// Helper function to convert database row to API format with calculated costs
const mapComponentRow = (row: any, calculatedCosts?: any): Component => ({
  ...row,
  // Map database field names to camelCase API field names
  partNumber: row.part_number,
  packageType: row.package_type,
  pinCount: row.pin_count,
  minThreshold: row.min_threshold,
  // Use calculated costs from orders instead of deprecated fields
  unitCost: calculatedCosts?.averageUnitCost || undefined,
  totalCost: calculatedCosts?.totalValue || undefined,
  quantity: calculatedCosts?.totalQuantity || row.quantity || 0, // Use calculated quantity from orders
  locationId: row.location_id,
  datasheetUrl: row.datasheet_url,
  imageUrl: row.image_url,
  purchaseDate: calculatedCosts?.lastOrderDate || row.purchase_date,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  qrCode: row.qr_code,
  qrSize: row.qr_size,
  generateQr: row.generate_qr,
  // Parse JSON fields
  tags: row.tags ? JSON.parse(row.tags) : [],
  dimensions: row.dimensions ? JSON.parse(row.dimensions) : undefined,
  weight: row.weight ? JSON.parse(row.weight) : undefined,
  voltage: row.voltage ? JSON.parse(row.voltage) : undefined,
  current: row.current ? JSON.parse(row.current) : undefined,
  protocols: row.protocols ? JSON.parse(row.protocols) : [],
  // Remove snake_case duplicates
  part_number: undefined,
  package_type: undefined,
  pin_count: undefined,
  min_threshold: undefined,
  unit_cost: undefined,
  total_cost: undefined,
  location_id: undefined,
  datasheet_url: undefined,
  image_url: undefined,
  purchase_date: undefined,
  created_at: undefined,
  updated_at: undefined,
  qr_code: undefined,
  qr_size: undefined,
  generate_qr: undefined
} as Component);

// Apply rate limiting to all routes
router.use(rateLimit(200, 15 * 60 * 1000)); // 200 requests per 15 minutes

// Get all components with optional filtering
router.get('/', validateQuery(schemas.search), (req, res) => {
  try {
    const filters: SearchFilters = req.query;
    let sql = `
      SELECT c.*, sl.name as location_name 
      FROM components c
      LEFT JOIN storage_locations sl ON c.location_id = sl.id
      WHERE 1=1
    `;
    const params: any[] = [];

    // Build dynamic WHERE clause based on filters
    if (filters.category) {
      sql += ' AND c.category = ?';
      params.push(filters.category);
    }
    if (filters.subcategory) {
      sql += ' AND c.subcategory = ?';
      params.push(filters.subcategory);
    }
    if (filters.manufacturer) {
      sql += ' AND c.manufacturer LIKE ?';
      params.push(`%${filters.manufacturer}%`);
    }
    if (filters.status) {
      sql += ' AND c.status = ?';
      params.push(filters.status);
    }
    if (filters.locationId) {
      sql += ' AND c.location_id = ?';
      params.push(filters.locationId);
    }
    if (filters.minQuantity !== undefined) {
      sql += ' AND c.quantity >= ?';
      params.push(filters.minQuantity);
    }
    if (filters.maxQuantity !== undefined) {
      sql += ' AND c.quantity <= ?';
      params.push(filters.maxQuantity);
    }

    // Part number search
    if (filters.partNumber) {
      sql += ' AND c.part_number LIKE ?';
      params.push(`%${filters.partNumber}%`);
    }

    // Location name search
    if (filters.locationName) {
      sql += ' AND sl.name LIKE ?';
      params.push(`%${filters.locationName}%`);
    }

    // Tag filtering - search within JSON string
    if (filters.tags && filters.tags.length > 0) {
      const tagConditions = filters.tags.map(() => 'c.tags LIKE ?').join(' AND ');
      sql += ` AND (${tagConditions})`;
      filters.tags.forEach(tag => {
        params.push(`%"${tag}"%`);
      });
    }

    // Enhanced search in name, part number, description, tags, and location
    if (req.query.term) {
      sql += ` AND (
        c.name LIKE ? OR 
        c.part_number LIKE ? OR 
        c.description LIKE ? OR 
        c.manufacturer LIKE ? OR
        c.tags LIKE ? OR
        sl.name LIKE ?
      )`;
      const searchTerm = `%${req.query.term}%`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
    }

    // Sorting
    const sortBy = req.query.sortBy || 'name';
    const sortOrder = req.query.sortOrder || 'asc';
    const columnPrefix = sortBy === 'location_name' ? 'sl' : 'c';
    sql += ` ORDER BY ${columnPrefix}.${sortBy === 'location_name' ? 'name' : sortBy} ${(sortOrder as string).toUpperCase()}`;

    const stmt = db.prepare(sql);
    const rows = stmt.all(...params) as any[];
    
    // Get calculated costs for all components
    const componentIds = rows.map(row => row.id);
    const calculatedCosts = getComponentCalculatedCosts(componentIds);
    
    // Parse JSON fields and map database field names to API field names with calculated costs
    const components = rows.map((row: any) => {
      const costs = calculatedCosts.get(row.id);
      return mapComponentRow(row, costs);
    });

    res.json(components);
  } catch (error) {
    console.error('Error fetching components:', error);
    res.status(500).json({ error: 'Internal server error' }); // Generic error message for security
  }
});

// Get component by ID
router.get('/:id', validateParams(['id']), (req, res) => {
  try {
    const stmt = db.prepare('SELECT * FROM components WHERE id = ?');
    const row = stmt.get(req.params.id) as any;
    
    if (!row) {
      return res.status(404).json({ error: 'Component not found' });
    }

    // Get calculated costs for this component
    const calculatedCosts = getComponentCalculatedCosts([row.id]);
    const costs = calculatedCosts.get(row.id);
    
    // Parse JSON fields and map database field names to API field names with calculated costs
    const component = mapComponentRow(row, costs);

    res.json(component);
  } catch (error) {
    console.error('Error fetching component:', error);
    res.status(500).json({ error: 'Failed to fetch component' });
  }
});

// Create new component
router.post('/', validateSchema(schemas.component), (req, res) => {
  try {
    const component: Partial<Component> = req.body;
    const id = uuidv4();
    const now = new Date().toISOString();

    const stmt = db.prepare(`
      INSERT INTO components (
        id, name, part_number, manufacturer, description, category, subcategory,
        tags, dimensions, weight, package_type, voltage, current, pin_count, protocols,
        quantity, min_threshold, supplier, purchase_date, unit_cost, total_cost,
        location_id, status, datasheet_url, image_url, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      component.name,
      component.partNumber || null,
      component.manufacturer || null,
      component.description || null,
      component.category,
      component.subcategory || null,
      JSON.stringify(component.tags || []),
      component.dimensions ? JSON.stringify(component.dimensions) : null,
      component.weight ? JSON.stringify(component.weight) : null,
      component.packageType || null,
      component.voltage ? JSON.stringify(component.voltage) : null,
      component.current ? JSON.stringify(component.current) : null,
      component.pinCount || null,
      JSON.stringify(component.protocols || []),
      component.quantity || 0,
      component.minThreshold || 0,
      component.supplier || null,
      component.purchaseDate || null,
      component.unitCost || null,
      component.totalCost || null,
      component.locationId || null,
      component.status || 'available',
      component.datasheetUrl || null,
      component.imageUrl || null,
      component.notes || null,
      now,
      now
    );

    // Add history entry
    addComponentHistory(id, 'added', undefined, `Added ${component.quantity || 0} units`, component.quantity);

    res.status(201).json({ id, ...component, createdAt: now, updatedAt: now });
  } catch (error) {
    console.error('Error creating component:', error);
    res.status(500).json({ error: 'Failed to create component' });
  }
});

// Update component
router.put('/:id', validateParams(['id']), validateSchema(schemas.component.partial()), (req, res) => {
  try {
    const componentId = req.params.id;
    const updates: Partial<Component> = req.body;
    const now = new Date().toISOString();

    // Get current component for history
    const currentStmt = db.prepare('SELECT * FROM components WHERE id = ?');
    const currentComponent = currentStmt.get(componentId) as any;
    
    if (!currentComponent) {
      return res.status(404).json({ error: 'Component not found' });
    }

    const stmt = db.prepare(`
      UPDATE components SET
        name = COALESCE(?, name),
        part_number = COALESCE(?, part_number),
        manufacturer = COALESCE(?, manufacturer),
        description = COALESCE(?, description),
        category = COALESCE(?, category),
        subcategory = COALESCE(?, subcategory),
        tags = COALESCE(?, tags),
        dimensions = COALESCE(?, dimensions),
        weight = COALESCE(?, weight),
        package_type = COALESCE(?, package_type),
        voltage = COALESCE(?, voltage),
        current = COALESCE(?, current),
        pin_count = COALESCE(?, pin_count),
        protocols = COALESCE(?, protocols),
        quantity = COALESCE(?, quantity),
        min_threshold = COALESCE(?, min_threshold),
        supplier = COALESCE(?, supplier),
        purchase_date = COALESCE(?, purchase_date),
        unit_cost = COALESCE(?, unit_cost),
        total_cost = COALESCE(?, total_cost),
        location_id = COALESCE(?, location_id),
        status = COALESCE(?, status),
        datasheet_url = COALESCE(?, datasheet_url),
        image_url = COALESCE(?, image_url),
        notes = COALESCE(?, notes),
        updated_at = ?
      WHERE id = ?
    `);

    stmt.run(
      updates.name,
      updates.partNumber,
      updates.manufacturer,
      updates.description,
      updates.category,
      updates.subcategory,
      updates.tags ? JSON.stringify(updates.tags) : null,
      updates.dimensions ? JSON.stringify(updates.dimensions) : null,
      updates.weight ? JSON.stringify(updates.weight) : null,
      updates.packageType,
      updates.voltage ? JSON.stringify(updates.voltage) : null,
      updates.current ? JSON.stringify(updates.current) : null,
      updates.pinCount,
      updates.protocols ? JSON.stringify(updates.protocols) : null,
      updates.quantity,
      updates.minThreshold,
      updates.supplier,
      updates.purchaseDate,
      updates.unitCost,
      updates.totalCost,
      updates.locationId,
      updates.status,
      updates.datasheetUrl,
      updates.imageUrl,
      updates.notes,
      now,
      componentId
    );

    // Add history entry for significant changes
    if (updates.quantity !== undefined && updates.quantity !== currentComponent.quantity) {
      addComponentHistory(
        componentId, 
        'updated', 
        currentComponent.quantity?.toString(), 
        updates.quantity.toString(),
        updates.quantity
      );
    }

    // Get and return the updated component
    const getStmt = db.prepare('SELECT * FROM components WHERE id = ?');
    const row = getStmt.get(componentId) as any;
    
    const updatedComponent = {
      ...row,
      // Map database field names to camelCase API field names
      partNumber: row.part_number,
      packageType: row.package_type,
      pinCount: row.pin_count,
      minThreshold: row.min_threshold,
      unitCost: row.unit_cost,
      totalCost: row.total_cost,
      locationId: row.location_id,
      datasheetUrl: row.datasheet_url,
      imageUrl: row.image_url,
      purchaseDate: row.purchase_date,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      // Parse JSON fields
      tags: row.tags ? JSON.parse(row.tags) : [],
      dimensions: row.dimensions ? JSON.parse(row.dimensions) : undefined,
      weight: row.weight ? JSON.parse(row.weight) : undefined,
      voltage: row.voltage ? JSON.parse(row.voltage) : undefined,
      current: row.current ? JSON.parse(row.current) : undefined,
      protocols: row.protocols ? JSON.parse(row.protocols) : [],
      // Remove snake_case duplicates
      part_number: undefined,
      package_type: undefined,
      pin_count: undefined,
      min_threshold: undefined,
      unit_cost: undefined,
      total_cost: undefined,
      location_id: undefined,
      datasheet_url: undefined,
      image_url: undefined,
      purchase_date: undefined,
      created_at: undefined,
      updated_at: undefined
    };

    res.json(updatedComponent);
  } catch (error) {
    console.error('Error updating component:', error);
    res.status(500).json({ error: 'Failed to update component' });
  }
});

// Delete component
router.delete('/:id', validateParams(['id']), (req, res) => {
  try {
    const stmt = db.prepare('DELETE FROM components WHERE id = ?');
    const result = stmt.run(req.params.id);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Component not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting component:', error);
    res.status(500).json({ error: 'Failed to delete component' });
  }
});

// Get component history
router.get('/:id/history', validateParams(['id']), (req, res) => {
  try {
    const stmt = db.prepare(`
      SELECT * FROM component_history 
      WHERE component_id = ? 
      ORDER BY timestamp DESC
    `);
    const history = stmt.all(req.params.id);
    res.json(history);
  } catch (error) {
    console.error('Error fetching component history:', error);
    res.status(500).json({ error: 'Failed to fetch component history' });
  }
});

// Get low stock components
router.get('/alerts/low-stock', (req, res) => {
  try {
    const stmt = db.prepare(`
      SELECT * FROM components 
      WHERE quantity <= min_threshold AND min_threshold > 0
      ORDER BY (quantity - min_threshold) ASC
    `);
    const lowStockComponents = stmt.all() as any[];
    
    // Get calculated costs for low stock components
    const componentIds = lowStockComponents.map(row => row.id);
    const calculatedCosts = getComponentCalculatedCosts(componentIds);
    
    const components = lowStockComponents.map((row: any) => {
      const costs = calculatedCosts.get(row.id);
      return mapComponentRow(row, costs);
    });

    res.json(components);
  } catch (error) {
    console.error('Error fetching low stock components:', error);
    res.status(500).json({ error: 'Failed to fetch low stock components' });
  }
});

// Bulk delete components with dependency checking
router.post('/bulk-delete', validateSchema(schemas.bulkDelete), (req, res) => {
  try {
    const { componentIds } = req.body;
    
    if (!Array.isArray(componentIds) || componentIds.length === 0) {
      return res.status(400).json({ error: 'No components specified for deletion' });
    }

    const errors: Array<{ id: string; name: string; error: string; dependencies?: any[] }> = [];
    const successful: string[] = [];

    // Check dependencies for each component
    for (const componentId of componentIds) {
      const componentStmt = db.prepare('SELECT * FROM components WHERE id = ?');
      const component = componentStmt.get(componentId) as any;
      
      if (!component) {
        errors.push({
          id: componentId,
          name: 'Unknown',
          error: 'Component not found'
        });
        continue;
      }

      // Check if component is used in any projects
      const projectUsageStmt = db.prepare(`
        SELECT COUNT(*) as count, GROUP_CONCAT(p.name, ', ') as project_names 
        FROM project_components pc 
        JOIN projects p ON pc.project_id = p.id 
        WHERE pc.component_id = ?
      `);
      const projectResult = projectUsageStmt.get(componentId) as { count: number; project_names: string };

      if (projectResult.count > 0) {
        errors.push({
          id: componentId,
          name: component.name,
          error: 'Component used in projects',
          dependencies: [{
            type: 'projects',
            count: projectResult.count,
            items: projectResult.project_names?.split(', ') || []
          }]
        });
        continue;
      }

      // Safe to delete
      try {
        const deleteStmt = db.prepare('DELETE FROM components WHERE id = ?');
        const result = deleteStmt.run(componentId);
        
        if (result.changes > 0) {
          successful.push(componentId);
        } else {
          errors.push({
            id: componentId,
            name: component.name,
            error: 'Failed to delete component'
          });
        }
      } catch (deleteError) {
        errors.push({
          id: componentId,
          name: component.name,
          error: 'Database error during deletion'
        });
      }
    }

    res.json({
      deleted: successful,
      failed: errors,
      summary: {
        total: componentIds.length,
        deleted: successful.length,
        failed: errors.length
      }
    });

  } catch (error) {
    console.error('Error in bulk delete components:', error);
    res.status(500).json({ error: 'Failed to process bulk delete' });
  }
});

// Check dependencies for components (for preview before delete)
router.post('/check-dependencies', validateSchema(schemas.bulkDelete), (req, res) => {
  try {
    const { componentIds } = req.body;
    
    if (!Array.isArray(componentIds)) {
      return res.status(400).json({ error: 'componentIds must be an array' });
    }

    const results = componentIds.map(componentId => {
      const componentStmt = db.prepare('SELECT * FROM components WHERE id = ?');
      const component = componentStmt.get(componentId) as any;
      
      if (!component) {
        return {
          id: componentId,
          name: 'Unknown',
          canDelete: false,
          dependencies: [],
          error: 'Component not found'
        };
      }

      const dependencies = [];

      // Check project usage
      const projectUsageStmt = db.prepare(`
        SELECT COUNT(*) as count, GROUP_CONCAT(p.name, ', ') as project_names 
        FROM project_components pc 
        JOIN projects p ON pc.project_id = p.id 
        WHERE pc.component_id = ?
      `);
      const projectResult = projectUsageStmt.get(componentId) as { count: number; project_names: string };
      
      if (projectResult.count > 0) {
        dependencies.push({
          type: 'projects',
          count: projectResult.count,
          items: projectResult.project_names?.split(', ').slice(0, 5) || []
        });
      }

      return {
        id: componentId,
        name: component.name,
        canDelete: dependencies.length === 0,
        dependencies
      };
    });

    res.json(results);
  } catch (error) {
    console.error('Error checking component dependencies:', error);
    res.status(500).json({ error: 'Failed to check dependencies' });
  }
});

// Generate QR codes for components
router.get('/qr-codes/pdf', (req, res) => {
  try {
    // Parse and validate size parameter
    const sizeParam = req.query.size as string;
    const validSizes = ['tiny', 'small', 'medium', 'large'] as const;
    const qrSize = validSizes.includes(sizeParam as any) ? sizeParam as 'tiny' | 'small' | 'medium' | 'large' : 'small';
    
    // Parse component IDs parameter if provided
    const componentIdsParam = req.query.componentIds as string;
    let whereClause = 'WHERE generate_qr = 1';
    let queryParams: any[] = [];
    
    if (componentIdsParam) {
      const componentIds = componentIdsParam.split(',').map(id => id.trim()).filter(id => id);
      if (componentIds.length > 0) {
        const placeholders = componentIds.map(() => '?').join(',');
        whereClause += ` AND id IN (${placeholders})`;
        queryParams = componentIds;
      }
    }
    
    const stmt = db.prepare(`
      SELECT * FROM components 
      ${whereClause}
      ORDER BY category ASC, name ASC
    `);
    const rows = queryParams.length > 0 ? stmt.all(...queryParams) : stmt.all();
    
    if (rows.length === 0) {
      return res.status(404).json({ 
        error: 'No components with QR generation enabled found',
        details: ['Enable QR generation for components or check your selection']
      });
    }

    const components = rows.map(mapComponentRow);
    
    // Generate HTML with QR codes for printing with specified size
    const html = generateComponentQRCodeHTML(components, qrSize);
    
    const filename = componentIdsParam ? 
      `component-qr-codes-selected-${qrSize}-${new Date().toISOString().split('T')[0]}.html` :
      `component-qr-codes-${qrSize}-${new Date().toISOString().split('T')[0]}.html`;
    
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.send(html);

  } catch (error) {
    console.error('Error generating component QR codes:', error);
    res.status(500).json({ error: 'Failed to generate component QR codes' });
  }
});

// Generate mixed-size QR codes for components
router.get('/qr-codes/pdf/mixed', (req, res) => {
  try {
    // Parse component IDs parameter (required for mixed generation)
    const componentIdsParam = req.query.componentIds as string;
    
    if (!componentIdsParam) {
      return res.status(400).json({ 
        error: 'Component IDs are required for mixed-size QR generation',
        details: ['Provide componentIds parameter with comma-separated component IDs']
      });
    }

    const componentIds = componentIdsParam.split(',').map(id => id.trim()).filter(id => id);
    
    if (componentIds.length === 0) {
      return res.status(400).json({ 
        error: 'Valid component IDs are required',
        details: ['Provide at least one valid component ID']
      });
    }

    // Query for specified components that have QR generation enabled
    const placeholders = componentIds.map(() => '?').join(',');
    const stmt = db.prepare(`
      SELECT * FROM components 
      WHERE generate_qr = 1 AND id IN (${placeholders})
      ORDER BY qr_size ASC, name ASC
    `);
    const rows = stmt.all(...componentIds);
    
    if (rows.length === 0) {
      return res.status(404).json({ 
        error: 'No components with QR generation enabled found for the specified IDs',
        details: ['Ensure the selected components have QR generation enabled']
      });
    }

    const components = rows.map(mapComponentRow);
    
    // Generate mixed-size HTML with QR codes grouped by size
    const html = generateMixedSizeComponentQRCodeHTML(components);
    
    const filename = `component-qr-codes-mixed-${new Date().toISOString().split('T')[0]}.html`;
    
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.send(html);

  } catch (error) {
    console.error('Error generating mixed-size component QR codes:', error);
    res.status(500).json({ error: 'Failed to generate mixed-size component QR codes' });
  }
});

export default router;