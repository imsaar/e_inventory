import { describe, it, expect, beforeEach } from '@jest/globals';
const request = require('supertest');
import app from '../server/index';

describe('QR Code Size Functionality', () => {
  let testLocationId: string;

  beforeEach(async () => {
    // Clean up existing test locations
    const locations = await request(app).get('/api/locations');
    for (const location of locations.body) {
      if (location.name.includes('QR Size Test')) {
        await request(app).delete(`/api/locations/${location.id}`);
      }
    }
  });

  describe('Location Creation with QR Size', () => {
    it('should create location with default QR size (medium)', async () => {
      const locationData = {
        name: 'QR Size Test Location Default',
        type: 'cabinet',
        description: 'Testing default QR size',
        generateQR: true
      };

      const response = await request(app)
        .post('/api/locations')
        .send(locationData)
        .expect(201);

      testLocationId = response.body.id;
      expect(response.body.qrSize).toBe('medium');
      expect(response.body.qrCode).toMatch(/LOC-[A-Z0-9]{8}/);
    });

    it('should create location with small QR size', async () => {
      const locationData = {
        name: 'QR Size Test Location Small',
        type: 'drawer',
        description: 'Testing small QR size for containers',
        qrSize: 'small',
        generateQR: true
      };

      const response = await request(app)
        .post('/api/locations')
        .send(locationData)
        .expect(201);

      expect(response.body.qrSize).toBe('small');
      expect(response.body.name).toBe('QR Size Test Location Small');
    });

    it('should create location with large QR size', async () => {
      const locationData = {
        name: 'QR Size Test Location Large',
        type: 'room',
        description: 'Testing large QR size for main areas',
        qrSize: 'large',
        generateQR: true
      };

      const response = await request(app)
        .post('/api/locations')
        .send(locationData)
        .expect(201);

      expect(response.body.qrSize).toBe('large');
      expect(response.body.name).toBe('QR Size Test Location Large');
    });

    it('should create location without QR code but with size setting', async () => {
      const locationData = {
        name: 'QR Size Test Location No QR',
        type: 'shelf',
        description: 'Testing QR size without generating QR code',
        qrSize: 'large',
        generateQR: false
      };

      const response = await request(app)
        .post('/api/locations')
        .send(locationData)
        .expect(201);

      expect(response.body.qrSize).toBe('large');
      expect(response.body.qrCode).toBeNull();
      expect(response.body.name).toBe('QR Size Test Location No QR');
    });
  });

  describe('QR Size Validation', () => {
    it('should reject invalid QR size values', async () => {
      const locationData = {
        name: 'QR Size Test Invalid',
        type: 'cabinet',
        qrSize: 'extra-large', // Invalid size
        generateQR: true
      };

      const response = await request(app)
        .post('/api/locations')
        .send(locationData)
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
    });

    it('should accept empty/undefined qrSize and default to medium', async () => {
      const locationData = {
        name: 'QR Size Test Undefined',
        type: 'cabinet',
        generateQR: true
      };

      const response = await request(app)
        .post('/api/locations')
        .send(locationData)
        .expect(201);

      expect(response.body.qrSize).toBe('medium');
    });
  });

  describe('QR Size Updates', () => {
    beforeEach(async () => {
      // Create a test location first
      const locationData = {
        name: 'QR Size Test Location for Updates',
        type: 'cabinet',
        qrSize: 'medium',
        generateQR: true
      };

      const response = await request(app)
        .post('/api/locations')
        .send(locationData)
        .expect(201);

      testLocationId = response.body.id;
    });

    it('should update QR size from medium to small', async () => {
      const updateData = {
        qrSize: 'small'
      };

      const response = await request(app)
        .put(`/api/locations/${testLocationId}`)
        .send(updateData)
        .expect(200);

      expect(response.body.qrSize).toBe('small');

      // Verify the change persisted
      const getResponse = await request(app)
        .get(`/api/locations/${testLocationId}`)
        .expect(200);

      expect(getResponse.body.qrSize).toBe('small');
    });

    it('should update QR size from medium to large', async () => {
      const updateData = {
        qrSize: 'large'
      };

      const response = await request(app)
        .put(`/api/locations/${testLocationId}`)
        .send(updateData)
        .expect(200);

      expect(response.body.qrSize).toBe('large');
    });

    it('should update other fields without changing QR size', async () => {
      const updateData = {
        description: 'Updated description without QR size change'
      };

      const response = await request(app)
        .put(`/api/locations/${testLocationId}`)
        .send(updateData)
        .expect(200);

      expect(response.body.qrSize).toBe('medium'); // Should remain unchanged
      expect(response.body.description).toBe('Updated description without QR size change');
    });
  });

  describe('QR Size Retrieval', () => {
    let smallLocationId: string;
    let mediumLocationId: string;
    let largeLocationId: string;

    beforeEach(async () => {
      // Create locations with different QR sizes
      const locations = [
        { name: 'Small QR Location', qrSize: 'small', type: 'drawer' },
        { name: 'Medium QR Location', qrSize: 'medium', type: 'cabinet' },
        { name: 'Large QR Location', qrSize: 'large', type: 'room' }
      ];

      const responses = await Promise.all(
        locations.map(loc => 
          request(app)
            .post('/api/locations')
            .send({ ...loc, generateQR: true })
            .expect(201)
        )
      );

      smallLocationId = responses[0].body.id;
      mediumLocationId = responses[1].body.id;
      largeLocationId = responses[2].body.id;
    });

    it('should retrieve all locations with their QR sizes', async () => {
      const response = await request(app)
        .get('/api/locations')
        .expect(200);

      const smallLoc = findLocationById(response.body, smallLocationId);
      const mediumLoc = findLocationById(response.body, mediumLocationId);
      const largeLoc = findLocationById(response.body, largeLocationId);

      expect(smallLoc.qrSize).toBe('small');
      expect(mediumLoc.qrSize).toBe('medium');
      expect(largeLoc.qrSize).toBe('large');
    });

    it('should retrieve individual location with QR size', async () => {
      const response = await request(app)
        .get(`/api/locations/${smallLocationId}`)
        .expect(200);

      expect(response.body.qrSize).toBe('small');
      expect(response.body.name).toBe('Small QR Location');
    });
  });

  describe('Mixed QR Sizes Use Case', () => {
    it('should support different QR sizes for hierarchical locations', async () => {
      // Create a room with large QR code
      const roomResponse = await request(app)
        .post('/api/locations')
        .send({
          name: 'Main Storage Room',
          type: 'room',
          qrSize: 'large',
          generateQR: true
        })
        .expect(201);

      const roomId = roomResponse.body.id;

      // Create a cabinet inside the room with medium QR code
      const cabinetResponse = await request(app)
        .post('/api/locations')
        .send({
          name: 'Electronics Cabinet',
          type: 'cabinet',
          parentId: roomId,
          qrSize: 'medium',
          generateQR: true
        })
        .expect(201);

      const cabinetId = cabinetResponse.body.id;

      // Create drawers inside the cabinet with small QR codes
      const drawer1Response = await request(app)
        .post('/api/locations')
        .send({
          name: 'Drawer 1 - ICs',
          type: 'drawer',
          parentId: cabinetId,
          qrSize: 'small',
          generateQR: true
        })
        .expect(201);

      const drawer2Response = await request(app)
        .post('/api/locations')
        .send({
          name: 'Drawer 2 - Passives',
          type: 'drawer',
          parentId: cabinetId,
          qrSize: 'small',
          generateQR: true
        })
        .expect(201);

      // Verify the hierarchy has appropriate QR sizes
      expect(roomResponse.body.qrSize).toBe('large');
      expect(cabinetResponse.body.qrSize).toBe('medium');
      expect(drawer1Response.body.qrSize).toBe('small');
      expect(drawer2Response.body.qrSize).toBe('small');

      // All should have QR codes
      expect(roomResponse.body.qrCode).toMatch(/LOC-[A-Z0-9]{8}/);
      expect(cabinetResponse.body.qrCode).toMatch(/LOC-[A-Z0-9]{8}/);
      expect(drawer1Response.body.qrCode).toMatch(/LOC-[A-Z0-9]{8}/);
      expect(drawer2Response.body.qrCode).toMatch(/LOC-[A-Z0-9]{8}/);
    });
  });

  describe('Database Migration Support', () => {
    it('should handle existing locations without qr_size field gracefully', async () => {
      // This test ensures the migration worked and existing data is handled
      const response = await request(app)
        .get('/api/locations')
        .expect(200);

      // All locations should have a qrSize field, defaulting to 'medium'
      response.body.forEach((location: any) => {
        expect(location.qrSize).toBeDefined();
        expect(['small', 'medium', 'large']).toContain(location.qrSize);
      });
    });
  });
});

// Helper function to find location by ID in nested structure
function findLocationById(locations: any[], id: string): any {
  for (const location of locations) {
    if (location.id === id) {
      return location;
    }
    if (location.children && location.children.length > 0) {
      const found = findLocationById(location.children, id);
      if (found) return found;
    }
  }
  return null;
}