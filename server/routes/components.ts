import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import db, { addComponentHistory } from '../database';
import { Component, SearchFilters } from '../../src/types';
import { validateSchema, validateQuery, validateParams, schemas, rateLimit } from '../middleware/validation';
import { generateComponentQRCodeHTML, generateMixedSizeComponentQRCodeHTML } from '../utils/htmlQR';

const router = express.Router();

// Helper function to get calculated costs for components from orders.
//
// Quantity values multiply by order_items.pack_size (COALESCE to 1 for legacy
// rows) so a qty-1 order of "10 PCS Jumper Wire" contributes 10 physical
// units of inventory, not 1.
//
// Cancelled and returned orders are excluded outright — cancelled never
// delivered and returned was refunded, neither counts toward stock or value.
//
// Cost values:
//   total_value   = SUM(oi.total_cost) for delivered  (listing-level cost)
//   available_qty = SUM(oi.quantity × pack_size) for delivered  (physical units)
//   average_unit_cost = total_value / available_qty  (per physical unit,
//   weighted by pack contribution — matches the "pack of N, $X/unit"
//   surface in the order detail view).
const getComponentCalculatedCosts = (componentIds: string[]) => {
  if (componentIds.length === 0) return new Map();

  const placeholders = componentIds.map(() => '?').join(',');
  const costs = db.prepare(`
    SELECT
      oi.component_id,
      COUNT(DISTINCT o.id) as order_count,
      SUM(CASE WHEN o.status = 'delivered' THEN oi.quantity * COALESCE(oi.pack_size, 1) ELSE 0 END) as available_quantity,
      SUM(CASE WHEN o.status IN ('pending', 'ordered', 'shipped') THEN oi.quantity * COALESCE(oi.pack_size, 1) ELSE 0 END) as pending_quantity,
      SUM(CASE WHEN o.status NOT IN ('cancelled', 'returned') THEN oi.quantity * COALESCE(oi.pack_size, 1) ELSE 0 END) as total_quantity,
      SUM(CASE WHEN o.status = 'delivered' THEN oi.total_cost ELSE 0 END) as total_value,
      -- Pre-discount list total for delivered orders. Uses list_unit_cost
      -- (preserved at import time) when present, else unit_cost — so
      -- orders imported before list_unit_cost existed still contribute.
      SUM(CASE WHEN o.status = 'delivered' THEN oi.quantity * COALESCE(oi.list_unit_cost, oi.unit_cost) ELSE 0 END) as total_list_value,
      MAX(CASE WHEN o.status = 'delivered' THEN o.order_date ELSE NULL END) as last_order_date,
      MAX(CASE WHEN o.status NOT IN ('cancelled', 'returned') THEN o.order_date ELSE NULL END) as last_acquired_at
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    WHERE oi.component_id IN (${placeholders})
    GROUP BY oi.component_id
  `).all(componentIds) as any[];

  const costsMap = new Map();
  for (const cost of costs) {
    const availableQty = cost.available_quantity || 0;
    const totalValue = cost.total_value || 0;
    const totalListValue = cost.total_list_value || 0;
    const averageUnitCost = availableQty > 0 ? totalValue / availableQty : undefined;
    const averageListUnitCost = availableQty > 0 && totalListValue > 0
      ? totalListValue / availableQty
      : undefined;
    costsMap.set(cost.component_id, {
      orderCount: cost.order_count,
      availableQuantity: availableQty,
      pendingQuantity: cost.pending_quantity > 0 ? cost.pending_quantity : undefined,
      totalQuantity: cost.total_quantity || 0,
      averageUnitCost,
      // Pre-discount per-physical-unit cost. undefined when we have no
      // list-price data (all rows import-only, no discount ever recorded),
      // or when it equals the paid cost (nothing to display differently).
      averageListUnitCost: averageListUnitCost && averageListUnitCost > (averageUnitCost || 0) + 0.0001
        ? averageListUnitCost
        : undefined,
      totalValue,
      totalListValue: totalListValue > totalValue + 0.01 ? totalListValue : undefined,
      lastOrderDate: cost.last_order_date,
      lastAcquiredAt: cost.last_acquired_at,
    });
  }
  return costsMap;
};

