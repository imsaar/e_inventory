import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
const request = require('supertest');
import app from '../server/index';
import fs from 'fs';
import path from 'path';

describe('OrderForm Component Addition and Saving', () => {
  let testComponents: any[] = [];
  let testOrders: any[] = [];

  beforeEach(async () => {
    // Clean up existing test data
    const components = await request(app).get('/api/components');
    for (const component of components.body) {
      if (component.name.includes('OrderForm Test')) {
        await request(app).delete(`/api/components/${component.id}`);
      }
    }

    const orders = await request(app).get('/api/orders');
    for (const order of orders.body) {
      if (order.supplier === 'OrderForm Test Supplier') {
        await request(app).delete(`/api/orders/${order.id}`);
      }
    }

    // Create test components for order testing
    const componentData = [
      {
        name: 'OrderForm Test Component 1',
        category: 'ICs',
        quantity: 10,
        unitCost: 5.99,
        description: 'Test component for order form testing'
      },
      {
        name: 'OrderForm Test Component 2', 
        category: 'Passive Components',
        quantity: 20,
        unitCost: 2.50,
        description: 'Another test component for order form testing'
      }
    ];

    for (const data of componentData) {
      const response = await request(app)
        .post('/api/components')
        .send(data)
        .expect(201);
      testComponents.push(response.body);
    }
  });

  afterEach(async () => {
    // Clean up test data
    for (const component of testComponents) {
      try {
        await request(app).delete(`/api/components/${component.id}`);
      } catch (error) {
        // Ignore cleanup errors
      }
    }

    for (const order of testOrders) {
      try {
        await request(app).delete(`/api/orders/${order.id}`);
      } catch (error) {
        // Ignore cleanup errors
      }
    }

    testComponents = [];
    testOrders = [];
  });

  describe('Order Creation with Components', () => {
    it('should create new order with component items successfully', async () => {
      const orderData = {
        orderDate: '2024-01-15',
        supplier: 'OrderForm Test Supplier',
        orderNumber: 'TEST-ORDER-001',
        notes: 'Test order creation',
        status: 'pending',
        totalAmount: 25.48,
        items: [
          {
            componentId: testComponents[0].id,
            quantity: 2,
            unitCost: 5.99,
            notes: ''
          },
          {
            componentId: testComponents[1].id,
            quantity: 5,
            unitCost: 2.50,
            notes: ''
          }
        ]
      };

      const response = await request(app)
        .post('/api/orders')
        .send(orderData)
        .expect(201);

      expect(response.body.id).toBeDefined();
      expect(response.body.orderDate).toBe('2024-01-15');
      expect(response.body.supplier).toBe('OrderForm Test Supplier');
      expect(response.body.totalAmount).toBe(25.48);
      
      testOrders.push(response.body);

      // Verify order items were created
      const orderWithItems = await request(app)
        .get(`/api/orders/${response.body.id}`)
        .expect(200);

      expect(orderWithItems.body.items).toHaveLength(2);
      expect(orderWithItems.body.items[0].componentId).toBe(testComponents[0].id);
      expect(orderWithItems.body.items[1].componentId).toBe(testComponents[1].id);
    });

    it('should validate required fields when creating order', async () => {
      const invalidOrderData = {
        // Missing required orderDate
        supplier: 'Test Supplier',
        totalAmount: 10.00,
        items: []
      };

      const response = await request(app)
        .post('/api/orders')
        .send(invalidOrderData)
        .expect(400);

      expect(response.body.error).toBeDefined();
    });

    it('should validate that components exist when adding to order', async () => {
      const orderData = {
        orderDate: '2024-01-15',
        supplier: 'OrderForm Test Supplier',
        orderNumber: 'TEST-INVALID-COMP',
        totalAmount: 10.00,
        items: [
          {
            componentId: 'nonexistent-component-id',
            quantity: 1,
            unitCost: 10.00,
            notes: ''
          }
        ]
      };

      const response = await request(app)
        .post('/api/orders')
        .send(orderData)
        .expect(400);

      expect(response.body.error).toContain('Component not found');
    });
  });

  describe('Order Editing and Updates', () => {
    let testOrderId: string;

    beforeEach(async () => {
      // Create an order to test editing
      const orderData = {
        orderDate: '2024-01-10',
        supplier: 'OrderForm Test Supplier',
        orderNumber: 'TEST-EDIT-001',
        notes: 'Original test order',
        status: 'pending',
        totalAmount: 11.98,
        items: [
          {
            componentId: testComponents[0].id,
            quantity: 2,
            unitCost: 5.99,
            notes: 'Original item'
          }
        ]
      };

      const response = await request(app)
        .post('/api/orders')
        .send(orderData)
        .expect(201);

      testOrderId = response.body.id;
      testOrders.push(response.body);
    });

    it('should update existing order successfully', async () => {
      const updateData = {
        orderDate: '2024-01-11',
        supplier: 'OrderForm Test Supplier Updated',
        orderNumber: 'TEST-EDIT-001-UPDATED',
        notes: 'Updated test order notes',
        status: 'ordered',
        totalAmount: 20.47,
        items: [
          {
            componentId: testComponents[0].id,
            quantity: 1,
            unitCost: 5.99,
            notes: 'Updated item'
          },
          {
            componentId: testComponents[1].id,
            quantity: 6,
            unitCost: 2.41,
            notes: 'New item added'
          }
        ]
      };

      const response = await request(app)
        .put(`/api/orders/${testOrderId}`)
        .send(updateData)
        .expect(200);

      expect(response.body.orderDate).toBe('2024-01-11');
      expect(response.body.supplier).toBe('OrderForm Test Supplier Updated');
      expect(response.body.status).toBe('ordered');
      expect(response.body.totalAmount).toBe(20.47);

      // Verify items were updated
      const updatedOrder = await request(app)
        .get(`/api/orders/${testOrderId}`)
        .expect(200);

      expect(updatedOrder.body.items).toHaveLength(2);
      expect(updatedOrder.body.items.find((item: any) => item.componentId === testComponents[1].id)).toBeDefined();
    });

    it('should retrieve order with correct date format for editing', async () => {
      const response = await request(app)
        .get(`/api/orders/${testOrderId}`)
        .expect(200);

      expect(response.body.id).toBe(testOrderId);
      expect(response.body.orderDate).toBe('2024-01-10');
      expect(response.body.supplier).toBe('OrderForm Test Supplier');
      expect(response.body.items).toBeDefined();
      expect(response.body.items).toHaveLength(1);
    });

    it('should handle date format conversion correctly', async () => {
      // Test with timestamp that includes time
      const updateWithTimestamp = {
        orderDate: '2024-01-12T10:30:00.000Z',
        supplier: 'OrderForm Test Supplier',
        totalAmount: 11.98,
        items: [{
          componentId: testComponents[0].id,
          quantity: 2,
          unitCost: 5.99,
          notes: ''
        }]
      };

      const response = await request(app)
        .put(`/api/orders/${testOrderId}`)
        .send(updateWithTimestamp)
        .expect(200);

      // Should store as date only, not timestamp
      expect(response.body.orderDate).toBe('2024-01-12');
    });

    it('should handle missing order gracefully', async () => {
      const response = await request(app)
        .get('/api/orders/nonexistent-order-id')
        .expect(404);

      expect(response.body.error).toContain('Order not found');
    });
  });

  describe('Order Status Management', () => {
    it('should accept all valid order statuses', async () => {
      const statuses = ['pending', 'ordered', 'shipped', 'delivered', 'cancelled'];

      for (const status of statuses) {
        const orderData = {
          orderDate: '2024-01-15',
          supplier: `OrderForm Test Supplier ${status}`,
          orderNumber: `TEST-STATUS-${status}`,
          status,
          totalAmount: 10.00,
          items: [{
            componentId: testComponents[0].id,
            quantity: 1,
            unitCost: 10.00,
            notes: ''
          }]
        };

        const response = await request(app)
          .post('/api/orders')
          .send(orderData)
          .expect(201);

        expect(response.body.status).toBe(status);
        testOrders.push(response.body);
      }
    });

    it('should reject invalid order status', async () => {
      const orderData = {
        orderDate: '2024-01-15',
        supplier: 'OrderForm Test Supplier',
        status: 'invalid-status',
        totalAmount: 10.00,
        items: [{
          componentId: testComponents[0].id,
          quantity: 1,
          unitCost: 10.00,
          notes: ''
        }]
      };

      const response = await request(app)
        .post('/api/orders')
        .send(orderData)
        .expect(400);

      expect(response.body.error).toContain('status');
    });
  });

  describe('Order Item Calculations', () => {
    it('should calculate total amount correctly', async () => {
      const orderData = {
        orderDate: '2024-01-15',
        supplier: 'OrderForm Test Supplier',
        orderNumber: 'TEST-CALC-001',
        totalAmount: 35.94, // 2 * 5.99 + 4 * 5.99
        items: [
          {
            componentId: testComponents[0].id,
            quantity: 2,
            unitCost: 5.99,
            notes: ''
          },
          {
            componentId: testComponents[0].id,
            quantity: 4,
            unitCost: 5.99,
            notes: ''
          }
        ]
      };

      const response = await request(app)
        .post('/api/orders')
        .send(orderData)
        .expect(201);

      expect(response.body.totalAmount).toBe(35.94);
      testOrders.push(response.body);
    });

    it('should validate quantity and unit cost are positive', async () => {
      const orderData = {
        orderDate: '2024-01-15',
        supplier: 'OrderForm Test Supplier',
        totalAmount: 10.00,
        items: [
          {
            componentId: testComponents[0].id,
            quantity: -1, // Invalid negative quantity
            unitCost: 5.99,
            notes: ''
          }
        ]
      };

      const response = await request(app)
        .post('/api/orders')
        .send(orderData)
        .expect(400);

      expect(response.body.error).toBeDefined();
    });
  });

  describe('Order Item Component Linking', () => {
    it('should properly link order items to components', async () => {
      const orderData = {
        orderDate: '2024-01-15',
        supplier: 'OrderForm Test Supplier',
        orderNumber: 'TEST-LINK-001',
        totalAmount: 17.47,
        items: [
          {
            componentId: testComponents[0].id,
            quantity: 1,
            unitCost: 5.99,
            notes: 'First component'
          },
          {
            componentId: testComponents[1].id,
            quantity: 4,
            unitCost: 2.87,
            notes: 'Second component'
          }
        ]
      };

      const response = await request(app)
        .post('/api/orders')
        .send(orderData)
        .expect(201);

      testOrders.push(response.body);

      // Verify component linking in retrieved order
      const orderWithItems = await request(app)
        .get(`/api/orders/${response.body.id}`)
        .expect(200);

      expect(orderWithItems.body.items).toHaveLength(2);
      
      const item1 = orderWithItems.body.items.find((item: any) => item.componentId === testComponents[0].id);
      const item2 = orderWithItems.body.items.find((item: any) => item.componentId === testComponents[1].id);
      
      expect(item1).toBeDefined();
      expect(item1.componentName).toBe('OrderForm Test Component 1');
      expect(item1.quantity).toBe(1);
      
      expect(item2).toBeDefined();
      expect(item2.componentName).toBe('OrderForm Test Component 2');
      expect(item2.quantity).toBe(4);
    });

    it('should handle order items with same component multiple times', async () => {
      const orderData = {
        orderDate: '2024-01-15',
        supplier: 'OrderForm Test Supplier',
        orderNumber: 'TEST-DUP-001',
        totalAmount: 23.96,
        items: [
          {
            componentId: testComponents[0].id,
            quantity: 2,
            unitCost: 5.99,
            notes: 'First batch'
          },
          {
            componentId: testComponents[0].id,
            quantity: 2,
            unitCost: 5.99,
            notes: 'Second batch'
          }
        ]
      };

      const response = await request(app)
        .post('/api/orders')
        .send(orderData)
        .expect(201);

      testOrders.push(response.body);

      const orderWithItems = await request(app)
        .get(`/api/orders/${response.body.id}`)
        .expect(200);

      expect(orderWithItems.body.items).toHaveLength(2);
      expect(orderWithItems.body.items[0].componentId).toBe(testComponents[0].id);
      expect(orderWithItems.body.items[1].componentId).toBe(testComponents[0].id);
    });
  });
});