import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
const request = require('supertest');
import app from '../server/index';
import { StorageLocation } from '../src/types';

describe('Location API', () => {
  let testLocationId: string;
  let parentLocationId: string;

  beforeEach(async () => {
    // Clean up any existing test locations
    const locations = await request(app).get('/api/locations');
    for (const location of locations.body) {
      if (location.name.includes('Test')) {
        await request(app).delete(`/api/locations/${location.id}`);
      }
    }
  });

  describe('POST /api/locations', () => {
    it('should create a new location successfully', async () => {
      const locationData = {
        name: 'Test Room',
        type: 'room',
        description: 'A test room for unit testing'
      };

      const response = await request(app)
        .post('/api/locations')
        .send(locationData)
        .expect(201);

      expect(response.body).toMatchObject({
        name: 'Test Room',
        type: 'room',
        description: 'A test room for unit testing'
      });
      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('createdAt');
      expect(response.body).toHaveProperty('updatedAt');
      
      testLocationId = response.body.id;
    });

    it('should create a location with QR code when requested', async () => {
      const locationData = {
        name: 'Test Cabinet with QR',
        type: 'cabinet',
        generateQR: true
      };

      const response = await request(app)
        .post('/api/locations')
        .send(locationData)
        .expect(201);

      expect(response.body).toHaveProperty('qrCode');
      expect(response.body.qrCode).toMatch(/^LOC-[A-Z0-9]{8}$/);
    });

    it('should create a child location with parent reference', async () => {
      // Create parent location first
      const parentData = {
        name: 'Test Parent Room',
        type: 'room'
      };
      const parentResponse = await request(app)
        .post('/api/locations')
        .send(parentData)
        .expect(201);
      
      parentLocationId = parentResponse.body.id;

      // Create child location
      const childData = {
        name: 'Test Cabinet in Room',
        type: 'cabinet',
        parentId: parentLocationId
      };

      const response = await request(app)
        .post('/api/locations')
        .send(childData)
        .expect(201);

      expect(response.body.parentId).toBe(parentLocationId);
    });

    it('should reject invalid location type', async () => {
      const locationData = {
        name: 'Invalid Location',
        type: 'invalid_type'
      };

      await request(app)
        .post('/api/locations')
        .send(locationData)
        .expect(500); // SQLite constraint error
    });

    it('should require name field', async () => {
      const locationData = {
        type: 'room'
        // Missing name
      };

      await request(app)
        .post('/api/locations')
        .send(locationData)
        .expect(500); // SQLite NOT NULL constraint error
    });
  });

  describe('GET /api/locations', () => {
    beforeEach(async () => {
      // Create test locations for hierarchy testing
      const parentData = {
        name: 'Test Hierarchy Parent',
        type: 'room'
      };
      const parentResponse = await request(app)
        .post('/api/locations')
        .send(parentData);
      parentLocationId = parentResponse.body.id;

      const childData = {
        name: 'Test Hierarchy Child',
        type: 'cabinet',
        parentId: parentLocationId
      };
      await request(app)
        .post('/api/locations')
        .send(childData);
    });

    it('should return hierarchical location structure', async () => {
      const response = await request(app)
        .get('/api/locations')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      
      // Find our test parent location
      const parentLocation = response.body.find((loc: any) => loc.name === 'Test Hierarchy Parent');
      expect(parentLocation).toBeDefined();
      expect(parentLocation.children).toBeDefined();
      expect(Array.isArray(parentLocation.children)).toBe(true);
      
      // Check if child is nested under parent
      const childLocation = parentLocation.children.find((child: any) => child.name === 'Test Hierarchy Child');
      expect(childLocation).toBeDefined();
      expect(childLocation.parentId).toBe(parentLocationId);
    });

    it('should return empty array when no locations exist', async () => {
      // Clean up all locations first
      const locations = await request(app).get('/api/locations');
      for (const location of locations.body) {
        await request(app).delete(`/api/locations/${location.id}`);
      }

      const response = await request(app)
        .get('/api/locations')
        .expect(200);

      expect(response.body).toEqual([]);
    });
  });

  describe('GET /api/locations/:id', () => {
    beforeEach(async () => {
      const locationData = {
        name: 'Test Single Location',
        type: 'drawer',
        description: 'Single location for testing'
      };
      const response = await request(app)
        .post('/api/locations')
        .send(locationData);
      testLocationId = response.body.id;
    });

    it('should return specific location by ID', async () => {
      const response = await request(app)
        .get(`/api/locations/${testLocationId}`)
        .expect(200);

      expect(response.body.id).toBe(testLocationId);
      expect(response.body.name).toBe('Test Single Location');
      expect(response.body).toHaveProperty('fullPath');
      expect(Array.isArray(response.body.fullPath)).toBe(true);
    });

    it('should return 404 for non-existent location', async () => {
      const fakeId = 'non-existent-id';
      
      const response = await request(app)
        .get(`/api/locations/${fakeId}`)
        .expect(404);

      expect(response.body.error).toBe('Location not found');
    });

    it('should return full path for nested location', async () => {
      // Create parent location
      const parentData = { name: 'Test Parent Path', type: 'room' };
      const parentResponse = await request(app).post('/api/locations').send(parentData);
      
      // Create child location
      const childData = {
        name: 'Test Child Path',
        type: 'cabinet',
        parentId: parentResponse.body.id
      };
      const childResponse = await request(app).post('/api/locations').send(childData);

      const response = await request(app)
        .get(`/api/locations/${childResponse.body.id}`)
        .expect(200);

      expect(response.body.fullPath).toHaveLength(2);
      expect(response.body.fullPath[0].name).toBe('Test Parent Path');
      expect(response.body.fullPath[1].name).toBe('Test Child Path');
    });
  });

  describe('PUT /api/locations/:id', () => {
    beforeEach(async () => {
      const locationData = {
        name: 'Test Update Location',
        type: 'box',
        description: 'Original description'
      };
      const response = await request(app)
        .post('/api/locations')
        .send(locationData);
      testLocationId = response.body.id;
    });

    it('should update location successfully', async () => {
      const updateData = {
        name: 'Updated Test Location',
        description: 'Updated description'
      };

      const response = await request(app)
        .put(`/api/locations/${testLocationId}`)
        .send(updateData)
        .expect(200);

      expect(response.body.name).toBe('Updated Test Location');
      expect(response.body.description).toBe('Updated description');
      expect(response.body.type).toBe('box'); // Should remain unchanged
    });

    it('should return 404 for non-existent location', async () => {
      const updateData = { name: 'Updated Name' };
      
      await request(app)
        .put('/api/locations/non-existent-id')
        .send(updateData)
        .expect(404);
    });

    it('should handle partial updates', async () => {
      const updateData = { description: 'Only description changed' };

      const response = await request(app)
        .put(`/api/locations/${testLocationId}`)
        .send(updateData)
        .expect(200);

      expect(response.body.name).toBe('Test Update Location'); // Unchanged
      expect(response.body.description).toBe('Only description changed');
    });
  });

  describe('DELETE /api/locations/:id', () => {
    beforeEach(async () => {
      const locationData = {
        name: 'Test Delete Location',
        type: 'compartment'
      };
      const response = await request(app)
        .post('/api/locations')
        .send(locationData);
      testLocationId = response.body.id;
    });

    it('should delete location successfully', async () => {
      await request(app)
        .delete(`/api/locations/${testLocationId}`)
        .expect(200);

      // Verify location is deleted
      await request(app)
        .get(`/api/locations/${testLocationId}`)
        .expect(404);
    });

    it('should return 404 for non-existent location', async () => {
      await request(app)
        .delete('/api/locations/non-existent-id')
        .expect(404);
    });

    it('should prevent deletion of location with child locations', async () => {
      // Create child location
      const childData = {
        name: 'Child preventing deletion',
        type: 'drawer',
        parentId: testLocationId
      };
      await request(app).post('/api/locations').send(childData);

      const response = await request(app)
        .delete(`/api/locations/${testLocationId}`)
        .expect(400);

      expect(response.body.error).toMatch(/child locations/i);
    });
  });

  describe('GET /api/locations/:id/components', () => {
    beforeEach(async () => {
      const locationData = {
        name: 'Test Location with Components',
        type: 'box'
      };
      const response = await request(app)
        .post('/api/locations')
        .send(locationData);
      testLocationId = response.body.id;
    });

    it('should return components in location', async () => {
      // First, create a component in this location
      const componentData = {
        name: 'Test Resistor',
        category: 'passive',
        quantity: 100,
        locationId: testLocationId
      };
      await request(app).post('/api/components').send(componentData);

      const response = await request(app)
        .get(`/api/locations/${testLocationId}/components`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(1);
      expect(response.body[0].name).toBe('Test Resistor');
      expect(response.body[0].locationId).toBe(testLocationId);
    });

    it('should return empty array for location with no components', async () => {
      const response = await request(app)
        .get(`/api/locations/${testLocationId}/components`)
        .expect(200);

      expect(response.body).toEqual([]);
    });

    it('should handle JSON parsing for component tags and protocols', async () => {
      const componentData = {
        name: 'Test IC',
        category: 'integrated_circuit',
        tags: ['microcontroller', 'arduino'],
        protocols: ['SPI', 'I2C'],
        locationId: testLocationId
      };
      await request(app).post('/api/components').send(componentData);

      const response = await request(app)
        .get(`/api/locations/${testLocationId}/components`)
        .expect(200);

      expect(response.body[0].tags).toEqual(['microcontroller', 'arduino']);
      expect(response.body[0].protocols).toEqual(['SPI', 'I2C']);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle malformed JSON in request body', async () => {
      await request(app)
        .post('/api/locations')
        .type('json')
        .send('{ invalid json')
        .expect(400);
    });

    it('should handle very long location names gracefully', async () => {
      const longName = 'A'.repeat(1000); // Very long name
      const locationData = {
        name: longName,
        type: 'room'
      };

      const response = await request(app)
        .post('/api/locations')
        .send(locationData)
        .expect(201);

      expect(response.body.name).toBe(longName);
    });

    it('should handle special characters in location names', async () => {
      const specialName = 'Test-Location_with.Special@Characters#123!';
      const locationData = {
        name: specialName,
        type: 'room'
      };

      const response = await request(app)
        .post('/api/locations')
        .send(locationData)
        .expect(201);

      expect(response.body.name).toBe(specialName);
    });
  });
});