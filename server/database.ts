import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';

// Determine database path based on environment
const isTest = process.env.NODE_ENV === 'test';
const dataDir = isTest ? path.join(__dirname, '../data/test') : path.join(__dirname, '../data');
const dbPath = process.env.DB_PATH || path.join(dataDir, isTest ? 'test-inventory.db' : 'inventory.db');

// Ensure data directory exists
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

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
  `);

  // Insert default categories and locations if they don't exist
  const categoriesStmt = db.prepare(`
    INSERT OR IGNORE INTO components (id, name, category, quantity, min_threshold, created_at, updated_at)
    VALUES (?, ?, 'category_placeholder', 0, 0, datetime('now'), datetime('now'))
  `);

  // Create default storage location
  const defaultLocationStmt = db.prepare(`
    INSERT OR IGNORE INTO storage_locations (id, name, type, created_at, updated_at)
    VALUES (?, 'Workshop', 'room', datetime('now'), datetime('now'))
  `);
  
  try {
    defaultLocationStmt.run(uuidv4());
  } catch (error) {
    // Location might already exist
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

export default db;