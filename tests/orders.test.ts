import { describe, it, expect, beforeEach } from '@jest/globals';
const request = require('supertest');
import app from '../server/index';
import Database from 'better-sqlite3';

describe('Orders Management', () => {
  let testComponentIds: string[] = [];
  let testOrderIds: string[] = [];
  
  beforeEach(async () => {
    // Reset arrays
    testComponentIds = [];
    testOrderIds = [];
    
    // Clean up existing test orders
    const orders = await request(app).get('/api/orders');
    for (const order of orders.body) {
      if (order.orderNumber?.includes('TEST') || order.supplier?.includes('Test')) {
        await request(app).delete(`/api/orders/${order.id}`);
      }
    }
    
    // Clean up existing test components
    const components = await request(app).get('/api/components');
    for (const component of components.body) {
      if (component.name?.includes('Test')) {
        await request(app).delete(`/api/components/${component.id}`);
      }
    }
    
    // Create test data
    await createTestData();
  });

  async function createTestData() {
    // First create test location
    const locationData = {
      name: 'Test Order Location',
      type: 'box'
    };
    const locationResponse = await request(app)
      .post('/api/locations')
      .send(locationData);
    const testLocationId = locationResponse.body.id;

    // Create test components
    for (let i = 0; i < 3; i++) {
      const componentData = {
        name: `Test Component ${i + 1}`,
        category: 'electronic',
        subcategory: 'resistor',
        partNumber: `TEST-COMP-${i + 1}`,
        manufacturer: 'Test Manufacturer',
        description: `Test component ${i + 1} for order testing`,
        quantity: 100,
        minThreshold: 10,
        unitCost: 1.00,
        locationId: testLocationId,
        tags: ['test', 'resistor']
      };

      const componentResponse = await request(app)
        .post('/api/components')
        .send(componentData);
      
      testComponentIds.push(componentResponse.body.id);
    }
    
    // Create test orders with items
    for (let i = 0; i < 3; i++) {
      const orderData = {
        orderDate: '2024-01-01',
        supplier: `Test Supplier ${i + 1}`,
        orderNumber: `TEST-ORD-${i + 1}`,
        notes: `Test order ${i + 1}`,
        totalAmount: 50.00,
        status: 'delivered',
        items: [{
          componentId: testComponentIds[i],
          quantity: 10,
          unitCost: 5.00,
          notes: `Test order item ${i + 1}`
        }]
      };

      const orderResponse = await request(app)
        .post('/api/orders')
        .send(orderData);
      
      testOrderIds.push(orderResponse.body.id);
    }
  }
  
  describe('Order CRUD Operations', () => {
    test('should list all orders', async () => {
      const response = await request(app)
        .get('/api/orders')
        .expect(200);
      
      const testOrders = response.body.filter((order: any) => order.orderNumber?.includes('TEST-ORD'));
      expect(testOrders).toHaveLength(3);
      expect(testOrders[0]).toHaveProperty('orderNumber', 'TEST-ORD-1');
      expect(testOrders[0]).toHaveProperty('supplier', 'Test Supplier 1');
      expect(testOrders[0]).toHaveProperty('itemCount', 1);
    });
    
    test('should get specific order with items', async () => {
      const response = await request(app)
        .get(`/api/orders/${testOrderIds[0]}`)
        .expect(200);
      
      expect(response.body).toHaveProperty('id', testOrderIds[0]);
      expect(response.body).toHaveProperty('orderNumber', 'TEST-ORD-1');
      expect(response.body.items).toHaveLength(1);
      expect(response.body.items[0]).toHaveProperty('componentName', 'Test Component 1');
      expect(response.body.items[0]).toHaveProperty('quantity', 10);
    });
    
    test('should delete single order and reverse quantities', async () => {
      // Get initial component quantity
      const initialComponentResponse = await request(app).get(`/api/components/${testComponentIds[0]}`);
      const initialQuantity = initialComponentResponse.body.quantity;
      expect(initialQuantity).toBe(110); // 100 initial + 10 from order
      
      const response = await request(app)
        .delete(`/api/orders/${testOrderIds[0]}`)
        .expect(200);
      
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('deleted', 1);
      
      // Check component quantity was reversed
      const updatedComponentResponse = await request(app).get(`/api/components/${testComponentIds[0]}`);
      const updatedQuantity = updatedComponentResponse.body.quantity;
      expect(updatedQuantity).toBe(100); // Back to original
      
      // Check order was deleted
      const deletedOrderResponse = await request(app).get(`/api/orders/${testOrderIds[0]}`);
      expect(deletedOrderResponse.status).toBe(404);
    });
  });
  
  describe('Bulk Delete Operations', () => {
    test('should delete multiple orders successfully', async () => {
      // Check initial quantities
      const initialComp1Response = await request(app).get(`/api/components/${testComponentIds[0]}`);
      const initialComp2Response = await request(app).get(`/api/components/${testComponentIds[1]}`);
      expect(initialComp1Response.body.quantity).toBe(110);
      expect(initialComp2Response.body.quantity).toBe(110);
      
      const response = await request(app)
        .post('/api/orders/bulk-delete')
        .send({
          orderIds: [testOrderIds[0], testOrderIds[1]]
        })
        .expect(200);
      
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message', 'Successfully deleted 2 order(s)');
      expect(response.body.results.deleted).toBe(2);
      expect(response.body.results.errors).toHaveLength(0);
      
      // Check quantities were reversed
      const updatedComp1Response = await request(app).get(`/api/components/${testComponentIds[0]}`);
      const updatedComp2Response = await request(app).get(`/api/components/${testComponentIds[1]}`);
      expect(updatedComp1Response.body.quantity).toBe(100);
      expect(updatedComp2Response.body.quantity).toBe(100);
      
      // Check orders were deleted
      const remainingOrdersResponse = await request(app).get('/api/orders');
      const remainingTestOrders = remainingOrdersResponse.body.filter((order: any) => order.orderNumber?.includes('TEST-ORD'));
      expect(remainingTestOrders).toHaveLength(1);
      expect(remainingTestOrders[0].id).toBe(testOrderIds[2]);
    });
    
    test('should handle partial failures in bulk delete', async () => {
      const response = await request(app)
        .post('/api/orders/bulk-delete')
        .send({
          orderIds: [testOrderIds[0], 'nonexistent-order', testOrderIds[1]]
        })
        .expect(200);
      
      expect(response.body).toHaveProperty('success', true);
      expect(response.body.results.deleted).toBe(2);
      expect(response.body.results.errors).toHaveLength(1);
      expect(response.body.results.errors[0]).toContain('nonexistent-order not found');
    });
    
    test('should validate bulk delete request', async () => {
      // Test missing orderIds
      await request(app)
        .post('/api/orders/bulk-delete')
        .send({})
        .expect(400);
      
      // Test empty orderIds array
      await request(app)
        .post('/api/orders/bulk-delete')
        .send({ orderIds: [] })
        .expect(400);
      
      // Test too many orderIds (over limit of 100)
      const tooManyIds = Array.from({ length: 101 }, (_, i) => `order-${i}`);
      await request(app)
        .post('/api/orders/bulk-delete')
        .send({ orderIds: tooManyIds })
        .expect(400);
    });
    
    test('should handle bulk delete with no valid orders', async () => {
      const response = await request(app)
        .post('/api/orders/bulk-delete')
        .send({
          orderIds: ['nonexistent1', 'nonexistent2']
        })
        .expect(400);
      
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('message', 'No orders were deleted');
      expect(response.body.results.deleted).toBe(0);
      expect(response.body.results.errors).toHaveLength(2);
    });
    
    test('should maintain database integrity during bulk delete', async () => {
      // Delete all test orders
      const response = await request(app)
        .post('/api/orders/bulk-delete')
        .send({
          orderIds: testOrderIds
        })
        .expect(200);
      
      expect(response.body.results.deleted).toBe(3);
      
      // Verify all test orders were deleted
      const remainingOrdersResponse = await request(app).get('/api/orders');
      const remainingTestOrders = remainingOrdersResponse.body.filter((order: any) => order.orderNumber?.includes('TEST-ORD'));
      expect(remainingTestOrders).toHaveLength(0);
      
      // Verify component quantities were properly reversed
      for (let i = 0; i < testComponentIds.length; i++) {
        const componentResponse = await request(app).get(`/api/components/${testComponentIds[i]}`);
        expect(componentResponse.body.quantity).toBe(100); // Back to original quantity
      }
    });
    
    test('should handle bulk delete with order numbers in error messages', async () => {
      const response = await request(app)
        .post('/api/orders/bulk-delete')
        .send({
          orderIds: [testOrderIds[0], 'nonexistent-order']
        })
        .expect(200);
      
      expect(response.body.results.deleted).toBe(1);
      expect(response.body.results.errors).toHaveLength(1);
      expect(response.body.results.errors[0]).toContain('nonexistent-order not found');
    });
  });
  
  describe('Order Search and Filter', () => {
    test('should search orders by term', async () => {
      const response = await request(app)
        .get('/api/orders?term=TEST-ORD-1')
        .expect(200);
      
      const testOrders = response.body.filter((order: any) => order.orderNumber?.includes('TEST-ORD-1'));
      expect(testOrders).toHaveLength(1);
      expect(testOrders[0]).toHaveProperty('orderNumber', 'TEST-ORD-1');
    });
    
    test('should filter orders by supplier', async () => {
      const response = await request(app)
        .get('/api/orders?supplier=Test Supplier 2')
        .expect(200);
      
      const testOrders = response.body.filter((order: any) => order.supplier === 'Test Supplier 2');
      expect(testOrders).toHaveLength(1);
      expect(testOrders[0]).toHaveProperty('supplier', 'Test Supplier 2');
    });
    
    test('should sort orders by date', async () => {
      const response = await request(app)
        .get('/api/orders?sortBy=orderDate&sortOrder=asc')
        .expect(200);
      
      const testOrders = response.body.filter((order: any) => order.orderNumber?.includes('TEST-ORD'));
      expect(testOrders).toHaveLength(3);
      // All orders have same date, so order should be consistent
    });
  });
});