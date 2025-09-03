import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
const request = require('supertest');
import app from '../server/index';
import fs from 'fs';
import path from 'path';

describe('AliExpress Import with Extended Component Fields', () => {
  let testUploadPath: string;

  beforeEach(async () => {
    // Clean up existing test components and orders
    const components = await request(app).get('/api/components');
    for (const component of components.body) {
      if (component.name.includes('AliExpress Extended Test')) {
        await request(app).delete(`/api/components/${component.id}`);
      }
    }

    const orders = await request(app).get('/api/orders');
    for (const order of orders.body) {
      if (order.supplier === 'AliExpress Extended Test Supplier') {
        await request(app).delete(`/api/orders/${order.id}`);
      }
    }

    // Ensure uploads directory exists
    const uploadsDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
  });

  afterEach(() => {
    // Clean up test upload file
    if (testUploadPath && fs.existsSync(testUploadPath)) {
      try {
        fs.unlinkSync(testUploadPath);
      } catch (error) {
        console.warn('Failed to clean up test upload:', error);
      }
    }
  });

  describe('Import Processing with New Component Fields', () => {
    it('should create components with new fields from import data', async () => {
      const mockHtmlContent = `
        <!DOCTYPE html>
        <html>
        <head><title>AliExpress Order</title></head>
        <body>
          <div class="order-item">
            <div class="order-item-content-img">
              <img src="https://ae01.alicdn.com/kf/S123456789abcdef.jpg" alt="ESP32 DevKit">
            </div>
            <div class="order-item-title">
              <a href="/item/123456789.html">ESP32 WROOM-32 Development Board WiFi Bluetooth Dual Core</a>
            </div>
            <div class="order-item-price">$12.50</div>
            <div class="order-item-quantity">Qty: 2</div>
            <div class="order-item-attributes">
              <span>Voltage: 3.3V</span>
              <span>Pins: 30</span>
              <span>Protocol: WiFi, Bluetooth, I2C, SPI</span>
            </div>
          </div>
          <div class="order-total">Total: $25.00</div>
          <div class="order-info">
            <div>Order Number: 123456789012345</div>
            <div>Order Date: 2024-01-15</div>
          </div>
        </body>
        </html>
      `;

      // Create test HTML file
      testUploadPath = path.join(__dirname, '../uploads/test-aliexpress-extended.html');
      fs.writeFileSync(testUploadPath, mockHtmlContent);

      // Preview the import
      const previewResponse = await request(app)
        .post('/api/import/aliexpress/preview')
        .attach('file', testUploadPath)
        .expect(200);

      expect(previewResponse.body.success).toBe(true);
      expect(previewResponse.body.data.components).toHaveLength(1);

      const component = previewResponse.body.data.components[0];
      expect(component.name).toContain('ESP32');
      expect(component.category).toBe('Microcontrollers');
      expect(component.unitCost).toBe(12.50);

      // Import the data
      const importData = {
        orderData: previewResponse.body.data.orderData,
        components: previewResponse.body.data.components
      };

      const importResponse = await request(app)
        .post('/api/import/aliexpress/import')
        .send(importData)
        .expect(200);

      expect(importResponse.body.success).toBe(true);
      expect(importResponse.body.componentsCreated).toBe(1);

      // Verify the component was created with proper fields
      const components = await request(app).get('/api/components');
      const createdComponent = components.body.find((c: any) => c.name.includes('ESP32'));
      
      expect(createdComponent).toBeDefined();
      expect(createdComponent.category).toBe('Microcontrollers');
      expect(createdComponent.unitCost).toBe(12.50);
      expect(createdComponent.imageUrl).toMatch(/^imported-images\//);
    });

    it('should handle component classification with new technical fields', async () => {
      const mockHtmlContent = `
        <!DOCTYPE html>
        <html>
        <body>
          <div class="order-item">
            <div class="order-item-content-img">
              <img src="https://ae01.alicdn.com/kf/sensor123.jpg" alt="Temperature Sensor">
            </div>
            <div class="order-item-title">
              <a href="/item/987654321.html">DS18B20 Digital Temperature Sensor Waterproof Probe</a>
            </div>
            <div class="order-item-price">$3.25</div>
            <div class="order-item-quantity">Qty: 5</div>
            <div class="order-item-attributes">
              <span>Voltage Range: 3.0V-5.5V</span>
              <span>Protocol: OneWire</span>
              <span>Accuracy: ±0.5°C</span>
            </div>
          </div>
        </body>
        </html>
      `;

      testUploadPath = path.join(__dirname, '../uploads/test-sensor-import.html');
      fs.writeFileSync(testUploadPath, mockHtmlContent);

      const previewResponse = await request(app)
        .post('/api/import/aliexpress/preview')
        .attach('file', testUploadPath)
        .expect(200);

      const component = previewResponse.body.data.components[0];
      expect(component.name).toContain('DS18B20');
      expect(component.category).toBe('Sensors');
      expect(component.subcategory).toBe('Temperature');

      // Import and verify
      const importData = {
        orderData: previewResponse.body.data.orderData,
        components: previewResponse.body.data.components
      };

      await request(app)
        .post('/api/import/aliexpress/import')
        .send(importData)
        .expect(200);

      const components = await request(app).get('/api/components');
      const createdComponent = components.body.find((c: any) => c.name.includes('DS18B20'));
      
      expect(createdComponent.category).toBe('Sensors');
      expect(createdComponent.subcategory).toBe('Temperature');
    });

    it('should validate imported component data against new schema', async () => {
      const mockHtmlContent = `
        <!DOCTYPE html>
        <html>
        <body>
          <div class="order-item">
            <div class="order-item-title">
              <a href="/item/123.html">Test Component</a>
            </div>
            <div class="order-item-price">$1.00</div>
            <div class="order-item-quantity">Qty: 1</div>
          </div>
        </body>
        </html>
      `;

      testUploadPath = path.join(__dirname, '../uploads/test-validation-import.html');
      fs.writeFileSync(testUploadPath, mockHtmlContent);

      const previewResponse = await request(app)
        .post('/api/import/aliexpress/preview')
        .attach('file', testUploadPath)
        .expect(200);

      // Modify component data to test validation
      const component = previewResponse.body.data.components[0];
      component.pinCount = -1; // Invalid: should be non-negative
      component.protocols = Array(25).fill('Protocol'); // Invalid: too many protocols

      const importData = {
        orderData: previewResponse.body.data.orderData,
        components: [component]
      };

      const importResponse = await request(app)
        .post('/api/import/aliexpress/import')
        .send(importData)
        .expect(400);

      expect(importResponse.body.error).toBeDefined();
      expect(importResponse.body.error).toMatch(/(Pin count cannot be negative|Too many protocols)/);
    });

    it('should handle import with supplier information', async () => {
      const mockHtmlContent = `
        <!DOCTYPE html>
        <html>
        <body>
          <div class="shop-info">
            <span class="shop-name">Extended Test Electronics Store</span>
          </div>
          <div class="order-item">
            <div class="order-item-title">
              <a href="/item/555.html">Test Resistor Pack 1K-10K Ohm</a>
            </div>
            <div class="order-item-price">$5.99</div>
            <div class="order-item-quantity">Qty: 1</div>
          </div>
        </body>
        </html>
      `;

      testUploadPath = path.join(__dirname, '../uploads/test-supplier-import.html');
      fs.writeFileSync(testUploadPath, mockHtmlContent);

      const previewResponse = await request(app)
        .post('/api/import/aliexpress/preview')
        .attach('file', testUploadPath)
        .expect(200);

      const importData = {
        orderData: previewResponse.body.data.orderData,
        components: previewResponse.body.data.components
      };

      const importResponse = await request(app)
        .post('/api/import/aliexpress/import')
        .send(importData)
        .expect(200);

      expect(importResponse.body.success).toBe(true);

      // Verify supplier information
      const orders = await request(app).get('/api/orders');
      const createdOrder = orders.body.find((o: any) => o.supplier === 'AliExpress');
      expect(createdOrder).toBeDefined();

      const components = await request(app).get('/api/components');
      const createdComponent = components.body.find((c: any) => c.name.includes('Resistor'));
      expect(createdComponent).toBeDefined();
      expect(createdComponent.category).toBe('Passive Components');
    });
  });

  describe('Import Error Handling with New Fields', () => {
    it('should handle components with invalid voltage data gracefully', async () => {
      const mockHtmlContent = `
        <!DOCTYPE html>
        <html>
        <body>
          <div class="order-item">
            <div class="order-item-title">
              <a href="/item/invalid.html">Invalid Voltage Component</a>
            </div>
            <div class="order-item-price">$1.00</div>
            <div class="order-item-quantity">Qty: 1</div>
          </div>
        </body>
        </html>
      `;

      testUploadPath = path.join(__dirname, '../uploads/test-invalid-voltage.html');
      fs.writeFileSync(testUploadPath, mockHtmlContent);

      const previewResponse = await request(app)
        .post('/api/import/aliexpress/preview')
        .attach('file', testUploadPath)
        .expect(200);

      // Modify component to have invalid voltage structure
      const component = previewResponse.body.data.components[0];
      component.voltage = { min: 'invalid', max: 5.0 }; // Invalid: min should be number

      const importData = {
        orderData: previewResponse.body.data.orderData,
        components: [component]
      };

      const importResponse = await request(app)
        .post('/api/import/aliexpress/import')
        .send(importData)
        .expect(400);

      expect(importResponse.body.error).toBeDefined();
    });

    it('should handle missing required fields during import', async () => {
      const importData = {
        orderData: {
          orderNumber: '123456789012345',
          orderDate: '2024-01-15',
          totalAmount: 25.00
        },
        components: [
          {
            // Missing required 'name' field
            category: 'ICs',
            unitCost: 10.00,
            quantity: 1
          }
        ]
      };

      const importResponse = await request(app)
        .post('/api/import/aliexpress/import')
        .send(importData)
        .expect(400);

      expect(importResponse.body.error).toBeDefined();
      expect(importResponse.body.error).toContain('Name is required');
    });

    it('should validate image URL length during import', async () => {
      const mockHtmlContent = `
        <!DOCTYPE html>
        <html>
        <body>
          <div class="order-item">
            <div class="order-item-title">
              <a href="/item/longurl.html">Component with Long Image URL</a>
            </div>
            <div class="order-item-price">$1.00</div>
            <div class="order-item-quantity">Qty: 1</div>
          </div>
        </body>
        </html>
      `;

      testUploadPath = path.join(__dirname, '../uploads/test-long-url.html');
      fs.writeFileSync(testUploadPath, mockHtmlContent);

      const previewResponse = await request(app)
        .post('/api/import/aliexpress/preview')
        .attach('file', testUploadPath)
        .expect(200);

      // Set very long image URL
      const component = previewResponse.body.data.components[0];
      component.imageUrl = 'imported-images/' + 'a'.repeat(500) + '.jpg'; // Exceeds limit

      const importData = {
        orderData: previewResponse.body.data.orderData,
        components: [component]
      };

      const importResponse = await request(app)
        .post('/api/import/aliexpress/import')
        .send(importData)
        .expect(400);

      expect(importResponse.body.error).toContain('Image URL too long');
    });
  });

  describe('Import with Status Field Validation', () => {
    it('should set appropriate status for imported components', async () => {
      const mockHtmlContent = `
        <!DOCTYPE html>
        <html>
        <body>
          <div class="order-item">
            <div class="order-item-title">
              <a href="/item/status.html">On Order Component</a>
            </div>
            <div class="order-item-price">$2.50</div>
            <div class="order-item-quantity">Qty: 3</div>
          </div>
        </body>
        </html>
      `;

      testUploadPath = path.join(__dirname, '../uploads/test-status-import.html');
      fs.writeFileSync(testUploadPath, mockHtmlContent);

      const previewResponse = await request(app)
        .post('/api/import/aliexpress/preview')
        .attach('file', testUploadPath)
        .expect(200);

      // Set component status to on_order (new status option)
      const component = previewResponse.body.data.components[0];
      component.status = 'on_order';

      const importData = {
        orderData: previewResponse.body.data.orderData,
        components: [component]
      };

      const importResponse = await request(app)
        .post('/api/import/aliexpress/import')
        .send(importData)
        .expect(200);

      expect(importResponse.body.success).toBe(true);

      const components = await request(app).get('/api/components');
      const createdComponent = components.body.find((c: any) => c.name.includes('On Order Component'));
      expect(createdComponent.status).toBe('on_order');
    });

    it('should reject invalid status values during import', async () => {
      const importData = {
        orderData: {
          orderNumber: '123456789012345',
          orderDate: '2024-01-15',
          totalAmount: 5.00
        },
        components: [
          {
            name: 'Invalid Status Component',
            category: 'ICs',
            status: 'invalid_status_value', // Invalid status
            unitCost: 5.00,
            quantity: 1
          }
        ]
      };

      const importResponse = await request(app)
        .post('/api/import/aliexpress/import')
        .send(importData)
        .expect(400);

      expect(importResponse.body.error).toBeDefined();
      expect(importResponse.body.error).toContain('status');
    });
  });

  describe('Backward Compatibility', () => {
    it('should import components without new fields successfully', async () => {
      const legacyImportData = {
        orderData: {
          orderNumber: '123456789012345',
          orderDate: '2024-01-15',
          totalAmount: 15.75,
          supplier: 'AliExpress'
        },
        components: [
          {
            name: 'Legacy Import Component',
            category: 'Passive Components',
            unitCost: 15.75,
            quantity: 1,
            // No new fields - testing backward compatibility
          }
        ]
      };

      const importResponse = await request(app)
        .post('/api/import/aliexpress/import')
        .send(legacyImportData)
        .expect(200);

      expect(importResponse.body.success).toBe(true);
      expect(importResponse.body.componentsCreated).toBe(1);

      const components = await request(app).get('/api/components');
      const createdComponent = components.body.find((c: any) => c.name === 'Legacy Import Component');
      
      expect(createdComponent).toBeDefined();
      expect(createdComponent.category).toBe('Passive Components');
      // New fields should be null or have defaults
      expect(createdComponent.voltage).toBeNull();
      expect(createdComponent.current).toBeNull();
      expect(createdComponent.pinCount).toBeNull();
      expect(createdComponent.protocols).toBeNull();
      expect(createdComponent.supplier).toBeNull();
    });
  });
});