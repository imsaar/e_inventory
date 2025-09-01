import { describe, it, expect, beforeAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import app from '../server/index';
import { resetDatabase, getDatabaseInfo } from '../server/database';

describe('Core Functionality Verification', () => {
  let testLocationId: string;
  let testComponentId: string;

  beforeAll(async () => {
    // Verify we're using test database
    const dbInfo = getDatabaseInfo();
    expect(dbInfo.isTest).toBe(true);
    
    // Give the server a moment to initialize
    await new Promise(resolve => setTimeout(resolve, 1000));
  });

  beforeEach(() => {
    // Reset database before each test to ensure clean state
    resetDatabase();
  });

  describe('Storage Locations', () => {
    it('should create a storage location successfully', async () => {
      const locationData = {
        name: 'Test Workshop',
        type: 'room',
        description: 'Main electronics workshop'
      };

      const response = await request(app)
        .post('/api/locations')
        .send(locationData)
        .expect(201);

      expect(response.body.id).toBeDefined();
      expect(response.body.name).toBe(locationData.name);
      expect(response.body.type).toBe(locationData.type);
      expect(response.body.description).toBe(locationData.description);
      
      testLocationId = response.body.id;
    });

    it('should fetch all locations', async () => {
      const response = await request(app)
        .get('/api/locations')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
    });

    it('should create hierarchical locations', async () => {
      const cabinetData = {
        name: 'Parts Cabinet A',
        type: 'cabinet',
        parentId: testLocationId,
        description: 'Main parts storage cabinet'
      };

      const response = await request(app)
        .post('/api/locations')
        .send(cabinetData)
        .expect(201);

      expect(response.body.parentId).toBe(testLocationId);
      expect(response.body.name).toBe(cabinetData.name);
    });
  });

  describe('Components', () => {
    it('should create a component with storage location', async () => {
      const componentData = {
        name: 'Arduino Uno R3',
        category: 'Development Boards',
        partNumber: 'ARD-UNO-R3',
        manufacturer: 'Arduino',
        description: 'Microcontroller board based on the ATmega328P',
        quantity: 5,
        minThreshold: 2,
        unitCost: 25.00,
        locationId: testLocationId,
        status: 'available'
      };

      const response = await request(app)
        .post('/api/components')
        .send(componentData)
        .expect(201);

      expect(response.body.id).toBeDefined();
      expect(response.body.name).toBe(componentData.name);
      expect(response.body.locationId).toBe(testLocationId);
      expect(response.body.quantity).toBe(componentData.quantity);
      expect(response.body.status).toBe(componentData.status);
      
      testComponentId = response.body.id;
    });

    it('should fetch components in a location', async () => {
      const response = await request(app)
        .get(`/api/locations/${testLocationId}/components`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(1);
      expect(response.body[0].name).toBe('Arduino Uno R3');
    });

    it('should update component successfully', async () => {
      const updateData = {
        quantity: 3,
        status: 'in_use'
      };

      const response = await request(app)
        .put(`/api/components/${testComponentId}`)
        .send(updateData)
        .expect(200);

      expect(response.body.quantity).toBe(3);
      expect(response.body.status).toBe('in_use');
    });

    it('should search components by name', async () => {
      const response = await request(app)
        .get('/api/components')
        .query({ term: 'Arduino' })
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      expect(response.body[0].name).toContain('Arduino');
    });
  });

  describe('Bulk Operations', () => {
    it('should handle bulk delete of components', async () => {
      // Create a second component for bulk operations
      const componentData = {
        name: 'Test Resistor 1k',
        category: 'Passive Components',
        quantity: 100,
        locationId: testLocationId
      };

      const createResponse = await request(app)
        .post('/api/components')
        .send(componentData)
        .expect(201);

      const componentId2 = createResponse.body.id;

      // Bulk delete both components
      const bulkDeleteData = {
        componentIds: [testComponentId, componentId2]
      };

      const response = await request(app)
        .post('/api/components/bulk-delete')
        .send(bulkDeleteData)
        .expect(200);

      expect(response.body.summary).toBeDefined();
      expect(response.body.summary.total).toBe(2);
      expect(response.body.deleted).toHaveLength(2);
    });
  });

  describe('Data Validation', () => {
    it('should reject component creation without required fields', async () => {
      const invalidComponentData = {
        // Missing name and category (required fields)
        quantity: 5
      };

      await request(app)
        .post('/api/components')
        .send(invalidComponentData)
        .expect(400);
    });

    it('should reject location creation without required fields', async () => {
      const invalidLocationData = {
        // Missing name and type (required fields)
        description: 'Test location'
      };

      await request(app)
        .post('/api/locations')
        .send(invalidLocationData)
        .expect(400);
    });

    it('should validate ID format', async () => {
      await request(app)
        .get('/api/locations/invalid-id-format')
        .expect(400);
    });
  });

  describe('Error Handling', () => {
    it('should return 404 for non-existent component', async () => {
      await request(app)
        .get('/api/components/00000000-0000-0000-0000-000000000000')
        .expect(404);
    });

    it('should handle malformed JSON gracefully', async () => {
      await request(app)
        .post('/api/components')
        .set('Content-Type', 'application/json')
        .send('{"invalid": json}')
        .expect(400);
    });
  });
});