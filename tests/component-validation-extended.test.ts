import { describe, it, expect, beforeEach } from '@jest/globals';
const request = require('supertest');
import app from '../server/index';
import path from 'path';
import fs from 'fs';

describe('Component Validation with Extended Fields', () => {
  let testLocationId: string;
  let uploadedPhotoUrl: string;

  beforeEach(async () => {
    // Clean up existing test components
    const components = await request(app).get('/api/components');
    for (const component of components.body) {
      if (component.name.includes('Extended Test')) {
        await request(app).delete(`/api/components/${component.id}`);
      }
    }

    // Create test location
    const locationResponse = await request(app)
      .post('/api/locations')
      .send({ name: 'Extended Test Location', type: 'box' });
    testLocationId = locationResponse.body.id;

    // Upload a test photo for image URL tests
    const testImageBuffer = Buffer.from([
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
      0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1x1 pixel
      0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
      0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41,
      0x54, 0x08, 0x1D, 0x01, 0x01, 0x00, 0x00, 0xFF,
      0xFF, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01, 0x73,
      0x75, 0x01, 0x18, 0x00, 0x00, 0x00, 0x00, 0x49,
      0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
    ]);

    const uploadResponse = await request(app)
      .post('/api/uploads/photo')
      .attach('photo', testImageBuffer, 'test-extended-validation.png');

    if (uploadResponse.status === 200) {
      uploadedPhotoUrl = uploadResponse.body.photoUrl;
    }
  });

  afterEach(async () => {
    // Clean up uploaded photo
    if (uploadedPhotoUrl) {
      try {
        await request(app)
          .delete('/api/uploads/photo')
          .send({ photoUrl: uploadedPhotoUrl });
      } catch (error) {
        console.warn('Failed to clean up test photo:', error);
      }
    }
  });

  describe('Component Creation with New Fields', () => {
    it('should create component with all new validation fields', async () => {
      const componentData = {
        name: 'Extended Test ESP32 DevKit',
        category: 'Microcontrollers',
        subcategory: 'Development Boards',
        partNumber: 'ESP32-DEVKIT-V1',
        manufacturer: 'Espressif',
        description: 'ESP32 development board with WiFi and Bluetooth',
        quantity: 5,
        minThreshold: 2,
        unitCost: 12.50,
        locationId: testLocationId,
        tags: ['esp32', 'wifi', 'bluetooth', 'development'],
        
        // New fields added in schema version 8
        imageUrl: uploadedPhotoUrl,
        supplier: 'AliExpress Store',
        voltage: {
          min: 3.0,
          max: 3.6,
          nominal: 3.3,
          unit: 'V'
        },
        current: {
          value: 250,
          unit: 'mA'
        },
        pinCount: 30,
        protocols: ['I2C', 'SPI', 'UART', 'WiFi', 'Bluetooth'],
        dimensions: {
          length: 55.0,
          width: 28.0,
          height: 13.0,
          unit: 'mm'
        },
        weight: {
          value: 10.5,
          unit: 'g'
        },
        packageType: 'Development Board'
      };

      const response = await request(app)
        .post('/api/components')
        .send(componentData)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.name).toBe(componentData.name);
      expect(response.body.imageUrl).toBe(componentData.imageUrl);
      expect(response.body.supplier).toBe(componentData.supplier);
      expect(response.body.voltage).toEqual(componentData.voltage);
      expect(response.body.current).toEqual(componentData.current);
      expect(response.body.pinCount).toBe(componentData.pinCount);
      expect(response.body.protocols).toEqual(componentData.protocols);
      expect(response.body.packageType).toBe(componentData.packageType);
    });

    it('should validate voltage object structure', async () => {
      const componentData = {
        name: 'Extended Test Invalid Voltage',
        category: 'ICs',
        voltage: {
          min: 'invalid', // Should be number
          max: 5.0,
          nominal: 3.3,
          unit: 'V'
        }
      };

      const response = await request(app)
        .post('/api/components')
        .send(componentData)
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('voltage');
    });

    it('should validate current object structure', async () => {
      const componentData = {
        name: 'Extended Test Invalid Current',
        category: 'ICs',
        current: {
          value: -100, // Should be positive
          unit: 'mA'
        }
      };

      const response = await request(app)
        .post('/api/components')
        .send(componentData)
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('current');
    });

    it('should validate pin count as positive integer', async () => {
      const componentData = {
        name: 'Extended Test Invalid Pin Count',
        category: 'ICs',
        pinCount: -5 // Should be non-negative
      };

      const response = await request(app)
        .post('/api/components')
        .send(componentData)
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Pin count cannot be negative');
    });

    it('should validate protocols array length', async () => {
      const componentData = {
        name: 'Extended Test Too Many Protocols',
        category: 'ICs',
        protocols: Array(25).fill('Protocol') // Exceeds max of 20
      };

      const response = await request(app)
        .post('/api/components')
        .send(componentData)
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Too many protocols');
    });

    it('should validate supplier field length', async () => {
      const componentData = {
        name: 'Extended Test Long Supplier',
        category: 'ICs',
        supplier: 'A'.repeat(101) // Exceeds max of 100 characters
      };

      const response = await request(app)
        .post('/api/components')
        .send(componentData)
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Supplier name too long');
    });

    it('should validate image URL length', async () => {
      const componentData = {
        name: 'Extended Test Long Image URL',
        category: 'ICs',
        imageUrl: 'https://example.com/' + 'A'.repeat(500) // Exceeds max of 500 characters
      };

      const response = await request(app)
        .post('/api/components')
        .send(componentData)
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Image URL too long');
    });
  });

  describe('Component Update with New Fields', () => {
    let testComponentId: string;

    beforeEach(async () => {
      const componentData = {
        name: 'Extended Test Update Component',
        category: 'Sensors',
        quantity: 10
      };

      const response = await request(app)
        .post('/api/components')
        .send(componentData);
      
      testComponentId = response.body.id;
    });

    it('should update component with new fields', async () => {
      const updateData = {
        imageUrl: uploadedPhotoUrl,
        supplier: 'Updated Supplier',
        voltage: {
          min: 2.7,
          max: 5.5,
          nominal: 3.3,
          unit: 'V'
        },
        current: {
          value: 50,
          unit: 'mA'
        },
        pinCount: 8,
        protocols: ['I2C', 'OneWire'],
        packageType: 'TO-92'
      };

      const response = await request(app)
        .put(`/api/components/${testComponentId}`)
        .send(updateData)
        .expect(200);

      expect(response.body.imageUrl).toBe(updateData.imageUrl);
      expect(response.body.supplier).toBe(updateData.supplier);
      expect(response.body.voltage).toEqual(updateData.voltage);
      expect(response.body.current).toEqual(updateData.current);
      expect(response.body.pinCount).toBe(updateData.pinCount);
      expect(response.body.protocols).toEqual(updateData.protocols);
      expect(response.body.packageType).toBe(updateData.packageType);
    });

    it('should handle partial updates with new fields', async () => {
      const updateData = {
        supplier: 'Partial Update Supplier',
        pinCount: 16
      };

      const response = await request(app)
        .put(`/api/components/${testComponentId}`)
        .send(updateData)
        .expect(200);

      expect(response.body.supplier).toBe(updateData.supplier);
      expect(response.body.pinCount).toBe(updateData.pinCount);
      expect(response.body.name).toBe('Extended Test Update Component'); // Should preserve existing data
    });
  });

  describe('Status Field Validation', () => {
    it('should accept on_order status', async () => {
      const componentData = {
        name: 'Extended Test On Order Component',
        category: 'Passive Components',
        status: 'on_order',
        quantity: 0
      };

      const response = await request(app)
        .post('/api/components')
        .send(componentData)
        .expect(201);

      expect(response.body.status).toBe('on_order');
    });

    it('should reject invalid status values', async () => {
      const componentData = {
        name: 'Extended Test Invalid Status',
        category: 'Passive Components',
        status: 'invalid_status'
      };

      const response = await request(app)
        .post('/api/components')
        .send(componentData)
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('status');
    });
  });

  describe('Backward Compatibility', () => {
    it('should create component without new fields (backward compatibility)', async () => {
      const legacyComponentData = {
        name: 'Extended Test Legacy Component',
        category: 'Passive Components',
        quantity: 100,
        unitCost: 0.10
      };

      const response = await request(app)
        .post('/api/components')
        .send(legacyComponentData)
        .expect(201);

      expect(response.body.name).toBe(legacyComponentData.name);
      expect(response.body.category).toBe(legacyComponentData.category);
      // New fields should be null/undefined or have default values
      expect(response.body.voltage).toBeNull();
      expect(response.body.current).toBeNull();
      expect(response.body.supplier).toBeNull();
    });
  });
});