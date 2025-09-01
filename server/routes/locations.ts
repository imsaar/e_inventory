import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../database';
import { validateSchema, validateParams, schemas, rateLimit } from '../middleware/validation';
import { StorageLocation } from '../../src/types';
import { generateQRCodeHTML } from '../utils/htmlQR';

const router = express.Router();

// Apply rate limiting to all routes
router.use(rateLimit(200, 15 * 60 * 1000)); // 200 requests per 15 minutes

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
  photoUrl: row.photo_url,
  tags: row.tags ? JSON.parse(row.tags) : [],
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
        coordinates_x, coordinates_y, coordinates_z, photo_url, tags, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      location.photoUrl || null,
      location.tags ? JSON.stringify(location.tags) : null,
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
        photo_url = COALESCE(?, photo_url),
        tags = COALESCE(?, tags),
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
      updates.photoUrl,
      updates.tags ? JSON.stringify(updates.tags) : undefined,
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
router.delete('/:id', validateParams(['id']), (req, res) => {
  try {
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

// Bulk delete locations
router.post('/bulk-delete', (req, res) => {
  try {
    const { locationIds } = req.body;
    
    if (!Array.isArray(locationIds) || locationIds.length === 0) {
      return res.status(400).json({ error: 'No locations specified for deletion' });
    }

    const deleted: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];

    for (const locationId of locationIds) {
      try {
        const stmt = db.prepare('DELETE FROM storage_locations WHERE id = ?');
        const result = stmt.run(locationId);
        
        if (result.changes > 0) {
          deleted.push(locationId);
        } else {
          failed.push({ id: locationId, error: 'Location not found' });
        }
      } catch (error) {
        failed.push({ id: locationId, error: 'Database error during deletion' });
      }
    }

    res.json({
      deleted,
      failed,
      summary: {
        total: locationIds.length,
        deleted: deleted.length,
        failed: failed.length
      }
    });

  } catch (error) {
    console.error('Error in bulk delete locations:', error);
    res.status(500).json({ error: 'Failed to process bulk delete' });
  }
});

// Generate QR codes PDF for locations
router.get('/qr-codes/pdf', (req, res) => {
  try {
    // Parse and validate size parameter
    const sizeParam = req.query.size as string;
    const validSizes = ['small', 'medium', 'large'] as const;
    const qrSize = validSizes.includes(sizeParam as any) ? sizeParam as 'small' | 'medium' | 'large' : 'medium';
    
    // Parse location IDs parameter if provided
    const locationIdsParam = req.query.locationIds as string;
    let whereClause = 'WHERE qr_code IS NOT NULL AND qr_code != \'\'';
    let queryParams: any[] = [];
    
    if (locationIdsParam) {
      const locationIds = locationIdsParam.split(',').map(id => id.trim()).filter(id => id);
      if (locationIds.length > 0) {
        const placeholders = locationIds.map(() => '?').join(',');
        whereClause += ` AND id IN (${placeholders})`;
        queryParams = locationIds;
      }
    }
    
    const stmt = db.prepare(`
      SELECT * FROM storage_locations 
      ${whereClause}
      ORDER BY name ASC
    `);
    const rows = queryParams.length > 0 ? stmt.all(...queryParams) : stmt.all();
    
    if (rows.length === 0) {
      return res.status(404).json({ 
        error: 'No locations with QR codes found',
        details: ['Create locations with QR codes first, or check your selection']
      });
    }

    const locations = rows.map(mapLocationRow);
    
    // Generate HTML with QR codes for printing with specified size
    const html = generateQRCodeHTML(locations, qrSize);
    
    const filename = locationIdsParam ? 
      `location-qr-codes-selected-${qrSize}-${new Date().toISOString().split('T')[0]}.html` :
      `location-qr-codes-${qrSize}-${new Date().toISOString().split('T')[0]}.html`;
    
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.send(html);

  } catch (error) {
    console.error('Error generating QR codes PDF:', error);
    res.status(500).json({ error: 'Failed to generate QR codes PDF' });
  }
});

export default router;
