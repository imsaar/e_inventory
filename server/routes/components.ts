import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import db, { addComponentHistory } from '../database';
import { Component, SearchFilters } from '../../src/types';

const router = express.Router();

// Get all components with optional filtering
router.get('/', (req, res) => {
  try {
    const filters: SearchFilters = req.query;
    let sql = 'SELECT * FROM components WHERE 1=1';
    const params: any[] = [];

    // Build dynamic WHERE clause based on filters
    if (filters.category) {
      sql += ' AND category = ?';
      params.push(filters.category);
    }
    if (filters.subcategory) {
      sql += ' AND subcategory = ?';
      params.push(filters.subcategory);
    }
    if (filters.manufacturer) {
      sql += ' AND manufacturer LIKE ?';
      params.push(`%${filters.manufacturer}%`);
    }
    if (filters.status) {
      sql += ' AND status = ?';
      params.push(filters.status);
    }
    if (filters.locationId) {
      sql += ' AND location_id = ?';
      params.push(filters.locationId);
    }
    if (filters.minQuantity !== undefined) {
      sql += ' AND quantity >= ?';
      params.push(filters.minQuantity);
    }
    if (filters.maxQuantity !== undefined) {
      sql += ' AND quantity <= ?';
      params.push(filters.maxQuantity);
    }

    // Search in name, part number, and description
    if (req.query.search) {
      sql += ' AND (name LIKE ? OR part_number LIKE ? OR description LIKE ?)';
      const searchTerm = `%${req.query.search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    sql += ' ORDER BY name ASC';

    const stmt = db.prepare(sql);
    const rows = stmt.all(...params) as any[];
    
    // Parse JSON fields
    const components = rows.map((row: any) => ({
      ...row,
      tags: row.tags ? JSON.parse(row.tags) : [],
      dimensions: row.dimensions ? JSON.parse(row.dimensions) : undefined,
      weight: row.weight ? JSON.parse(row.weight) : undefined,
      voltage: row.voltage ? JSON.parse(row.voltage) : undefined,
      current: row.current ? JSON.parse(row.current) : undefined,
      protocols: row.protocols ? JSON.parse(row.protocols) : [],
    }));

    res.json(components);
  } catch (error) {
    console.error('Error fetching components:', error);
    res.status(500).json({ error: 'Failed to fetch components' });
  }
});

// Get component by ID
router.get('/:id', (req, res) => {
  try {
    const stmt = db.prepare('SELECT * FROM components WHERE id = ?');
    const row = stmt.get(req.params.id) as any;
    
    if (!row) {
      return res.status(404).json({ error: 'Component not found' });
    }

    // Parse JSON fields
    const component = {
      ...row,
      tags: row.tags ? JSON.parse(row.tags) : [],
      dimensions: row.dimensions ? JSON.parse(row.dimensions) : undefined,
      weight: row.weight ? JSON.parse(row.weight) : undefined,
      voltage: row.voltage ? JSON.parse(row.voltage) : undefined,
      current: row.current ? JSON.parse(row.current) : undefined,
      protocols: row.protocols ? JSON.parse(row.protocols) : [],
    };

    res.json(component);
  } catch (error) {
    console.error('Error fetching component:', error);
    res.status(500).json({ error: 'Failed to fetch component' });
  }
});

// Create new component
router.post('/', (req, res) => {
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
router.put('/:id', (req, res) => {
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

    res.json({ success: true, updatedAt: now });
  } catch (error) {
    console.error('Error updating component:', error);
    res.status(500).json({ error: 'Failed to update component' });
  }
});

// Delete component
router.delete('/:id', (req, res) => {
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
router.get('/:id/history', (req, res) => {
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
    
    const components = lowStockComponents.map((row: any) => ({
      ...row,
      tags: row.tags ? JSON.parse(row.tags) : [],
      protocols: row.protocols ? JSON.parse(row.protocols) : [],
    }));

    res.json(components);
  } catch (error) {
    console.error('Error fetching low stock components:', error);
    res.status(500).json({ error: 'Failed to fetch low stock components' });
  }
});

// Bulk delete components with dependency checking
router.post('/bulk-delete', (req, res) => {
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
        SELECT COUNT(*) as count, GROUP_CONCAT(p.name, ", ") as project_names 
        FROM project_components pc 
        JOIN projects p ON pc.project_id = p.id 
        WHERE pc.component_id = ?
      `);
      const projectResult = projectUsageStmt.get(componentId) as { count: number; project_names: string };

      if (projectResult.count > 0) {
        errors.push({
          id: componentId,
          name: component.name,
          error: 'Cannot delete component used in projects',
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
      successful,
      errors,
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
router.post('/check-dependencies', (req, res) => {
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
        SELECT COUNT(*) as count, GROUP_CONCAT(p.name, ", ") as project_names 
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

export default router;