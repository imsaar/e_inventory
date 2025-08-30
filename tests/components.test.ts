import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
const request = require('supertest');
import app from '../server/index';
import { Component } from '../src/types';

describe('Components API', () => {
  let testComponentId: string;
  let testLocationId: string;

  beforeEach(async () => {
    // Clean up any existing test components
    const components = await request(app).get('/api/components');
    for (const component of components.body) {
      if (component.name.includes('Test')) {
        await request(app).delete(`/api/components/${component.id}`);
      }
    }

    // Create a test location for components
    const locationData = {
      name: 'Test Component Location',
      type: 'box'
    };
    const locationResponse = await request(app)
      .post('/api/locations')
      .send(locationData);
    testLocationId = locationResponse.body.id;
  });

  describe('POST /api/components', () => {
    it('should create a new component successfully', async () => {
      const componentData = {
        name: 'Test Resistor 1K',
        category: 'passive',
        subcategory: 'resistor',
        partNumber: 'RES-1K-0.25W',
        manufacturer: 'Test Electronics',
        description: '1KΩ resistor, 1/4W, 5% tolerance',
        quantity: 100,
        minThreshold: 10,
        unitCost: 0.05,
        locationId: testLocationId,
        tags: ['resistor', '1k', 'through-hole']
      };

      const response = await request(app)
        .post('/api/components')
        .send(componentData)
        .expect(201);

      expect(response.body).toMatchObject({
        name: 'Test Resistor 1K',
        category: 'passive',
        subcategory: 'resistor',
        partNumber: 'RES-1K-0.25W',
        manufacturer: 'Test Electronics',
        quantity: 100,
        minThreshold: 10,
        unitCost: 0.05,
        locationId: testLocationId
      });
      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('createdAt');
      expect(response.body).toHaveProperty('updatedAt');
      
      testComponentId = response.body.id;
    });

    it('should create component with complex specifications', async () => {
      const componentData = {
        name: 'Test Microcontroller',
        category: 'integrated_circuit',
        subcategory: 'microcontroller',
        partNumber: 'ATMEGA328P',
        quantity: 25,
        packageType: 'DIP-28',
        voltage: { min: 1.8, max: 5.5, typical: 5.0, unit: 'V' },
        current: { max: 200, unit: 'mA' },
        pinCount: 28,
        protocols: ['SPI', 'I2C', 'UART'],
        tags: ['arduino', 'avr', '8-bit'],
        dimensions: { length: 35.56, width: 7.62, height: 4.57, unit: 'mm' },
        weight: { value: 2.5, unit: 'g' }
      };

      const response = await request(app)
        .post('/api/components')
        .send(componentData)
        .expect(201);

      expect(response.body.protocols).toEqual(['SPI', 'I2C', 'UART']);
      expect(response.body.tags).toEqual(['arduino', 'avr', '8-bit']);
      expect(response.body.voltage).toEqual({ min: 1.8, max: 5.5, typical: 5.0, unit: 'V' });
      expect(response.body.pinCount).toBe(28);
    });

    it('should require name and category fields', async () => {
      const incompleteData = {
        partNumber: 'TEST-001'
        // Missing required name and category
      };

      await request(app)
        .post('/api/components')
        .send(incompleteData)
        .expect(500); // SQLite NOT NULL constraint error
    });

    it('should set default values correctly', async () => {
      const minimalData = {
        name: 'Test Minimal Component',
        category: 'other'
      };

      const response = await request(app)
        .post('/api/components')
        .send(minimalData)
        .expect(201);

      expect(response.body.quantity).toBe(0);
      expect(response.body.minThreshold).toBe(0);
      expect(response.body.status).toBe('available');
      expect(response.body.tags).toEqual([]);
      expect(response.body.protocols).toEqual([]);
    });

    it('should validate JSON fields are properly stored', async () => {
      const componentData = {
        name: 'Test JSON Component',
        category: 'passive',
        tags: ['test', 'json', 'validation'],
        protocols: ['USB', 'Ethernet'],
        dimensions: { length: 10, width: 5, unit: 'mm' }
      };

      const response = await request(app)
        .post('/api/components')
        .send(componentData)
        .expect(201);

      // Verify JSON fields are properly parsed
      expect(Array.isArray(response.body.tags)).toBe(true);
      expect(Array.isArray(response.body.protocols)).toBe(true);
      expect(typeof response.body.dimensions).toBe('object');
    });
  });

  describe('GET /api/components', () => {
    beforeEach(async () => {
      // Create test components with different categories and properties
      const components = [
        {
          name: 'Test Resistor 10K',
          category: 'passive',
          subcategory: 'resistor',
          manufacturer: 'TestCorp',
          quantity: 50,
          status: 'available',
          locationId: testLocationId
        },
        {
          name: 'Test Capacitor 100uF',
          category: 'passive',
          subcategory: 'capacitor',
          manufacturer: 'TestCorp',
          quantity: 25,
          status: 'available',
          locationId: testLocationId
        },
        {
          name: 'Test LED Red',
          category: 'active',
          subcategory: 'led',
          manufacturer: 'LEDCorp',
          quantity: 100,
          status: 'available'
        }
      ];

      for (const comp of components) {
        await request(app).post('/api/components').send(comp);
      }
    });

    it('should return all components', async () => {
      const response = await request(app)
        .get('/api/components')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThanOrEqual(3);
      
      const testComponents = response.body.filter((c: any) => c.name.startsWith('Test'));
      expect(testComponents.length).toBe(3);
    });

    it('should filter by category', async () => {
      const response = await request(app)
        .get('/api/components?category=passive')
        .expect(200);

      expect(response.body.every((c: any) => c.category === 'passive')).toBe(true);
      expect(response.body.length).toBeGreaterThanOrEqual(2);
    });

    it('should filter by subcategory', async () => {
      const response = await request(app)
        .get('/api/components?subcategory=resistor')
        .expect(200);

      expect(response.body.every((c: any) => c.subcategory === 'resistor')).toBe(true);
    });

    it('should filter by manufacturer', async () => {
      const response = await request(app)
        .get('/api/components?manufacturer=TestCorp')
        .expect(200);

      expect(response.body.every((c: any) => c.manufacturer === 'TestCorp')).toBe(true);
    });

    it('should filter by status', async () => {
      const response = await request(app)
        .get('/api/components?status=available')
        .expect(200);

      expect(response.body.every((c: any) => c.status === 'available')).toBe(true);
    });

    it('should filter by location', async () => {
      const response = await request(app)
        .get(`/api/components?locationId=${testLocationId}`)
        .expect(200);

      expect(response.body.every((c: any) => c.locationId === testLocationId)).toBe(true);
    });

    it('should filter by quantity range', async () => {
      const response = await request(app)
        .get('/api/components?minQuantity=30&maxQuantity=60')
        .expect(200);

      expect(response.body.every((c: any) => c.quantity >= 30 && c.quantity <= 60)).toBe(true);
    });

    it('should search in name, part number, and description', async () => {
      const response = await request(app)
        .get('/api/components?search=10K')
        .expect(200);

      expect(response.body.some((c: any) => c.name.includes('10K'))).toBe(true);
    });

    it('should combine multiple filters', async () => {
      const response = await request(app)
        .get('/api/components?category=passive&manufacturer=TestCorp&minQuantity=20')
        .expect(200);

      response.body.forEach((c: any) => {
        expect(c.category).toBe('passive');
        expect(c.manufacturer).toBe('TestCorp');
        expect(c.quantity).toBeGreaterThanOrEqual(20);
      });
    });
  });

  describe('GET /api/components/:id', () => {
    beforeEach(async () => {
      const componentData = {
        name: 'Test Single Component',
        category: 'passive',
        description: 'Component for single retrieval test',
        tags: ['test', 'single'],
        protocols: ['test-protocol']
      };
      const response = await request(app)
        .post('/api/components')
        .send(componentData);
      testComponentId = response.body.id;
    });

    it('should return specific component by ID', async () => {
      const response = await request(app)
        .get(`/api/components/${testComponentId}`)
        .expect(200);

      expect(response.body.id).toBe(testComponentId);
      expect(response.body.name).toBe('Test Single Component');
      expect(response.body.tags).toEqual(['test', 'single']);
      expect(response.body.protocols).toEqual(['test-protocol']);
    });

    it('should return 404 for non-existent component', async () => {
      const response = await request(app)
        .get('/api/components/non-existent-id')
        .expect(404);

      expect(response.body.error).toBe('Component not found');
    });

    it('should properly parse JSON fields', async () => {
      const response = await request(app)
        .get(`/api/components/${testComponentId}`)
        .expect(200);

      expect(Array.isArray(response.body.tags)).toBe(true);
      expect(Array.isArray(response.body.protocols)).toBe(true);
    });
  });

  describe('PUT /api/components/:id', () => {
    beforeEach(async () => {
      const componentData = {
        name: 'Test Update Component',
        category: 'passive',
        quantity: 50,
        minThreshold: 5,
        status: 'available'
      };
      const response = await request(app)
        .post('/api/components')
        .send(componentData);
      testComponentId = response.body.id;
    });

    it('should update component successfully', async () => {
      const updateData = {
        name: 'Updated Test Component',
        quantity: 75,
        minThreshold: 10,
        status: 'reserved' as const
      };

      const response = await request(app)
        .put(`/api/components/${testComponentId}`)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);

      // Verify the update by fetching the component
      const getResponse = await request(app)
        .get(`/api/components/${testComponentId}`)
        .expect(200);

      expect(getResponse.body.name).toBe('Updated Test Component');
      expect(getResponse.body.quantity).toBe(75);
      expect(getResponse.body.status).toBe('reserved');
    });

    it('should return 404 for non-existent component', async () => {
      const updateData = { name: 'Updated Name' };
      
      await request(app)
        .put('/api/components/non-existent-id')
        .send(updateData)
        .expect(404);
    });

    it('should handle partial updates', async () => {
      const updateData = { description: 'Updated description only' };

      await request(app)
        .put(`/api/components/${testComponentId}`)
        .send(updateData)
        .expect(200);

      const getResponse = await request(app)
        .get(`/api/components/${testComponentId}`)
        .expect(200);

      expect(getResponse.body.name).toBe('Test Update Component'); // Unchanged
      expect(getResponse.body.description).toBe('Updated description only');
    });

    it('should update JSON fields correctly', async () => {
      const updateData = {
        tags: ['updated', 'test', 'tags'],
        protocols: ['UPDATED_PROTOCOL'],
        voltage: { min: 3.0, max: 3.6, unit: 'V' }
      };

      await request(app)
        .put(`/api/components/${testComponentId}`)
        .send(updateData)
        .expect(200);

      const getResponse = await request(app)
        .get(`/api/components/${testComponentId}`)
        .expect(200);

      expect(getResponse.body.tags).toEqual(['updated', 'test', 'tags']);
      expect(getResponse.body.protocols).toEqual(['UPDATED_PROTOCOL']);
      expect(getResponse.body.voltage).toEqual({ min: 3.0, max: 3.6, unit: 'V' });
    });

    it('should create component history entry for quantity changes', async () => {
      const updateData = { quantity: 25 }; // Changed from 50 to 25

      await request(app)
        .put(`/api/components/${testComponentId}`)
        .send(updateData)
        .expect(200);

      // Check if history entry was created
      const historyResponse = await request(app)
        .get(`/api/components/${testComponentId}/history`)
        .expect(200);

      expect(Array.isArray(historyResponse.body)).toBe(true);
      expect(historyResponse.body.length).toBeGreaterThan(0);
      
      // Should have 'added' entry from creation and 'updated' entry from quantity change
      const updateEntry = historyResponse.body.find((h: any) => h.action === 'updated');
      expect(updateEntry).toBeDefined();
    });
  });

  describe('DELETE /api/components/:id', () => {
    beforeEach(async () => {
      const componentData = {
        name: 'Test Delete Component',
        category: 'passive'
      };
      const response = await request(app)
        .post('/api/components')
        .send(componentData);
      testComponentId = response.body.id;
    });

    it('should delete component successfully', async () => {
      await request(app)
        .delete(`/api/components/${testComponentId}`)
        .expect(200);

      // Verify component is deleted
      await request(app)
        .get(`/api/components/${testComponentId}`)
        .expect(404);
    });

    it('should return 404 for non-existent component', async () => {
      await request(app)
        .delete('/api/components/non-existent-id')
        .expect(404);
    });

    it('should return success message', async () => {
      const response = await request(app)
        .delete(`/api/components/${testComponentId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('GET /api/components/:id/history', () => {
    beforeEach(async () => {
      const componentData = {
        name: 'Test History Component',
        category: 'passive',
        quantity: 100
      };
      const response = await request(app)
        .post('/api/components')
        .send(componentData);
      testComponentId = response.body.id;
    });

    it('should return component history', async () => {
      const response = await request(app)
        .get(`/api/components/${testComponentId}/history`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      
      // Should have at least one 'added' entry from component creation
      const addedEntry = response.body.find((h: any) => h.action === 'added');
      expect(addedEntry).toBeDefined();
      expect(addedEntry.component_id).toBe(testComponentId);
    });

    it('should return empty array for component with no history', async () => {
      // This shouldn't happen in practice as component creation adds history,
      // but test the endpoint behavior
      const response = await request(app)
        .get('/api/components/non-existent-id/history')
        .expect(200);

      expect(response.body).toEqual([]);
    });

    it('should order history by timestamp descending', async () => {
      // Update component to create more history entries
      await request(app)
        .put(`/api/components/${testComponentId}`)
        .send({ quantity: 80 });

      await request(app)
        .put(`/api/components/${testComponentId}`)
        .send({ quantity: 60 });

      const response = await request(app)
        .get(`/api/components/${testComponentId}/history`)
        .expect(200);

      expect(response.body.length).toBeGreaterThanOrEqual(3); // added + 2 updates

      // Check if ordered by timestamp desc (most recent first)
      for (let i = 1; i < response.body.length; i++) {
        const current = new Date(response.body[i-1].timestamp);
        const next = new Date(response.body[i].timestamp);
        expect(current.getTime()).toBeGreaterThanOrEqual(next.getTime());
      }
    });
  });

  describe('GET /api/components/alerts/low-stock', () => {
    beforeEach(async () => {
      // Create components with different stock levels
      const components = [
        { name: 'Test Low Stock 1', category: 'passive', quantity: 2, minThreshold: 10 },
        { name: 'Test Low Stock 2', category: 'passive', quantity: 5, minThreshold: 8 },
        { name: 'Test Good Stock', category: 'passive', quantity: 50, minThreshold: 10 },
        { name: 'Test No Threshold', category: 'passive', quantity: 1, minThreshold: 0 }
      ];

      for (const comp of components) {
        await request(app).post('/api/components').send(comp);
      }
    });

    it('should return components with low stock', async () => {
      const response = await request(app)
        .get('/api/components/alerts/low-stock')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      
      // Should return components where quantity <= minThreshold AND minThreshold > 0
      const lowStockComponents = response.body.filter((c: any) => c.name.startsWith('Test Low Stock'));
      expect(lowStockComponents.length).toBe(2);

      response.body.forEach((c: any) => {
        expect(c.quantity).toBeLessThanOrEqual(c.minThreshold);
        expect(c.minThreshold).toBeGreaterThan(0);
      });
    });

    it('should order by most urgent (lowest relative stock)', async () => {
      const response = await request(app)
        .get('/api/components/alerts/low-stock')
        .expect(200);

      if (response.body.length > 1) {
        for (let i = 1; i < response.body.length; i++) {
          const prevDiff = response.body[i-1].quantity - response.body[i-1].minThreshold;
          const currDiff = response.body[i].quantity - response.body[i].minThreshold;
          expect(prevDiff).toBeLessThanOrEqual(currDiff);
        }
      }
    });

    it('should not include components with zero threshold', async () => {
      const response = await request(app)
        .get('/api/components/alerts/low-stock')
        .expect(200);

      const zeroThresholdComponents = response.body.filter((c: any) => c.minThreshold === 0);
      expect(zeroThresholdComponents.length).toBe(0);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle malformed JSON in request body', async () => {
      await request(app)
        .post('/api/components')
        .type('json')
        .send('{ invalid json')
        .expect(400);
    });

    it('should handle invalid status values', async () => {
      const componentData = {
        name: 'Test Invalid Status',
        category: 'passive',
        status: 'invalid_status'
      };

      await request(app)
        .post('/api/components')
        .send(componentData)
        .expect(500); // SQLite constraint error
    });

    it('should handle very long component names gracefully', async () => {
      const longName = 'A'.repeat(1000);
      const componentData = {
        name: longName,
        category: 'passive'
      };

      const response = await request(app)
        .post('/api/components')
        .send(componentData)
        .expect(201);

      expect(response.body.name).toBe(longName);
    });

    it('should handle special characters in component data', async () => {
      const componentData = {
        name: 'Test-Component_with.Special@Characters#123!',
        category: 'passive',
        partNumber: 'PART-123/ABC.XYZ',
        description: 'Description with "quotes" and special chars: <>[]{}|\\',
        tags: ['tag-with-dash', 'tag_with_underscore', 'tag.with.dot']
      };

      const response = await request(app)
        .post('/api/components')
        .send(componentData)
        .expect(201);

      expect(response.body.name).toBe('Test-Component_with.Special@Characters#123!');
      expect(response.body.partNumber).toBe('PART-123/ABC.XYZ');
      expect(response.body.tags).toEqual(['tag-with-dash', 'tag_with_underscore', 'tag.with.dot']);
    });

    it('should handle empty arrays in JSON fields', async () => {
      const componentData = {
        name: 'Test Empty Arrays',
        category: 'passive',
        tags: [],
        protocols: []
      };

      const response = await request(app)
        .post('/api/components')
        .send(componentData)
        .expect(201);

      expect(response.body.tags).toEqual([]);
      expect(response.body.protocols).toEqual([]);
    });

    it('should handle null values in optional fields', async () => {
      const componentData = {
        name: 'Test Null Values',
        category: 'passive',
        description: null,
        partNumber: null,
        manufacturer: null,
        supplier: null
      };

      const response = await request(app)
        .post('/api/components')
        .send(componentData)
        .expect(201);

      expect(response.body.description).toBeNull();
      expect(response.body.partNumber).toBeNull();
      expect(response.body.manufacturer).toBeNull();
      expect(response.body.supplier).toBeNull();
    });
  });
});