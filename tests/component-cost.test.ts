import { describe, it, expect, beforeEach } from '@jest/globals';
const request = require('supertest');
import app from '../server/index';

describe('Component Cost Functionality', () => {
  let testLocationId: string;
  let testComponentId: string;

  beforeEach(async () => {
    // Create test location
    const locationResponse = await request(app)
      .post('/api/locations')
      .send({
        name: 'Cost Test Location',
        type: 'cabinet',
        description: 'Location for cost tests'
      })
      .expect(201);
    
    testLocationId = locationResponse.body.id;
  });

  describe('Creating Component with Cost', () => {
    it('should save unit cost and calculate total cost when creating a component', async () => {
      const componentData = {
        name: 'Test Resistor with Cost',
        category: 'passive',
        subcategory: 'resistor',
        manufacturer: 'Test Manufacturing',
        partNumber: 'TST-1K-001',
        description: 'Test resistor 1k ohm for cost validation',
        quantity: 10,
        unitCost: 0.25,
        totalCost: 2.50, // 10 * 0.25
        locationId: testLocationId
      };

      const response = await request(app)
        .post('/api/components')
        .send(componentData)
        .expect(201);

      testComponentId = response.body.id;

      // Verify the response includes cost data
      expect(response.body.unitCost).toBe(0.25);
      expect(response.body.totalCost).toBe(2.50);
      expect(response.body.quantity).toBe(10);
    });

    it('should handle zero unit cost correctly', async () => {
      const componentData = {
        name: 'Free Sample Component',
        category: 'microcontroller',
        quantity: 1,
        unitCost: 0,
        totalCost: 0
      };

      const response = await request(app)
        .post('/api/components')
        .send(componentData)
        .expect(201);

      expect(response.body.unitCost).toBe(0);
      expect(response.body.totalCost).toBe(0);
    });

    it('should handle missing cost fields gracefully', async () => {
      const componentData = {
        name: 'Component without Cost',
        category: 'passive',
        quantity: 5
      };

      const response = await request(app)
        .post('/api/components')
        .send(componentData)
        .expect(201);

      // Should be null or undefined when not provided
      expect(response.body.unitCost).toBeUndefined();
      expect(response.body.totalCost).toBeUndefined();
    });

    it('should handle decimal unit costs correctly', async () => {
      const componentData = {
        name: 'Expensive Component',
        category: 'microcontroller',
        quantity: 2,
        unitCost: 15.99,
        totalCost: 31.98
      };

      const response = await request(app)
        .post('/api/components')
        .send(componentData)
        .expect(201);

      expect(response.body.unitCost).toBe(15.99);
      expect(response.body.totalCost).toBe(31.98);
    });
  });

  describe('Updating Component Cost', () => {
    beforeEach(async () => {
      // Create initial component
      const response = await request(app)
        .post('/api/components')
        .send({
          name: 'Test Component for Updates',
          category: 'passive',
          quantity: 5,
          unitCost: 1.00,
          totalCost: 5.00
        })
        .expect(201);
      
      testComponentId = response.body.id;
    });

    it('should update unit cost and recalculate total cost', async () => {
      const updateData = {
        unitCost: 1.50,
        quantity: 8,
        totalCost: 12.00  // 8 * 1.50
      };

      const response = await request(app)
        .put(`/api/components/${testComponentId}`)
        .send(updateData)
        .expect(200);

      // Get the updated component to verify changes
      const getResponse = await request(app)
        .get(`/api/components/${testComponentId}`)
        .expect(200);

      expect(getResponse.body.unitCost).toBe(1.50);
      expect(getResponse.body.totalCost).toBe(12.00);
      expect(getResponse.body.quantity).toBe(8);
    });

    it('should update only unit cost without changing quantity', async () => {
      const updateData = {
        unitCost: 2.00,
        totalCost: 10.00  // 5 * 2.00 (original quantity)
      };

      const response = await request(app)
        .put(`/api/components/${testComponentId}`)
        .send(updateData)
        .expect(200);

      const getResponse = await request(app)
        .get(`/api/components/${testComponentId}`)
        .expect(200);

      expect(getResponse.body.unitCost).toBe(2.00);
      expect(getResponse.body.totalCost).toBe(10.00);
      expect(getResponse.body.quantity).toBe(5); // Should remain unchanged
    });

    it('should update costs independently', async () => {
      const updateData = {
        unitCost: 3.50
      };

      await request(app)
        .put(`/api/components/${testComponentId}`)
        .send(updateData)
        .expect(200);

      const getResponse = await request(app)
        .get(`/api/components/${testComponentId}`)
        .expect(200);

      expect(getResponse.body.unitCost).toBe(3.50);
      // totalCost should remain the original value since we didn't update it
      expect(getResponse.body.totalCost).toBe(5.00);
    });
  });

  describe('Cost Validation', () => {
    it('should reject negative unit cost', async () => {
      const componentData = {
        name: 'Invalid Cost Component',
        category: 'passive',
        quantity: 1,
        unitCost: -5.00
      };

      const response = await request(app)
        .post('/api/components')
        .send(componentData)
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
    });

    it('should reject negative total cost', async () => {
      const componentData = {
        name: 'Invalid Total Cost Component',
        category: 'passive',
        quantity: 1,
        unitCost: 1.00,
        totalCost: -10.00
      };

      const response = await request(app)
        .post('/api/components')
        .send(componentData)
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
    });

    it('should handle very large cost values', async () => {
      const componentData = {
        name: 'Expensive Component',
        category: 'microcontroller',
        quantity: 1,
        unitCost: 999999.99,
        totalCost: 999999.99
      };

      const response = await request(app)
        .post('/api/components')
        .send(componentData)
        .expect(201);

      expect(response.body.unitCost).toBe(999999.99);
      expect(response.body.totalCost).toBe(999999.99);
    });
  });

  describe('Cost Search and Filtering', () => {
    beforeEach(async () => {
      // Create components with different costs for filtering tests
      const components = [
        { name: 'CostSearch Cheap Part', category: 'passive', quantity: 10, unitCost: 0.10, totalCost: 1.00 },
        { name: 'CostSearch Medium Part', category: 'passive', quantity: 5, unitCost: 5.00, totalCost: 25.00 },
        { name: 'CostSearch Expensive Part', category: 'passive', quantity: 2, unitCost: 50.00, totalCost: 100.00 }
      ];

      for (const comp of components) {
        await request(app)
          .post('/api/components')
          .send(comp)
          .expect(201);
      }
    });

    it('should retrieve all components with cost information', async () => {
      const response = await request(app)
        .get('/api/components?term=CostSearch Expensive')
        .expect(200);

      expect(response.body.length).toBeGreaterThanOrEqual(1);
      
      const expensiveComp = response.body.find((c: any) => c.name === 'CostSearch Expensive Part');
      expect(expensiveComp).toBeDefined();
      expect(expensiveComp.unitCost).toBe(50.00);
      expect(expensiveComp.totalCost).toBe(100.00);
    });
  });

  describe('Frontend Form Integration', () => {
    it('should handle cost calculation when quantity changes', async () => {
      // This test simulates how the frontend form calculates totalCost
      const unitCost = 2.50;
      const quantity = 8;
      const expectedTotalCost = unitCost * quantity;

      const componentData = {
        name: 'Frontend Form Test Component',
        category: 'passive',
        quantity: quantity,
        unitCost: unitCost,
        totalCost: expectedTotalCost
      };

      const response = await request(app)
        .post('/api/components')
        .send(componentData)
        .expect(201);

      expect(response.body.unitCost).toBe(unitCost);
      expect(response.body.totalCost).toBe(expectedTotalCost);
      expect(response.body.quantity).toBe(quantity);
    });
  });
});