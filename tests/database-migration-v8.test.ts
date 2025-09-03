import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

describe('Database Migration Version 8', () => {
  let testDbPath: string;
  let db: Database.Database;

  beforeEach(() => {
    // Create a unique test database for each test
    testDbPath = path.join(__dirname, `../data/test-migration-v8-${Date.now()}.db`);
    db = new Database(testDbPath);
    db.pragma('foreign_keys = ON');
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  it('should create schema_version table if not exists', () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'").all();
    expect(tables).toHaveLength(1);
  });

  it('should create components table with original schema (version 7)', () => {
    // Simulate original components table (pre-migration)
    db.exec(`
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
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    // Create schema_version table and set version to 7
    db.exec(`
      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    db.exec(`INSERT INTO schema_version (version) VALUES (7)`);

    // Verify original schema doesn't have new columns
    const columns = db.prepare("PRAGMA table_info(components)").all();
    const columnNames = columns.map((col: any) => col.name);
    
    expect(columnNames).not.toContain('dimensions');
    expect(columnNames).not.toContain('weight');
    expect(columnNames).not.toContain('voltage');
    expect(columnNames).not.toContain('current');
    expect(columnNames).not.toContain('pin_count');
    expect(columnNames).not.toContain('protocols');
    expect(columnNames).not.toContain('supplier');
  });

  it('should successfully apply migration from version 7 to version 8', () => {
    // Set up pre-migration state
    db.exec(`
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
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    db.exec(`INSERT INTO schema_version (version) VALUES (7)`);

    // Insert test data before migration
    db.exec(`
      INSERT INTO components (id, name, category, quantity)
      VALUES ('test-component-1', 'Test Component', 'ICs', 10)
    `);

    // Apply migration to version 8
    db.exec(`ALTER TABLE components ADD COLUMN dimensions TEXT DEFAULT NULL`);
    db.exec(`ALTER TABLE components ADD COLUMN weight TEXT DEFAULT NULL`);
    db.exec(`ALTER TABLE components ADD COLUMN voltage TEXT DEFAULT NULL`);
    db.exec(`ALTER TABLE components ADD COLUMN current TEXT DEFAULT NULL`);
    db.exec(`ALTER TABLE components ADD COLUMN pin_count INTEGER DEFAULT NULL`);
    db.exec(`ALTER TABLE components ADD COLUMN protocols TEXT DEFAULT NULL`);
    db.exec(`ALTER TABLE components ADD COLUMN supplier TEXT DEFAULT NULL`);
    
    db.exec(`INSERT INTO schema_version (version) VALUES (8)`);

    // Verify migration was successful
    const columns = db.prepare("PRAGMA table_info(components)").all();
    const columnNames = columns.map((col: any) => col.name);
    
    expect(columnNames).toContain('dimensions');
    expect(columnNames).toContain('weight');
    expect(columnNames).toContain('voltage');
    expect(columnNames).toContain('current');
    expect(columnNames).toContain('pin_count');
    expect(columnNames).toContain('protocols');
    expect(columnNames).toContain('supplier');

    // Verify schema version was updated
    const version = db.prepare('SELECT version FROM schema_version ORDER BY version DESC LIMIT 1').get() as { version: number };
    expect(version.version).toBe(8);

    // Verify existing data is preserved
    const component = db.prepare('SELECT * FROM components WHERE id = ?').get('test-component-1') as any;
    expect(component.name).toBe('Test Component');
    expect(component.quantity).toBe(10);
    
    // Verify new columns have default values
    expect(component.dimensions).toBeNull();
    expect(component.weight).toBeNull();
    expect(component.voltage).toBeNull();
    expect(component.current).toBeNull();
    expect(component.pin_count).toBeNull();
    expect(component.protocols).toBeNull();
    expect(component.supplier).toBeNull();
  });

  it('should handle migration with data in new columns', () => {
    // Set up components table with migration already applied
    db.exec(`
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
        dimensions TEXT DEFAULT NULL,
        weight TEXT DEFAULT NULL,
        voltage TEXT DEFAULT NULL,
        current TEXT DEFAULT NULL,
        pin_count INTEGER DEFAULT NULL,
        protocols TEXT DEFAULT NULL,
        supplier TEXT DEFAULT NULL
      )
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    db.exec(`INSERT INTO schema_version (version) VALUES (8)`);

    // Test inserting component with new fields
    const componentData = {
      id: 'test-esp32',
      name: 'ESP32 DevKit',
      category: 'Microcontrollers',
      quantity: 5,
      voltage: JSON.stringify({ min: 3.0, max: 3.6, nominal: 3.3, unit: 'V' }),
      current: JSON.stringify({ value: 250, unit: 'mA' }),
      pin_count: 30,
      protocols: JSON.stringify(['I2C', 'SPI', 'UART', 'WiFi']),
      supplier: 'AliExpress Store',
      dimensions: JSON.stringify({ length: 55, width: 28, height: 13, unit: 'mm' }),
      weight: JSON.stringify({ value: 10.5, unit: 'g' })
    };

    const insertStmt = db.prepare(`
      INSERT INTO components (
        id, name, category, quantity, voltage, current, pin_count, 
        protocols, supplier, dimensions, weight
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertStmt.run(
      componentData.id,
      componentData.name,
      componentData.category,
      componentData.quantity,
      componentData.voltage,
      componentData.current,
      componentData.pin_count,
      componentData.protocols,
      componentData.supplier,
      componentData.dimensions,
      componentData.weight
    );

    // Verify data was inserted correctly
    const component = db.prepare('SELECT * FROM components WHERE id = ?').get('test-esp32') as any;
    expect(component.name).toBe('ESP32 DevKit');
    expect(component.pin_count).toBe(30);
    expect(component.supplier).toBe('AliExpress Store');
    expect(JSON.parse(component.voltage)).toEqual({ min: 3.0, max: 3.6, nominal: 3.3, unit: 'V' });
    expect(JSON.parse(component.protocols)).toEqual(['I2C', 'SPI', 'UART', 'WiFi']);
  });

  it('should handle component updates with new fields', () => {
    // Set up migrated schema
    db.exec(`
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
        dimensions TEXT DEFAULT NULL,
        weight TEXT DEFAULT NULL,
        voltage TEXT DEFAULT NULL,
        current TEXT DEFAULT NULL,
        pin_count INTEGER DEFAULT NULL,
        protocols TEXT DEFAULT NULL,
        supplier TEXT DEFAULT NULL
      )
    `);

    // Insert a basic component
    db.exec(`
      INSERT INTO components (id, name, category, quantity)
      VALUES ('test-update', 'Test Update Component', 'Sensors', 5)
    `);

    // Update with new fields
    const updateStmt = db.prepare(`
      UPDATE components SET
        voltage = ?,
        current = ?,
        pin_count = ?,
        protocols = ?,
        supplier = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `);

    updateStmt.run(
      JSON.stringify({ min: 2.7, max: 5.5, nominal: 3.3, unit: 'V' }),
      JSON.stringify({ value: 50, unit: 'mA' }),
      8,
      JSON.stringify(['I2C', 'OneWire']),
      'Updated Supplier',
      'test-update'
    );

    // Verify update was successful
    const component = db.prepare('SELECT * FROM components WHERE id = ?').get('test-update') as any;
    expect(component.name).toBe('Test Update Component');
    expect(component.pin_count).toBe(8);
    expect(component.supplier).toBe('Updated Supplier');
    expect(JSON.parse(component.voltage)).toEqual({ min: 2.7, max: 5.5, nominal: 3.3, unit: 'V' });
    expect(JSON.parse(component.protocols)).toEqual(['I2C', 'OneWire']);
  });

  it('should validate constraint integrity after migration', () => {
    // Set up migrated schema
    db.exec(`
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
        dimensions TEXT DEFAULT NULL,
        weight TEXT DEFAULT NULL,
        voltage TEXT DEFAULT NULL,
        current TEXT DEFAULT NULL,
        pin_count INTEGER DEFAULT NULL,
        protocols TEXT DEFAULT NULL,
        supplier TEXT DEFAULT NULL
      )
    `);

    // Test that existing constraints still work
    expect(() => {
      db.exec(`INSERT INTO components (id, category) VALUES ('test-no-name', 'ICs')`);
    }).toThrow(); // Should fail because name is required

    // Test that new integer constraints work
    expect(() => {
      db.exec(`INSERT INTO components (id, name, category, pin_count) VALUES ('test-invalid-pins', 'Test', 'ICs', 'not-a-number')`);
    }).toThrow(); // Should fail because pin_count must be integer
  });
});