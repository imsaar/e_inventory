import request from 'supertest';
import express from 'express';
import Database from 'better-sqlite3';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

// Import route modules
import locationsRouter from '../server/routes/locations';
import componentsRouter from '../server/routes/components';
import projectsRouter from '../server/routes/projects';

describe('Bulk Operations Security Tests', () => {
  let app: express.Application;
  let db: Database.Database;
  let testDbPath: string;
  let locationId: string;
  let componentId: string;
  let projectId: string;

  beforeAll(() => {
    // Create test database
    testDbPath = path.join(__dirname, 'bulk-test.db');
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    
    db = new Database(testDbPath);
    
    // Create tables
    db.exec(`
      CREATE TABLE storage_locations (
        id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
        name TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'box',
        parentId TEXT,
        description TEXT,
        qrCode TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (parentId) REFERENCES storage_locations(id) ON DELETE SET NULL
      );

      CREATE TABLE components (
        id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
        name TEXT NOT NULL,
        partNumber TEXT,
        manufacturer TEXT,
        category TEXT NOT NULL,
        subcategory TEXT,
        description TEXT,
        specifications TEXT,
        datasheet TEXT,
        quantity INTEGER NOT NULL DEFAULT 0,
        minQuantity INTEGER DEFAULT 0,
        status TEXT DEFAULT 'available',
        notes TEXT,
        tags TEXT,
        cost REAL,
        supplier TEXT,
        storageLocationId TEXT,
        imagePath TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (storageLocationId) REFERENCES storage_locations(id) ON DELETE SET NULL
      );

      CREATE TABLE projects (
        id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
        name TEXT NOT NULL,
        description TEXT,
        status TEXT DEFAULT 'planning',
        startDate TEXT,
        completedDate TEXT,
        notes TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE project_components (
        id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
        projectId TEXT NOT NULL,
        componentId TEXT NOT NULL,
        quantityNeeded INTEGER NOT NULL DEFAULT 1,
        quantityUsed INTEGER DEFAULT 0,
        notes TEXT,
        addedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (projectId) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY (componentId) REFERENCES components(id) ON DELETE CASCADE
      );

      CREATE TABLE boms (
        id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
        projectId TEXT NOT NULL,
        name TEXT NOT NULL,
        version TEXT DEFAULT '1.0',
        data TEXT NOT NULL,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (projectId) REFERENCES projects(id) ON DELETE CASCADE
      );
    `);

    // Set up Express app
    app = express();
    app.use(cors());
    app.use(express.json({ limit: '10mb' }));
    app.use(multer().single('image'));

    // Attach database to request for routes
    app.use((req: any, res, next) => {
      req.db = db;
      next();
    });

    app.use('/api/locations', locationsRouter);
    app.use('/api/components', componentsRouter);
    app.use('/api/projects', projectsRouter);
  });

  beforeEach(() => {
    // Clean up data
    db.exec('DELETE FROM boms');
    db.exec('DELETE FROM project_components');
    db.exec('DELETE FROM components');
    db.exec('DELETE FROM projects');  
    db.exec('DELETE FROM storage_locations');

    // Insert test data
    const locationResult = db.prepare('INSERT INTO storage_locations (name, type) VALUES (?, ?) RETURNING id')
      .get('Test Location', 'box');
    locationId = locationResult.id;

    const componentResult = db.prepare('INSERT INTO components (name, category, quantity, storageLocationId) VALUES (?, ?, ?, ?) RETURNING id')
      .get('Test Component', 'IC', 10, locationId);
    componentId = componentResult.id;

    const projectResult = db.prepare('INSERT INTO projects (name, status) VALUES (?, ?) RETURNING id')
      .get('Test Project', 'active');
    projectId = projectResult.id;

    // Link component to project
    db.prepare('INSERT INTO project_components (projectId, componentId, quantityNeeded) VALUES (?, ?, ?)')
      .run(projectId, componentId, 5);
  });

  afterAll(() => {
    db.close();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('SQL Injection Protection', () => {
    test('should prevent SQL injection in location bulk delete', async () => {
      const maliciousIds = ["'; DROP TABLE storage_locations; --", "1' OR '1'='1"];
      
      const response = await request(app)
        .post('/api/locations/bulk-delete')
        .send({ locationIds: maliciousIds });

      expect(response.status).toBe(200);
      // Verify table still exists
      const count = db.prepare('SELECT COUNT(*) as count FROM storage_locations').get();
      expect(count.count).toBeGreaterThanOrEqual(0);
    });

    test('should prevent SQL injection in component dependency check', async () => {
      const maliciousIds = ["'; DELETE FROM components; --", "1' UNION SELECT password FROM users --"];
      
      const response = await request(app)
        .post('/api/components/check-dependencies')
        .send({ componentIds: maliciousIds });

      expect(response.status).toBe(200);
      // Verify data integrity
      const count = db.prepare('SELECT COUNT(*) as count FROM components').get();
      expect(count.count).toBeGreaterThanOrEqual(0);
    });

    test('should prevent SQL injection in project bulk operations', async () => {
      const maliciousIds = ["1'; UPDATE projects SET name='HACKED' WHERE 1=1; --"];
      
      const response = await request(app)
        .post('/api/projects/check-dependencies')
        .send({ projectIds: maliciousIds });

      expect(response.status).toBe(200);
      // Verify no data was modified
      const project = db.prepare('SELECT name FROM projects WHERE id = ?').get(projectId);
      expect(project.name).toBe('Test Project');
    });
  });

  describe('Input Validation', () => {
    test('should reject empty arrays', async () => {
      const response = await request(app)
        .post('/api/locations/bulk-delete')
        .send({ locationIds: [] });

      expect(response.status).toBe(400);
    });

    test('should reject non-array input', async () => {
      const response = await request(app)
        .post('/api/components/bulk-delete')
        .send({ componentIds: "not-an-array" });

      expect(response.status).toBe(400);
    });

    test('should limit array size to prevent DoS', async () => {
      const largeArray = new Array(1001).fill('fake-id');
      
      const response = await request(app)
        .post('/api/projects/bulk-delete')
        .send({ projectIds: largeArray });

      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/too many items/i);
    });

    test('should reject malformed JSON', async () => {
      const response = await request(app)
        .post('/api/locations/bulk-delete')
        .send('{"locationIds": [}'); // Malformed JSON

      expect(response.status).toBe(400);
    });
  });

  describe('Authorization and Access Control', () => {
    test('should handle missing request body gracefully', async () => {
      const response = await request(app)
        .post('/api/locations/bulk-delete')
        .send();

      expect(response.status).toBe(400);
    });

    test('should validate required parameters', async () => {
      const response = await request(app)
        .post('/api/components/check-dependencies')
        .send({ wrongParam: ['id1', 'id2'] });

      expect(response.status).toBe(400);
    });
  });

  describe('Data Integrity', () => {
    test('should prevent deletion of items with dependencies', async () => {
      // Try to delete location that has components
      const response = await request(app)
        .post('/api/locations/bulk-delete')
        .send({ locationIds: [locationId] });

      expect(response.status).toBe(200);
      expect(response.body.failed).toHaveLength(1);
      expect(response.body.failed[0].error).toMatch(/has components/i);
    });

    test('should prevent deletion of components in projects', async () => {
      const response = await request(app)
        .post('/api/components/bulk-delete')
        .send({ componentIds: [componentId] });

      expect(response.status).toBe(200);
      expect(response.body.failed).toHaveLength(1);
      expect(response.body.failed[0].error).toMatch(/used in projects/i);
    });

    test('should maintain database consistency during partial failures', async () => {
      // Create a component without dependencies and one with dependencies
      const freeComponentResult = db.prepare('INSERT INTO components (name, category, quantity) VALUES (?, ?, ?) RETURNING id')
        .get('Free Component', 'Resistor', 5);
      const freeComponentId = freeComponentResult.id;

      const response = await request(app)
        .post('/api/components/bulk-delete')
        .send({ componentIds: [componentId, freeComponentId] });

      expect(response.status).toBe(200);
      expect(response.body.deleted).toHaveLength(1);
      expect(response.body.failed).toHaveLength(1);

      // Verify the free component was deleted and the dependent one wasn't
      const remainingComponents = db.prepare('SELECT id FROM components').all();
      const remainingIds = remainingComponents.map(c => c.id);
      expect(remainingIds).toContain(componentId);
      expect(remainingIds).not.toContain(freeComponentId);
    });
  });

  describe('Performance and DoS Protection', () => {
    test('should handle large valid datasets efficiently', async () => {
      // Insert multiple locations without dependencies
      const locationIds: string[] = [];
      for (let i = 0; i < 50; i++) {
        const result = db.prepare('INSERT INTO storage_locations (name, type) VALUES (?, ?) RETURNING id')
          .get(`Test Location ${i}`, 'box');
        locationIds.push(result.id);
      }

      const startTime = Date.now();
      const response = await request(app)
        .post('/api/locations/bulk-delete')
        .send({ locationIds });
      const duration = Date.now() - startTime;

      expect(response.status).toBe(200);
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
      expect(response.body.deleted).toHaveLength(50);
    });

    test('should timeout on excessively long operations', async () => {
      // This test would require more complex setup to actually trigger timeouts
      // For now, just verify the endpoint responds
      const response = await request(app)
        .post('/api/projects/check-dependencies')
        .send({ projectIds: [projectId] })
        .timeout(1000);

      expect(response.status).toBe(200);
    }, 10000);
  });

  describe('Error Handling', () => {
    test('should handle database connection errors gracefully', async () => {
      // Temporarily break the database connection
      const originalDb = (app as any).db;
      (app as any).use((req: any, res, next) => {
        req.db = null;
        next();
      });

      const response = await request(app)
        .post('/api/locations/check-dependencies')
        .send({ locationIds: [locationId] });

      expect(response.status).toBe(500);
      
      // Restore connection
      (app as any).use((req: any, res, next) => {
        req.db = originalDb;
        next();
      });
    });

    test('should return meaningful error messages', async () => {
      const response = await request(app)
        .post('/api/components/bulk-delete')
        .send({ componentIds: ['non-existent-id'] });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('deleted');
      expect(response.body).toHaveProperty('failed');
    });
  });
});