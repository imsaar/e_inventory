import express from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import archiver from 'archiver';
import extractZip from 'extract-zip';
import { rateLimit } from '../middleware/validation';
import db from '../database';

const router = express.Router();

// Apply rate limiting for database operations
// Only rate limit info requests to prevent abuse
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

// Configure multer for zip file uploads
const uploadZip = multer({
  dest: path.join(process.cwd(), 'temp'),
  limits: {
    fileSize: 500 * 1024 * 1024 // 500MB limit for zip files
  },
  fileFilter: (req, file, cb) => {
    // Only accept .zip files
    if (file.originalname.endsWith('.zip') || file.mimetype === 'application/zip') {
      cb(null, true);
    } else {
      cb(new Error('Only .zip files are allowed'));
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
      details: [
        'Database has been restored successfully',
        'IMPORTANT: Please restart both server and client to ensure all changes take effect'
      ]
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

// Export all data (database + uploads) as zip file
router.get('/export-all', async (req, res) => {
  try {
    const dbPath = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'inventory-dev.db');
    const uploadsPath = path.join(process.cwd(), 'uploads');
    const timestamp = new Date().toISOString().split('T')[0];
    const zipFilename = `inventory-full-backup-${timestamp}.zip`;
    
    // Check if database file exists
    if (!fs.existsSync(dbPath)) {
      return res.status(404).json({ error: 'Database file not found' });
    }
    
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipFilename}"`);
    
    // Create zip archive
    const archive = archiver('zip', { zlib: { level: 9 } });
    
    archive.on('error', (error) => {
      console.error('Archive error:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to create backup archive' });
      }
    });
    
    archive.pipe(res);
    
    // Add database file
    archive.file(dbPath, { name: 'inventory.db' });
    
    // Add uploads directory if it exists
    if (fs.existsSync(uploadsPath)) {
      archive.directory(uploadsPath, 'uploads');
    }
    
    // Add metadata file
    const metadata = {
      exportDate: new Date().toISOString(),
      version: '1.0',
      description: 'Electronics Inventory Full Backup',
      contents: [
        'inventory.db - Main SQLite database',
        'uploads/ - User uploaded files (images, documents)'
      ]
    };
    
    archive.append(JSON.stringify(metadata, null, 2), { name: 'backup-info.json' });
    
    await archive.finalize();
    console.log(`Full backup exported successfully as ${zipFilename}`);
    
  } catch (error) {
    console.error('Error exporting full backup:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to export full backup' });
    }
  }
});