// Helper function to convert database row to API format with calculated costs
const mapComponentRow = (row: any, calculatedCosts?: any): Component => {
  const storedQuantity = Number(row.quantity) || 0;
  const pendingQuantity = calculatedCosts?.pendingQuantity || 0;

  // Automatically set status based on availability.
  let status = row.status;
  if (storedQuantity > 0) {
    status = 'available';
  } else if (pendingQuantity > 0) {
    status = 'on_order';
  } else {
    status = 'needs_testing';
  }

  // Fall back to the calculated per-physical-unit cost from delivered orders
  // when the row has no stored unit_cost (imports write to components.quantity
  // directly, but unit_cost on legacy rows is often null).
  const storedUnitCost = Number.isFinite(Number(row.unit_cost)) && Number(row.unit_cost) > 0
    ? Number(row.unit_cost)
    : undefined;

  return {
    ...row,
    // Map database field names to camelCase API field names
    partNumber: row.part_number,
    packageType: row.package_type,
    pinCount: row.pin_count,
    minThreshold: row.min_threshold,
    // Prefer the user-editable stored values; orders are the default but
    // manual edits via the component form always win (they overwrite
    // components.quantity / components.unit_cost directly).
    unitCost: storedUnitCost ?? calculatedCosts?.averageUnitCost,
    listUnitCost: calculatedCosts?.averageListUnitCost,
    totalCost: Number.isFinite(Number(row.total_cost)) && Number(row.total_cost) > 0
      ? Number(row.total_cost)
      : calculatedCosts?.totalValue,
    listTotalCost: calculatedCosts?.totalListValue,
    // On-order counter is derived from live order statuses; it's informational
    // only and never replaces stored quantity.
    totalQuantity: calculatedCosts?.totalQuantity || 0,
    onOrderQuantity: calculatedCosts?.pendingQuantity > 0 ? calculatedCosts?.pendingQuantity : undefined,
    quantity: storedQuantity,
    status,
    locationId: row.location_id,
    datasheetUrl: row.datasheet_url,
    imageUrl: row.image_url,
    // Prefer the most recent active-order date (pending / ordered / shipped /
    // delivered) so the UI can sort "most recently acquired" even when the
    // items haven't been marked delivered yet. Falls back to delivered-only
    // date and then the legacy stored column.
    purchaseDate: calculatedCosts?.lastAcquiredAt || calculatedCosts?.lastOrderDate || row.purchase_date,
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
  } as Component;
};

// Apply rate limiting to all routes - minimum 100 requests per minute
router.use(rateLimit(300, 1 * 60 * 1000)); // 300 requests per minute

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
    const explicitSortBy = (req.query.sortBy as string | undefined);
    const sortBy = explicitSortBy || 'name';
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

    // Default ordering: most-recently-acquired first. "Acquired" = the
    // latest order_date among this component's active (non-cancelled /
    // non-returned) orders. Falls back to component.createdAt for rows
    // with no qualifying orders. Only applied when the caller didn't
    // request an explicit sortBy — preserves any user-picked sort.
    if (!explicitSortBy) {
      const acquiredAt = (c: any, row: any) => {
        const costs = calculatedCosts.get(row.id);
        const raw = costs?.lastAcquiredAt || c.purchaseDate || c.createdAt;
        const t = raw ? new Date(raw).getTime() : 0;
        return Number.isFinite(t) ? t : 0;
      };
      const withAcquired = components.map((c, i) => ({ c, t: acquiredAt(c, rows[i]) }));
      withAcquired.sort((a, b) => {
        const diff = b.t - a.t;
        if (diff !== 0) return diff;
        return String(a.c.name || '').localeCompare(String(b.c.name || ''));
      });
      components.length = 0;
      components.push(...withAcquired.map(x => x.c));
    }

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
    console.log('POST /api/components - Request received:', JSON.stringify(req.body, null, 2));
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
      component.protocols ? JSON.stringify(component.protocols) : null,
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

// Get orders for a specific component
router.get('/:id/orders', validateParams(['id']), (req, res) => {
  try {
    const { id } = req.params;
    
    // Get orders containing this component with details
    const orders = db.prepare(`
      SELECT 
        o.id,
        o.order_date,
        o.supplier,
        o.order_number,
        o.status,
        o.total_amount,
        oi.quantity,
        oi.unit_cost,
        oi.total_cost
      FROM orders o
      JOIN order_items oi ON o.id = oi.order_id
      WHERE oi.component_id = ?
      ORDER BY o.order_date DESC
    `).all(id) as any[];

    // Transform the data to include order item details
    const ordersWithDetails = orders.map((row: any) => ({
      id: row.id,
      orderDate: row.order_date,
      supplier: row.supplier || 'Unknown',
      orderNumber: row.order_number,
      status: row.status,
      totalAmount: row.total_amount,
      // Component-specific order details
      componentQuantity: row.quantity,
      componentUnitCost: row.unit_cost,
      componentTotalCost: row.total_cost
    }));

    res.json(ordersWithDetails);
  } catch (error) {
    console.error('Error fetching component orders:', error);
    res.status(500).json({ error: 'Failed to fetch component orders' });
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