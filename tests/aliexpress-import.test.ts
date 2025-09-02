import request from 'supertest';
import express from 'express';
import path from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';
import importRouter from '../server/routes/import';

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Setup test database
let db: Database.Database;
let testDbPath: string;

// Set timeout for all tests in this file
jest.setTimeout(30000);

beforeAll(async () => {
  // Create test database
  testDbPath = path.join(__dirname, '../data/test', `test-inventory-${Date.now()}.db`);
  await fs.promises.mkdir(path.dirname(testDbPath), { recursive: true });
  
  db = new Database(testDbPath);
  
  // Initialize basic tables for testing
  db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      order_date TEXT,
      supplier TEXT,
      order_number TEXT,
      supplier_order_id TEXT,
      notes TEXT,
      total_amount REAL,
      import_source TEXT,
      import_date TEXT,
      original_data TEXT,
      status TEXT,
      created_at TEXT,
      updated_at TEXT
    );
    
    CREATE TABLE IF NOT EXISTS order_items (
      id TEXT PRIMARY KEY,
      order_id TEXT,
      component_id TEXT,
      product_title TEXT,
      product_url TEXT,
      image_url TEXT,
      local_image_path TEXT,
      quantity INTEGER,
      unit_cost REAL,
      specifications TEXT,
      variation TEXT,
      import_confidence REAL,
      manual_review INTEGER,
      notes TEXT
    );
    
    CREATE TABLE IF NOT EXISTS components (
      id TEXT PRIMARY KEY,
      name TEXT,
      part_number TEXT,
      manufacturer TEXT,
      description TEXT,
      category TEXT,
      subcategory TEXT,
      tags TEXT,
      package_type TEXT,
      voltage TEXT,
      current TEXT,
      pin_count INTEGER,
      protocols TEXT,
      quantity INTEGER,
      min_threshold INTEGER,
      image_url TEXT,
      status TEXT,
      created_at TEXT,
      updated_at TEXT
    );
  `);
  
  app.set('db', db);
  app.use('/api/import', importRouter);
});

afterAll(async () => {
  if (db) {
    db.close();
  }
  try {
    await fs.promises.unlink(testDbPath);
  } catch (error) {
    // Ignore cleanup errors
  }
});

describe('AliExpress Import Functionality', () => {
  describe('Basic Import Routes', () => {
    test('should respond to test endpoint', async () => {
      const response = await request(app)
        .get('/api/import/test')
        .timeout(20000)
        .expect(200);

      expect(response.body.message).toBe('Import routes working');
      expect(response.body.timestamp).toBeDefined();
    }, 25000);

    test('should return empty import history initially', async () => {
      const response = await request(app)
        .get('/api/import/history')
        .timeout(20000)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(0);
    }, 25000);
  });

  describe('File Upload Validation', () => {
    test('should reject non-HTML files', async () => {
      const textBuffer = Buffer.from('This is not an HTML file', 'utf-8');
      
      const response = await request(app)
        .post('/api/import/aliexpress/preview')
        .attach('htmlFile', textBuffer, 'test.txt')
        .timeout(20000)
        .expect(500);

      expect(response.body.error).toBeDefined();
    }, 25000);

    test('should accept HTML files', async () => {
      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head><title>Test HTML</title></head>
        <body>
          <div>No AliExpress orders found</div>
        </body>
        </html>
      `;
      const htmlBuffer = Buffer.from(htmlContent, 'utf-8');
      
      const response = await request(app)
        .post('/api/import/aliexpress/preview')
        .attach('htmlFile', htmlBuffer, 'test.html')
        .timeout(20000);

      // Should process the file but find no orders
      expect([200, 400].includes(response.status)).toBe(true);
    }, 25000);

    test('should require HTML file to be provided', async () => {
      const response = await request(app)
        .post('/api/import/aliexpress/preview')
        .timeout(20000)
        .expect(400);

      expect(response.body.error).toBe('HTML file is required');
    }, 25000);
  });

  describe('Import Endpoint Validation', () => {
    test('should require orders array for import', async () => {
      const response = await request(app)
        .post('/api/import/aliexpress/import')
        .send({})
        .timeout(20000)
        .expect(400);

      expect(response.body.error).toBe('Orders array is required');
    }, 25000);

    test('should validate orders array format', async () => {
      const response = await request(app)
        .post('/api/import/aliexpress/import')
        .send({ orders: 'not-an-array' })
        .timeout(20000)
        .expect(400);

      expect(response.body.error).toBe('Orders array is required');
    }, 25000);

    test('should handle empty orders array', async () => {
      const response = await request(app)
        .post('/api/import/aliexpress/import')
        .send({ orders: [], importOptions: {} })
        .timeout(20000)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.results.imported).toBe(0);
      expect(response.body.results.skipped).toBe(0);
    }, 25000);
  });

  describe('Mock Data Import', () => {
    test('should import valid order data', async () => {
      const mockOrder = {
        orderNumber: 'TEST123456',
        supplier: 'Test Supplier',
        orderDate: '2024-01-01',
        status: 'delivered',
        totalAmount: 25.99,
        items: [
          {
            productTitle: 'Test Electronic Component',
            quantity: 2,
            unitPrice: 12.99,
            specifications: { Color: 'Red', Size: '5mm' },
            parsedComponent: {
              name: 'Test Component',
              category: 'Electronic Component',
              description: 'A test component for import testing',
              tags: ['test', 'component']
            }
          }
        ]
      };

      const response = await request(app)
        .post('/api/import/aliexpress/import')
        .send({ 
          orders: [mockOrder], 
          importOptions: { createComponents: true }
        })
        .timeout(20000)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.results.imported).toBe(1);
      expect(response.body.results.skipped).toBe(0);
      expect(response.body.results.orderIds).toHaveLength(1);
      expect(response.body.results.componentIds).toHaveLength(1);
    }, 25000);

    test('should skip duplicate orders by default', async () => {
      const mockOrder = {
        orderNumber: 'DUPLICATE123',
        supplier: 'Test Supplier',
        orderDate: '2024-01-01',
        status: 'delivered',
        totalAmount: 15.99,
        items: [
          {
            productTitle: 'Duplicate Test Component',
            quantity: 1,
            unitPrice: 15.99,
            parsedComponent: {
              name: 'Duplicate Component',
              category: 'Electronic Component'
            }
          }
        ]
      };

      // First import
      await request(app)
        .post('/api/import/aliexpress/import')
        .send({ orders: [mockOrder], importOptions: {} })
        .expect(200);

      // Second import (should skip)
      const response = await request(app)
        .post('/api/import/aliexpress/import')
        .send({ orders: [mockOrder], importOptions: {} })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.results.imported).toBe(0);
      expect(response.body.results.skipped).toBe(1);
    });

    test('should allow duplicates when option is enabled', async () => {
      const mockOrder = {
        orderNumber: 'ALLOWDUP123',
        supplier: 'Test Supplier',
        orderDate: '2024-01-01',
        status: 'delivered',
        totalAmount: 10.99,
        items: [
          {
            productTitle: 'Allow Duplicate Component',
            quantity: 1,
            unitPrice: 10.99,
            parsedComponent: {
              name: 'Allow Dup Component',
              category: 'Electronic Component'
            }
          }
        ]
      };

      // First import
      await request(app)
        .post('/api/import/aliexpress/import')
        .send({ orders: [mockOrder], importOptions: {} })
        .expect(200);

      // Second import with allowDuplicates
      const response = await request(app)
        .post('/api/import/aliexpress/import')
        .send({ 
          orders: [mockOrder], 
          importOptions: { allowDuplicates: true }
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.results.imported).toBe(1);
      expect(response.body.results.skipped).toBe(0);
    });
  });

  describe('Import History', () => {
    test('should show import history after importing orders', async () => {
      // Import a test order first
      const mockOrder = {
        orderNumber: 'HISTORY123',
        supplier: 'History Test Supplier',
        orderDate: '2024-01-01',
        status: 'delivered',
        totalAmount: 30.99,
        items: [
          {
            productTitle: 'History Test Component',
            quantity: 1,
            unitPrice: 30.99
          }
        ]
      };

      await request(app)
        .post('/api/import/aliexpress/import')
        .send({ orders: [mockOrder], importOptions: {} })
        .expect(200);

      // Check history
      const response = await request(app)
        .get('/api/import/history')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      
      const latestImport = response.body[0];
      expect(latestImport.source).toBe('aliexpress');
      expect(latestImport.orderCount).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    test('should handle database errors gracefully', async () => {
      // Close database to force connection error
      db.close();
      
      const mockOrder = {
        orderNumber: 'ERROR_TEST',
        supplier: 'Error Test Supplier',
        orderDate: '2024-01-01',
        status: 'delivered',
        totalAmount: 25.99,
        items: []
      };

      const response = await request(app)
        .post('/api/import/aliexpress/import')
        .send({ orders: [mockOrder], importOptions: {} });

      // Should return 500 error due to database connection issue
      expect(response.status).toBe(500);
      expect(response.body.error).toBeDefined();
    }, 25000);
  });
});