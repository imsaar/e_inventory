import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../database';
import { StorageLocation } from '../../src/types';

const router = express.Router();

// Helper function to convert database row to API format
const mapLocationRow = (row: any): StorageLocation => ({
  id: row.id,
  name: row.name,
  type: row.type,
  parentId: row.parent_id,
  description: row.description,
  qrCode: row.qr_code,
  coordinates: row.coordinates_x ? {
    x: row.coordinates_x,
    y: row.coordinates_y,
    z: row.coordinates_z
  } : undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

// Get all storage locations in hierarchical structure
router.get('/', (req, res) => {
  try {
    const stmt = db.prepare('SELECT * FROM storage_locations ORDER BY name ASC');
    const rows = stmt.all();
    const locations = rows.map(mapLocationRow);
    
    // Build hierarchical structure
    const locationMap = new Map<string, StorageLocation & { children: StorageLocation[] }>();
    const rootLocations: (StorageLocation & { children: StorageLocation[] })[] = [];
    
    // First pass: create map with children arrays
    locations.forEach(location => {
      locationMap.set(location.id, { ...location, children: [] });
    });
    
    // Second pass: build hierarchy
    locations.forEach(location => {
      const locationWithChildren = locationMap.get(location.id)!;
      
      if (location.parentId) {
        const parent = locationMap.get(location.parentId);
        if (parent) {
          parent.children.push(locationWithChildren);
        }
      } else {
        rootLocations.push(locationWithChildren);
      }
    });
    
    res.json(rootLocations);
  } catch (error) {
    console.error('Error fetching locations:', error);
    res.status(500).json({ error: 'Failed to fetch locations' });
  }
});

// Get location by ID with full path
router.get('/:id', (req, res) => {
  try {
    const stmt = db.prepare('SELECT * FROM storage_locations WHERE id = ?');
    const row = stmt.get(req.params.id);
    
    if (!row) {
      return res.status(404).json({ error: 'Location not found' });
    }

    const location = mapLocationRow(row);

    // Build full path
    const path: StorageLocation[] = [];
    let current: any = row;
    
    while (current) {
      path.unshift(mapLocationRow(current));
      if (current.parent_id) {
        const parentStmt = db.prepare('SELECT * FROM storage_locations WHERE id = ?');
        current = parentStmt.get(current.parent_id);
      } else {
        current = null;
      }
    }

    res.json({ ...location, fullPath: path });
  } catch (error) {
    console.error('Error fetching location:', error);
    res.status(500).json({ error: 'Failed to fetch location' });
  }
});

// Create new storage location
router.post('/', (req, res) => {
  try {
    const location: Partial<StorageLocation> = req.body;
    const id = uuidv4();
    const now = new Date().toISOString();

    // Generate QR code if requested
    let qrCode = location.qrCode;
    if (!qrCode && req.body.generateQR) {
      qrCode = `LOC-${id.slice(-8).toUpperCase()}`;
    }

    const stmt = db.prepare(`
      INSERT INTO storage_locations (
        id, name, type, parent_id, description, qr_code,
        coordinates_x, coordinates_y, coordinates_z, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      location.name,
      location.type,
      location.parentId || null,
      location.description || null,
      qrCode || null,
      location.coordinates?.x || null,
      location.coordinates?.y || null,
      location.coordinates?.z || null,
      now,
      now
    );

    // Fetch the created location to return proper format
    const createdStmt = db.prepare('SELECT * FROM storage_locations WHERE id = ?');
    const createdRow = createdStmt.get(id);
    const newLocation = mapLocationRow(createdRow);

    res.status(201).json(newLocation);
  } catch (error) {
    console.error('Error creating location:', error);
    res.status(500).json({ error: 'Failed to create location' });
  }
});

// Update storage location
router.put('/:id', (req, res) => {
  try {
    const locationId = req.params.id;
    const updates: Partial<StorageLocation> = req.body;
    const now = new Date().toISOString();

    const stmt = db.prepare(`
      UPDATE storage_locations SET
        name = COALESCE(?, name),
        type = COALESCE(?, type),
        parent_id = COALESCE(?, parent_id),
        description = COALESCE(?, description),
        qr_code = COALESCE(?, qr_code),
        coordinates_x = COALESCE(?, coordinates_x),
        coordinates_y = COALESCE(?, coordinates_y),
        coordinates_z = COALESCE(?, coordinates_z),
        updated_at = ?
      WHERE id = ?
    `);

    const result = stmt.run(
      updates.name,
      updates.type,
      updates.parentId,
      updates.description,
      updates.qrCode,
      updates.coordinates?.x,
      updates.coordinates?.y,
      updates.coordinates?.z,
      now,
      locationId
    );

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Location not found' });
    }

    // Fetch the updated location to return proper format
    const updatedStmt = db.prepare('SELECT * FROM storage_locations WHERE id = ?');
    const updatedRow = updatedStmt.get(locationId);
    const updatedLocation = mapLocationRow(updatedRow);

    res.json(updatedLocation);
  } catch (error) {
    console.error('Error updating location:', error);
    res.status(500).json({ error: 'Failed to update location' });
  }
});

// Delete storage location
router.delete('/:id', (req, res) => {
  try {
    // Check if location has components
    const componentsStmt = db.prepare('SELECT COUNT(*) as count FROM components WHERE location_id = ?');
    const componentCount = componentsStmt.get(req.params.id) as { count: number };
    
    if (componentCount.count > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete location with components. Move components first.' 
      });
    }

    // Check if location has children
    const childrenStmt = db.prepare('SELECT COUNT(*) as count FROM storage_locations WHERE parent_id = ?');
    const childCount = childrenStmt.get(req.params.id) as { count: number };
    
    if (childCount.count > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete location with child locations. Delete children first.' 
      });
    }

    const stmt = db.prepare('DELETE FROM storage_locations WHERE id = ?');
    const result = stmt.run(req.params.id);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Location not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting location:', error);
    res.status(500).json({ error: 'Failed to delete location' });
  }
});

// Get components in a specific location
router.get('/:id/components', (req, res) => {
  try {
    const stmt = db.prepare('SELECT * FROM components WHERE location_id = ? ORDER BY name ASC');
    const rows = stmt.all(req.params.id);
    
    const components = rows.map((row: any) => ({
      ...row,
      tags: row.tags ? JSON.parse(row.tags) : [],
      protocols: row.protocols ? JSON.parse(row.protocols) : [],
    }));

    res.json(components);
  } catch (error) {
    console.error('Error fetching components in location:', error);
    res.status(500).json({ error: 'Failed to fetch components in location' });
  }
});

// Bulk delete locations with dependency checking
router.post('/bulk-delete', (req, res) => {
  try {
    const { locationIds } = req.body;
    
    if (!Array.isArray(locationIds) || locationIds.length === 0) {
      return res.status(400).json({ error: 'No locations specified for deletion' });
    }

    const errors: Array<{ id: string; name: string; error: string; dependencies?: any[] }> = [];
    const successful: string[] = [];

    // Check dependencies for each location
    for (const locationId of locationIds) {
      const locationStmt = db.prepare('SELECT * FROM storage_locations WHERE id = ?');
      const location = locationStmt.get(locationId) as any;
      
      if (!location) {
        errors.push({
          id: locationId,
          name: 'Unknown',
          error: 'Location not found'
        });
        continue;
      }

      // Check for components in this location
      const componentsStmt = db.prepare('SELECT COUNT(*) as count, GROUP_CONCAT(name, ", ") as names FROM components WHERE location_id = ?');
      const componentResult = componentsStmt.get(locationId) as { count: number; names: string };

      if (componentResult.count > 0) {
        errors.push({
          id: locationId,
          name: location.name,
          error: 'Cannot delete location with components',
          dependencies: [{
            type: 'components',
            count: componentResult.count,
            items: componentResult.names?.split(', ') || []
          }]
        });
        continue;
      }

      // Check for child locations
      const childrenStmt = db.prepare('SELECT COUNT(*) as count, GROUP_CONCAT(name, ", ") as names FROM storage_locations WHERE parent_id = ?');
      const childResult = childrenStmt.get(locationId) as { count: number; names: string };

      if (childResult.count > 0) {
        errors.push({
          id: locationId,
          name: location.name,
          error: 'Cannot delete location with child locations',
          dependencies: [{
            type: 'child_locations',
            count: childResult.count,
            items: childResult.names?.split(', ') || []
          }]
        });
        continue;
      }

      // Safe to delete
      try {
        const deleteStmt = db.prepare('DELETE FROM storage_locations WHERE id = ?');
        const result = deleteStmt.run(locationId);
        
        if (result.changes > 0) {
          successful.push(locationId);
        } else {
          errors.push({
            id: locationId,
            name: location.name,
            error: 'Failed to delete location'
          });
        }
      } catch (deleteError) {
        errors.push({
          id: locationId,
          name: location.name,
          error: 'Database error during deletion'
        });
      }
    }

    res.json({
      successful,
      errors,
      summary: {
        total: locationIds.length,
        deleted: successful.length,
        failed: errors.length
      }
    });

  } catch (error) {
    console.error('Error in bulk delete locations:', error);
    res.status(500).json({ error: 'Failed to process bulk delete' });
  }
});

// Check dependencies for locations (for preview before delete)
router.post('/check-dependencies', (req, res) => {
  try {
    const { locationIds } = req.body;
    
    if (!Array.isArray(locationIds)) {
      return res.status(400).json({ error: 'locationIds must be an array' });
    }

    const results = locationIds.map(locationId => {
      const locationStmt = db.prepare('SELECT * FROM storage_locations WHERE id = ?');
      const location = locationStmt.get(locationId) as any;
      
      if (!location) {
        return {
          id: locationId,
          name: 'Unknown',
          canDelete: false,
          dependencies: [],
          error: 'Location not found'
        };
      }

      const dependencies = [];

      // Check components
      const componentsStmt = db.prepare('SELECT COUNT(*) as count, GROUP_CONCAT(name, ", ") as names FROM components WHERE location_id = ?');
      const componentResult = componentsStmt.get(locationId) as { count: number; names: string };
      
      if (componentResult.count > 0) {
        dependencies.push({
          type: 'components',
          count: componentResult.count,
          items: componentResult.names?.split(', ').slice(0, 5) || [] // Limit to first 5 for display
        });
      }

      // Check child locations
      const childrenStmt = db.prepare('SELECT COUNT(*) as count, GROUP_CONCAT(name, ", ") as names FROM storage_locations WHERE parent_id = ?');
      const childResult = childrenStmt.get(locationId) as { count: number; names: string };
      
      if (childResult.count > 0) {
        dependencies.push({
          type: 'child_locations',
          count: childResult.count,
          items: childResult.names?.split(', ').slice(0, 5) || []
        });
      }

      return {
        id: locationId,
        name: location.name,
        canDelete: dependencies.length === 0,
        dependencies
      };
    });

    res.json(results);
  } catch (error) {
    console.error('Error checking location dependencies:', error);
    res.status(500).json({ error: 'Failed to check dependencies' });
  }
});

export default router;
