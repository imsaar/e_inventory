import express from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { rateLimit } from '../middleware/validation';
import db from '../database';

const router = express.Router();

// Apply rate limiting for database operations
// More restrictive for export/import, but allow info requests
router.use('/export', rateLimit(5, 60 * 60 * 1000)); // 5 exports per hour
router.use('/import', rateLimit(3, 60 * 60 * 1000)); // 3 imports per hour
router.use('/info', rateLimit(30, 5 * 60 * 1000)); // 30 info requests per 5 minutes

// Configure multer for database file uploads
const upload = multer({
  dest: path.join(process.cwd(), 'temp'),
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB limit
  },
  fileFilter: (req, file, cb) => {
    // Only accept .db files
    if (file.originalname.endsWith('.db') || file.mimetype === 'application/x-sqlite3') {
      cb(null, true);
    } else {
      cb(new Error('Only .db files are allowed'));
    }
  }
});

// Export database
router.get('/export', (req, res) => {
  try {
    const dbPath = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'inventory-dev.db');
    
    // Check if database file exists
    if (!fs.existsSync(dbPath)) {
      return res.status(404).json({ error: 'Database file not found' });
    }
    
    // Get database stats
    const stats = fs.statSync(dbPath);
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `inventory-backup-${timestamp}.db`;
    
    res.setHeader('Content-Type', 'application/x-sqlite3');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', stats.size.toString());
    
    // Stream the database file
    const fileStream = fs.createReadStream(dbPath);
    fileStream.pipe(res);
    
    fileStream.on('error', (error) => {
      console.error('Error streaming database file:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to export database' });
      }
    });
    
    fileStream.on('end', () => {
      console.log(`Database exported successfully as ${filename}`);
    });
    
  } catch (error) {
    console.error('Error exporting database:', error);
    res.status(500).json({ error: 'Failed to export database' });
  }
});

// Import database
router.post('/import', upload.single('database'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No database file provided' });
    }
    
    const uploadedPath = req.file.path;
    const dbPath = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'inventory-dev.db');
    const backupPath = `${dbPath}.backup-${Date.now()}`;
    
    // Create backup of current database
    if (fs.existsSync(dbPath)) {
      fs.copyFileSync(dbPath, backupPath);
      console.log(`Current database backed up to: ${backupPath}`);
    }
    
    // Validate the uploaded database file by attempting to open it
    const Database = require('better-sqlite3');
    let testDb;
    
    try {
      testDb = new Database(uploadedPath, { readonly: true });
      
      // Basic validation - check if it has expected tables
      const tables = testDb.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
      const tableNames = tables.map((t: any) => t.name);
      
      const requiredTables = ['components', 'storage_locations', 'projects'];
      const hasRequiredTables = requiredTables.every(table => tableNames.includes(table));
      
      if (!hasRequiredTables) {
        testDb.close();
        fs.unlinkSync(uploadedPath);
        return res.status(400).json({ 
          error: 'Invalid database file', 
          details: ['Database must contain required tables: components, storage_locations, projects'] 
        });
      }
      
      testDb.close();
    } catch (validationError) {
      if (testDb) testDb.close();
      fs.unlinkSync(uploadedPath);
      return res.status(400).json({ 
        error: 'Invalid database file', 
        details: ['File is not a valid SQLite database'] 
      });
    }
    
    // Close current database connection
    db.close();
    
    // Replace current database with uploaded one
    fs.copyFileSync(uploadedPath, dbPath);
    
    // Clean up uploaded file
    fs.unlinkSync(uploadedPath);
    
    res.json({ 
      message: 'Database imported successfully',
      details: ['Application will restart to load the new database']
    });
    
    // Exit process to trigger nodemon restart in development
    setTimeout(() => {
      console.log('Restarting application to load new database...');
      process.exit(0);
    }, 1000);
    
  } catch (error) {
    console.error('Error importing database:', error);
    
    // Clean up uploaded file if it exists
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({ error: 'Failed to import database' });
  }
});

// Get database info
router.get('/info', (req, res) => {
  try {
    const dbPath = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'inventory-dev.db');
    
    if (!fs.existsSync(dbPath)) {
      return res.status(404).json({ error: 'Database file not found' });
    }
    
    const stats = fs.statSync(dbPath);
    
    // Get table counts
    const componentCount = db.prepare('SELECT COUNT(*) as count FROM components').get() as { count: number };
    const locationCount = db.prepare('SELECT COUNT(*) as count FROM storage_locations').get() as { count: number };
    const projectCount = db.prepare('SELECT COUNT(*) as count FROM projects').get() as { count: number };
    
    // Get schema version (fallback if table doesn't exist)
    let schemaVersion = 1;
    try {
      const versionResult = db.prepare('SELECT version FROM schema_version ORDER BY version DESC LIMIT 1').get() as { version: number } | undefined;
      schemaVersion = versionResult?.version || 1;
    } catch (error) {
      // schema_version table might not exist, use default
      schemaVersion = 1;
    }
    
    res.json({
      path: dbPath,
      size: stats.size,
      sizeFormatted: `${(stats.size / 1024 / 1024).toFixed(2)} MB`,
      lastModified: stats.mtime,
      schemaVersion: schemaVersion,
      tables: {
        components: componentCount.count,
        locations: locationCount.count,
        projects: projectCount.count
      }
    });
    
  } catch (error) {
    console.error('Error getting database info:', error);
    res.status(500).json({ error: 'Failed to get database information' });
  }
});

export default router;