// Import all data from zip file
router.post('/import-all', uploadZip.single('backup'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No backup file provided' });
    }
    
    const uploadedZipPath = req.file.path;
    const extractPath = path.join(process.cwd(), 'temp', `extract-${Date.now()}`);
    const dbPath = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'inventory-dev.db');
    const uploadsPath = path.join(process.cwd(), 'uploads');
    
    // Create extraction directory
    if (!fs.existsSync(extractPath)) {
      fs.mkdirSync(extractPath, { recursive: true });
    }
    
    // Extract zip file
    await extractZip(uploadedZipPath, { dir: extractPath });
    
    // Validate backup contents
    const extractedDbPath = path.join(extractPath, 'inventory.db');
    const extractedUploadsPath = path.join(extractPath, 'uploads');
    const metadataPath = path.join(extractPath, 'backup-info.json');
    
    if (!fs.existsSync(extractedDbPath)) {
      // Clean up
      fs.rmSync(extractPath, { recursive: true, force: true });
      fs.unlinkSync(uploadedZipPath);
      return res.status(400).json({ 
        error: 'Invalid backup file', 
        details: ['Backup must contain inventory.db file'] 
      });
    }
    
    // Validate database file
    const Database = require('better-sqlite3');
    let testDb;
    
    try {
      testDb = new Database(extractedDbPath, { readonly: true });
      
      // Basic validation - check if it has expected tables
      const tables = testDb.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
      const tableNames = tables.map((t: any) => t.name);
      
      const requiredTables = ['components', 'storage_locations', 'projects'];
      const hasRequiredTables = requiredTables.every(table => tableNames.includes(table));
      
      if (!hasRequiredTables) {
        testDb.close();
        // Clean up
        fs.rmSync(extractPath, { recursive: true, force: true });
        fs.unlinkSync(uploadedZipPath);
        return res.status(400).json({ 
          error: 'Invalid database file', 
          details: ['Database must contain required tables: components, storage_locations, projects'] 
        });
      }
      
      testDb.close();
    } catch (validationError) {
      if (testDb) testDb.close();
      // Clean up
      fs.rmSync(extractPath, { recursive: true, force: true });
      fs.unlinkSync(uploadedZipPath);
      return res.status(400).json({ 
        error: 'Invalid database file', 
        details: ['File is not a valid SQLite database'] 
      });
    }
    
    // Create backups of current data
    const backupTimestamp = Date.now();
    if (fs.existsSync(dbPath)) {
      const dbBackupPath = `${dbPath}.backup-${backupTimestamp}`;
      fs.copyFileSync(dbPath, dbBackupPath);
      console.log(`Current database backed up to: ${dbBackupPath}`);
    }
    
    if (fs.existsSync(uploadsPath)) {
      const uploadsBackupPath = `${uploadsPath}-backup-${backupTimestamp}`;
      fs.cpSync(uploadsPath, uploadsBackupPath, { recursive: true });
      console.log(`Current uploads backed up to: ${uploadsBackupPath}`);
    }
    
    // Close current database connection
    db.close();
    
    // Replace database
    fs.copyFileSync(extractedDbPath, dbPath);
    
    // Replace uploads directory
    if (fs.existsSync(uploadsPath)) {
      fs.rmSync(uploadsPath, { recursive: true, force: true });
    }
    if (fs.existsSync(extractedUploadsPath)) {
      fs.mkdirSync(path.dirname(uploadsPath), { recursive: true });
      fs.cpSync(extractedUploadsPath, uploadsPath, { recursive: true });
    }
    
    // Clean up
    fs.rmSync(extractPath, { recursive: true, force: true });
    fs.unlinkSync(uploadedZipPath);
    
    res.json({ 
      message: 'Full backup imported successfully',
      details: [
        'Database and uploads have been restored successfully',
        'IMPORTANT: Please restart both server and client to ensure all changes take effect'
      ]
    });
    
    // Exit process to trigger nodemon restart in development
    setTimeout(() => {
      console.log('Restarting application to load restored data...');
      process.exit(0);
    }, 1000);
    
  } catch (error) {
    console.error('Error importing full backup:', error);
    
    // Clean up uploaded file if it exists
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({ error: 'Failed to import full backup' });
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

// DELETE /api/database/factory-reset - Factory reset (wipe all data)
router.delete('/factory-reset', (req, res) => {
  try {
    // Drop all tables and recreate them fresh
    const dropAndRecreate = db.transaction(() => {
      // Drop all tables in reverse dependency order
      db.exec('DROP TABLE IF EXISTS component_history');
      db.exec('DROP TABLE IF EXISTS project_components');
      db.exec('DROP TABLE IF EXISTS order_items');
      db.exec('DROP TABLE IF EXISTS orders');
      db.exec('DROP TABLE IF EXISTS boms');
      db.exec('DROP TABLE IF EXISTS components');
      db.exec('DROP TABLE IF EXISTS projects');
      db.exec('DROP TABLE IF EXISTS storage_locations');
      db.exec('DROP TABLE IF EXISTS users');
      
      // Recreate all tables with fresh schema
      db.exec(`
        CREATE TABLE users (
          id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
          username TEXT UNIQUE NOT NULL,
          email TEXT,
          password_hash TEXT NOT NULL,
          role TEXT DEFAULT 'user',
          is_active BOOLEAN DEFAULT 1,
          last_login DATETIME,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE storage_locations (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          type TEXT NOT NULL DEFAULT 'box',
          parent_id TEXT,
          description TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (parent_id) REFERENCES storage_locations(id) ON DELETE CASCADE
        );

        CREATE TABLE components (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          manufacturer TEXT,
          part_number TEXT,
          category TEXT NOT NULL,
          subcategory TEXT,
          quantity INTEGER NOT NULL DEFAULT 0,
          min_threshold INTEGER DEFAULT 0,
          unit_cost REAL DEFAULT 0,
          total_cost REAL DEFAULT 0,
          location_id TEXT,
          datasheet_url TEXT,
          image_url TEXT,
          package_type TEXT,
          status TEXT DEFAULT 'available',
          tags TEXT,
          specifications TEXT,
          notes TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (location_id) REFERENCES storage_locations(id)
        );

        CREATE TABLE projects (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          status TEXT DEFAULT 'planning',
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE project_components (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          component_id TEXT NOT NULL,
          quantity INTEGER NOT NULL DEFAULT 1,
          notes TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
          FOREIGN KEY (component_id) REFERENCES components(id) ON DELETE CASCADE
        );

        CREATE TABLE orders (
          id TEXT PRIMARY KEY,
          order_date TEXT NOT NULL,
          supplier TEXT,
          order_number TEXT,
          supplier_order_id TEXT,
          notes TEXT,
          total_amount REAL,
          import_source TEXT,
          import_date TEXT,
          original_data TEXT,
          status TEXT CHECK(status IN ('pending', 'ordered', 'shipped', 'delivered', 'cancelled')) DEFAULT 'delivered',
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE order_items (
          id TEXT PRIMARY KEY,
          order_id TEXT NOT NULL,
          component_id TEXT,
          product_title TEXT,
          product_url TEXT,
          product_sku TEXT,
          image_url TEXT,
          local_image_path TEXT,
          quantity INTEGER NOT NULL,
          unit_cost REAL NOT NULL,
          total_cost REAL GENERATED ALWAYS AS (quantity * unit_cost) STORED,
          currency TEXT DEFAULT 'USD',
          specifications TEXT,
          variation TEXT,
          notes TEXT,
          import_confidence REAL DEFAULT 1.0,
          manual_review INTEGER DEFAULT 0,
          FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
          FOREIGN KEY (component_id) REFERENCES components(id) ON DELETE SET NULL
        );

        CREATE TABLE component_history (
          id TEXT PRIMARY KEY,
          component_id TEXT NOT NULL,
          action TEXT NOT NULL,
          old_quantity INTEGER,
          new_quantity INTEGER,
          notes TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (component_id) REFERENCES components(id) ON DELETE CASCADE
        );

        CREATE TABLE boms (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          version TEXT NOT NULL DEFAULT '1.0',
          description TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        );
      `);
      
      // Enable foreign keys
      db.exec('PRAGMA foreign_keys = ON');
    });

    dropAndRecreate();

    // Delete all uploaded images
    const uploadsPath = path.join(process.cwd(), 'public', 'uploads');
    if (fs.existsSync(uploadsPath)) {
      const files = fs.readdirSync(uploadsPath);
      for (const file of files) {
        const filePath = path.join(uploadsPath, file);
        if (fs.statSync(filePath).isFile()) {
          fs.unlinkSync(filePath);
        }
      }
    }

    res.json({
      success: true,
      message: 'Factory reset completed successfully. All tables recreated and files deleted.'
    });
  } catch (error) {
    console.error('Error performing factory reset:', error);
    res.status(500).json({ error: 'Failed to perform factory reset' });
  }
});

export default router;