import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';

// Determine database path based on environment
const isTest = process.env.NODE_ENV === 'test';
const isDevelopment = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === undefined;
const isProduction = process.env.NODE_ENV === 'production';

// Database configuration based on environment
let dataDir: string;
let dbFilename: string;

if (isTest) {
  dataDir = path.join(__dirname, '../data/test');
  dbFilename = `test-inventory-${Date.now()}.db`; // Unique DB per test run
} else if (isDevelopment) {
  dataDir = path.join(__dirname, '../data');
  dbFilename = 'inventory-dev.db';
} else if (isProduction) {
  dataDir = process.env.DATA_DIR || path.join(__dirname, '../data');
  dbFilename = 'inventory.db';
} else {
  dataDir = path.join(__dirname, '../data');
  dbFilename = 'inventory.db';
}

const dbPath = process.env.DB_PATH || path.join(dataDir, dbFilename);

// Ensure data directory exists
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Log database configuration (not in production)
if (!isProduction) {
  console.log(`Database configuration:
  Environment: ${process.env.NODE_ENV || 'development'}
  Database path: ${dbPath}
  Is test: ${isTest}
  `);
}

const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Schema version for migrations
const CURRENT_SCHEMA_VERSION = 6;

// Initialize database schema
export function initializeDatabase() {
  // Storage locations table
  db.exec(`
    CREATE TABLE IF NOT EXISTS storage_locations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT CHECK(type IN ('room', 'cabinet', 'shelf', 'drawer', 'box', 'compartment')) NOT NULL,
      parent_id TEXT,
      description TEXT,
      qr_code TEXT UNIQUE,
      coordinates_x REAL,
      coordinates_y REAL,
      coordinates_z REAL,
      photo_url TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (parent_id) REFERENCES storage_locations(id) ON DELETE CASCADE
    )
  `);

  // Components table
  db.exec(`
    CREATE TABLE IF NOT EXISTS components (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      part_number TEXT,
      manufacturer TEXT,
      description TEXT,
      category TEXT NOT NULL,
      subcategory TEXT,
      tags TEXT,
      
      -- Physical properties (JSON)
      dimensions TEXT,
      weight TEXT,
      package_type TEXT,
      
      -- Electrical specifications (JSON)
      voltage TEXT,
      current TEXT,
      pin_count INTEGER,
      protocols TEXT,
      
      -- Inventory
      quantity INTEGER NOT NULL DEFAULT 0,
      min_threshold INTEGER NOT NULL DEFAULT 0,
      supplier TEXT,
      purchase_date TEXT,
      unit_cost REAL,
      total_cost REAL,
      
      -- Location and status
      location_id TEXT,
      status TEXT CHECK(status IN ('available', 'in_use', 'reserved', 'needs_testing', 'defective')) DEFAULT 'available',
      
      -- Documentation
      datasheet_url TEXT,
      image_url TEXT,
      notes TEXT,
      
      -- Metadata
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      
      FOREIGN KEY (location_id) REFERENCES storage_locations(id) ON DELETE SET NULL
    )
  `);

  // Projects table
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      status TEXT CHECK(status IN ('planning', 'active', 'completed', 'on_hold')) DEFAULT 'planning',
      start_date TEXT,
      completed_date TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  // Project components junction table
  db.exec(`
    CREATE TABLE IF NOT EXISTS project_components (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      component_id TEXT NOT NULL,
      quantity_used INTEGER NOT NULL,
      notes TEXT,
      added_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (component_id) REFERENCES components(id) ON DELETE CASCADE,
      UNIQUE(project_id, component_id)
    )
  `);

  // Component history table for audit trail
  db.exec(`
    CREATE TABLE IF NOT EXISTS component_history (
      id TEXT PRIMARY KEY,
      component_id TEXT NOT NULL,
      action TEXT CHECK(action IN ('added', 'updated', 'moved', 'used', 'returned', 'tested')) NOT NULL,
      previous_value TEXT,
      new_value TEXT,
      quantity INTEGER,
      project_id TEXT,
      notes TEXT,
      timestamp TEXT NOT NULL,
      FOREIGN KEY (component_id) REFERENCES components(id) ON DELETE CASCADE,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
    )
  `);

  // BOMs table
  db.exec(`
    CREATE TABLE IF NOT EXISTS boms (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      components TEXT NOT NULL, -- JSON array of component requirements
      estimated_cost REAL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    )
  `);

  // Orders table for tracking purchases
  db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      order_date TEXT NOT NULL,
      supplier TEXT,
      order_number TEXT,
      notes TEXT,
      total_amount REAL,
      status TEXT CHECK(status IN ('pending', 'ordered', 'shipped', 'delivered', 'cancelled')) DEFAULT 'delivered',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  // Order items table for component quantities and costs per order
  db.exec(`
    CREATE TABLE IF NOT EXISTS order_items (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      component_id TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      unit_cost REAL NOT NULL,
      total_cost REAL GENERATED ALWAYS AS (quantity * unit_cost) STORED,
      notes TEXT,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (component_id) REFERENCES components(id) ON DELETE CASCADE
    )
  `);

  // Create indexes for better search performance
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_components_category ON components(category);
    CREATE INDEX IF NOT EXISTS idx_components_status ON components(status);
    CREATE INDEX IF NOT EXISTS idx_components_location ON components(location_id);
    CREATE INDEX IF NOT EXISTS idx_components_name ON components(name);
    CREATE INDEX IF NOT EXISTS idx_components_part_number ON components(part_number);
    CREATE INDEX IF NOT EXISTS idx_storage_locations_parent ON storage_locations(parent_id);
    CREATE INDEX IF NOT EXISTS idx_project_components_project ON project_components(project_id);
    CREATE INDEX IF NOT EXISTS idx_component_history_component ON component_history(component_id);
    CREATE INDEX IF NOT EXISTS idx_orders_supplier ON orders(supplier);
    CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(order_date);
    CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
    CREATE INDEX IF NOT EXISTS idx_order_items_component ON order_items(component_id);
  `);

  // Insert default categories and locations if they don't exist
  const categoriesStmt = db.prepare(`
    INSERT OR IGNORE INTO components (id, name, category, quantity, min_threshold, created_at, updated_at)
    VALUES (?, ?, 'category_placeholder', 0, 0, datetime('now'), datetime('now'))
  `);

  // No default locations created automatically
  // Users should create their own storage locations as needed
  
  // Run database migrations
  runMigrations();
}

// Database migrations
function runMigrations() {
  // Create schema_version table if it doesn't exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY
    )
  `);
  
  // Get current version
  const versionStmt = db.prepare('SELECT version FROM schema_version ORDER BY version DESC LIMIT 1');
  const currentVersionRow = versionStmt.get() as { version: number } | undefined;
  const currentVersion = currentVersionRow?.version || 1;
  
  console.log(`Current schema version: ${currentVersion}, target version: ${CURRENT_SCHEMA_VERSION}`);
  
  // Run migrations if needed
  if (currentVersion < 2) {
    console.log('Running migration to version 2: Adding photo_url to storage_locations');
    try {
      // Add photo_url column to storage_locations if it doesn't exist
      db.exec(`
        ALTER TABLE storage_locations ADD COLUMN photo_url TEXT DEFAULT NULL;
      `);
      
      // Update schema version
      db.exec(`INSERT INTO schema_version (version) VALUES (2)`);
      console.log('Migration to version 2 completed successfully');
    } catch (error: any) {
      // Column might already exist, check if that's the case
      if (error.message.includes('duplicate column name')) {
        console.log('photo_url column already exists in storage_locations');
        db.exec(`INSERT OR IGNORE INTO schema_version (version) VALUES (2)`);
      } else {
        console.error('Migration to version 2 failed:', error);
        throw error;
      }
    }
  }
  
  if (currentVersion < 3) {
    console.log('Running migration to version 3: Adding tags to storage_locations and projects');
    try {
      // Add tags column to storage_locations if it doesn't exist
      db.exec(`
        ALTER TABLE storage_locations ADD COLUMN tags TEXT DEFAULT NULL;
      `);
      
      // Add tags column to projects if it doesn't exist
      db.exec(`
        ALTER TABLE projects ADD COLUMN tags TEXT DEFAULT NULL;
      `);
      
      // Update schema version
      db.exec(`INSERT INTO schema_version (version) VALUES (3)`);
      console.log('Migration to version 3 completed successfully');
    } catch (error: any) {
      // Column might already exist, check if that's the case
      if (error.message.includes('duplicate column name')) {
        console.log('tags columns already exist');
        db.exec(`INSERT OR IGNORE INTO schema_version (version) VALUES (3)`);
      } else {
        console.error('Migration to version 3 failed:', error);
        throw error;
      }
    }
  }
  
  if (currentVersion < 4) {
    console.log('Running migration to version 4: Adding qr_size to storage_locations');
    try {
      // Add qr_size column to storage_locations with default 'medium'
      db.exec(`
        ALTER TABLE storage_locations ADD COLUMN qr_size TEXT DEFAULT 'medium' CHECK(qr_size IN ('small', 'medium', 'large'));
      `);
      
      // Update schema version
      db.exec(`INSERT INTO schema_version (version) VALUES (4)`);
      console.log('Migration to version 4 completed successfully');
    } catch (error: any) {
      // Column might already exist, check if that's the case
      if (error.message.includes('duplicate column name')) {
        console.log('qr_size column already exists in storage_locations');
        db.exec(`INSERT OR IGNORE INTO schema_version (version) VALUES (4)`);
      } else {
        console.error('Migration to version 4 failed:', error);
        throw error;
      }
    }
  }

  if (currentVersion < 5) {
    console.log('Running migration to version 5: Adding QR code support to components');
    try {
      // Add qr_code and qr_size columns to components table
      db.exec(`
        ALTER TABLE components ADD COLUMN qr_code TEXT DEFAULT NULL;
      `);
      db.exec(`
        ALTER TABLE components ADD COLUMN qr_size TEXT DEFAULT 'small';
      `);
      db.exec(`
        ALTER TABLE components ADD COLUMN generate_qr BOOLEAN DEFAULT 1;
      `);
      
      // Update schema version
      db.exec(`INSERT INTO schema_version (version) VALUES (5)`);
      console.log('Migration to version 5 completed successfully');
    } catch (error: any) {
      // Columns might already exist, check if that's the case
      if (error.message.includes('duplicate column name')) {
        console.log('QR code columns already exist in components table');
        db.exec(`INSERT OR IGNORE INTO schema_version (version) VALUES (5)`);
      } else {
        console.error('Migration to version 5 failed:', error);
        throw error;
      }
    }
  }

  if (currentVersion < 6) {
    console.log('Running migration to version 6: Adding orders system');
    try {
      // Create orders table
      db.exec(`
        CREATE TABLE IF NOT EXISTS orders (
          id TEXT PRIMARY KEY,
          order_date TEXT NOT NULL,
          supplier TEXT,
          order_number TEXT,
          notes TEXT,
          total_amount REAL,
          status TEXT CHECK(status IN ('pending', 'ordered', 'shipped', 'delivered', 'cancelled')) DEFAULT 'delivered',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `);

      // Create order_items table
      db.exec(`
        CREATE TABLE IF NOT EXISTS order_items (
          id TEXT PRIMARY KEY,
          order_id TEXT NOT NULL,
          component_id TEXT NOT NULL,
          quantity INTEGER NOT NULL,
          unit_cost REAL NOT NULL,
          total_cost REAL GENERATED ALWAYS AS (quantity * unit_cost) STORED,
          notes TEXT,
          FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
          FOREIGN KEY (component_id) REFERENCES components(id) ON DELETE CASCADE
        )
      `);

      // Create indexes for orders tables
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_orders_supplier ON orders(supplier);
        CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(order_date);
        CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
        CREATE INDEX IF NOT EXISTS idx_order_items_component ON order_items(component_id);
      `);

      // Migrate existing component costs to orders
      // For each component with cost data, create an order and order item
      const componentsWithCosts = db.prepare(`
        SELECT id, unit_cost, total_cost, quantity, supplier, purchase_date
        FROM components 
        WHERE unit_cost IS NOT NULL AND unit_cost > 0
      `).all() as any[];

      for (const comp of componentsWithCosts) {
        if (comp.unit_cost && comp.quantity > 0) {
          const orderId = uuidv4();
          const orderDate = comp.purchase_date || new Date().toISOString().split('T')[0];
          
          // Create order
          db.prepare(`
            INSERT INTO orders (id, order_date, supplier, notes, total_amount, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
          `).run(orderId, orderDate, comp.supplier, 'Migrated from component data', comp.total_cost);

          // Create order item
          db.prepare(`
            INSERT INTO order_items (id, order_id, component_id, quantity, unit_cost)
            VALUES (?, ?, ?, ?, ?)
          `).run(uuidv4(), orderId, comp.id, comp.quantity, comp.unit_cost);
        }
      }

      // Remove cost columns from components table (SQLite doesn't support DROP COLUMN before 3.35)
      // We'll deprecate them by not using them in the application logic

      // Update schema version
      db.exec(`INSERT INTO schema_version (version) VALUES (6)`);
      console.log('Migration to version 6 completed successfully');
    } catch (error: any) {
      console.error('Migration to version 6 failed:', error);
      throw error;
    }
  }
}

// Helper function to add component history entry
export function addComponentHistory(
  componentId: string,
  action: string,
  previousValue?: string,
  newValue?: string,
  quantity?: number,
  projectId?: string,
  notes?: string
) {
  const stmt = db.prepare(`
    INSERT INTO component_history (id, component_id, action, previous_value, new_value, quantity, project_id, notes, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);
  
  stmt.run(uuidv4(), componentId, action, previousValue, newValue, quantity, projectId, notes);
}

// Database utility functions for testing
export function getDatabaseInfo() {
  return {
    path: dbPath,
    isTest,
    isDevelopment,
    isProduction,
    dataDir
  };
}

// Test helper function to reset database
export function resetDatabase() {
  if (!isTest) {
    throw new Error('resetDatabase can only be called in test environment');
  }
  
  // Drop all tables
  const tables = [
    'component_history',
    'project_components', 
    'boms',
    'components',
    'projects',
    'storage_locations',
    'users'
  ];
  
  tables.forEach(table => {
    try {
      db.exec(`DROP TABLE IF EXISTS ${table}`);
    } catch (error) {
      // Ignore errors, table might not exist
    }
  });
  
  // Re-initialize schema
  initializeDatabase();
}

// Clean up function for tests
export function closeDatabase() {
  if (db) {
    db.close();
  }
}

export default db;
