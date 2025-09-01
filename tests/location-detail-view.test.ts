import { describe, it, expect, beforeEach } from '@jest/globals';
const request = require('supertest');
import app from '../server/index';

describe('Location Detail View', () => {
  let testLocationId: string;
  let testComponentId: string;
  let childLocationId: string;

  beforeEach(async () => {
    // Clean up existing test data
    const locations = await request(app).get('/api/locations');
    for (const location of locations.body) {
      if (location.name.includes('Detail Test')) {
        await request(app).delete(`/api/locations/${location.id}`);
      }
    }

    const components = await request(app).get('/api/components');
    for (const component of components.body) {
      if (component.name.includes('Detail Test')) {
        await request(app).delete(`/api/components/${component.id}`);
      }
    }
  });

  describe('Location Detail Retrieval', () => {
    beforeEach(async () => {
      // Create a parent location with QR code
      const parentResponse = await request(app)
        .post('/api/locations')
        .send({
          name: 'Detail Test Parent Room',
          type: 'room',
          description: 'Parent room for testing location details',
          qrSize: 'large',
          generateQR: true,
          tags: ['test', 'parent']
        })
        .expect(201);

      testLocationId = parentResponse.body.id;

      // Create a child location
      const childResponse = await request(app)
        .post('/api/locations')
        .send({
          name: 'Detail Test Child Cabinet',
          type: 'cabinet',
          parentId: testLocationId,
          description: 'Child cabinet for testing hierarchy',
          qrSize: 'medium',
          generateQR: true,
          tags: ['test', 'child']
        })
        .expect(201);

      childLocationId = childResponse.body.id;

      // Create a component in the child location
      const componentResponse = await request(app)
        .post('/api/components')
        .send({
          name: 'Detail Test Component',
          category: 'Resistors',
          subcategory: 'Carbon Film',
          description: 'Test resistor for location detail testing',
          quantity: 100,
          minThreshold: 10,
          status: 'available',
          locationId: childLocationId,
          tags: ['test', 'resistor']
        })
        .expect(201);

      testComponentId = componentResponse.body.id;
    });

    it('should retrieve location details with full path', async () => {
      const response = await request(app)
        .get(`/api/locations/${childLocationId}`)
        .expect(200);

      expect(response.body).toMatchObject({
        id: childLocationId,
        name: 'Detail Test Child Cabinet',
        type: 'cabinet',
        parentId: testLocationId,
        description: 'Child cabinet for testing hierarchy',
        qrSize: 'medium',
        tags: ['test', 'child']
      });

      expect(response.body.qrCode).toMatch(/LOC-[A-Z0-9]{8}/);
      expect(response.body.fullPath).toBeDefined();
      expect(Array.isArray(response.body.fullPath)).toBe(true);
      expect(response.body.fullPath).toHaveLength(2);
      expect(response.body.fullPath[0].name).toBe('Detail Test Parent Room');
      expect(response.body.fullPath[1].name).toBe('Detail Test Child Cabinet');
    });

    it('should retrieve parent location without full path', async () => {
      const response = await request(app)
        .get(`/api/locations/${testLocationId}`)
        .expect(200);

      expect(response.body).toMatchObject({
        id: testLocationId,
        name: 'Detail Test Parent Room',
        type: 'room',
        parentId: null,
        qrSize: 'large',
        tags: ['test', 'parent']
      });

      expect(response.body.fullPath).toBeDefined();
      expect(Array.isArray(response.body.fullPath)).toBe(true);
      expect(response.body.fullPath).toHaveLength(1);
      expect(response.body.fullPath[0].name).toBe('Detail Test Parent Room');
    });

    it('should return 404 for non-existent location', async () => {
      const fakeId = '12345678901234567890123456789012';
      const response = await request(app)
        .get(`/api/locations/${fakeId}`)
        .expect(404);

      expect(response.body.error).toBe('Location not found');
    });

    it('should return 404 for invalid location ID format', async () => {
      const response = await request(app)
        .get('/api/locations/invalid-id-format')
        .expect(404);

      expect(response.body.error).toBe('Location not found');
    });
  });

  describe('Location Components Retrieval', () => {
    beforeEach(async () => {
      // Create location and components for testing
      const locationResponse = await request(app)
        .post('/api/locations')
        .send({
          name: 'Detail Test Component Location',
          type: 'drawer',
          description: 'Location for testing component retrieval',
          generateQR: true
        })
        .expect(201);

      testLocationId = locationResponse.body.id;

      // Create multiple components
      const components = [
        { name: 'Detail Test Resistor', category: 'Resistors', quantity: 50, status: 'available' },
        { name: 'Detail Test Capacitor', category: 'Capacitors', quantity: 25, status: 'in_use' },
        { name: 'Detail Test LED', category: 'LEDs', quantity: 10, status: 'reserved' }
      ];

      for (const component of components) {
        await request(app)
          .post('/api/components')
          .send({
            ...component,
            locationId: testLocationId,
            tags: ['test']
          })
          .expect(201);
      }
    });

    it('should retrieve components in a specific location', async () => {
      const response = await request(app)
        .get(`/api/locations/${testLocationId}/components`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body).toHaveLength(3);

      const componentNames = response.body.map((c: any) => c.name);
      expect(componentNames).toContain('Detail Test Resistor');
      expect(componentNames).toContain('Detail Test Capacitor');
      expect(componentNames).toContain('Detail Test LED');

      // Verify component data structure
      response.body.forEach((component: any) => {
        expect(component).toHaveProperty('id');
        expect(component).toHaveProperty('name');
        expect(component).toHaveProperty('category');
        expect(component).toHaveProperty('quantity');
        expect(component).toHaveProperty('status');
        expect(component).toHaveProperty('tags');
        expect(Array.isArray(component.tags)).toBe(true);
        expect(component.location_id).toBe(testLocationId);
      });
    });

    it('should return empty array for location with no components', async () => {
      // Create a location without components
      const emptyLocationResponse = await request(app)
        .post('/api/locations')
        .send({
          name: 'Detail Test Empty Location',
          type: 'box',
          generateQR: false
        })
        .expect(201);

      const response = await request(app)
        .get(`/api/locations/${emptyLocationResponse.body.id}/components`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body).toHaveLength(0);
    });
  });

  describe('Location Detail View Integration', () => {
    it('should support typical detail view workflow', async () => {
      // 1. Create a hierarchical structure for testing
      const roomResponse = await request(app)
        .post('/api/locations')
        .send({
          name: 'Detail Test Electronics Room',
          type: 'room',
          description: 'Main electronics storage room',
          qrSize: 'large',
          generateQR: true,
          tags: ['electronics', 'main']
        })
        .expect(201);

      const cabinetResponse = await request(app)
        .post('/api/locations')
        .send({
          name: 'Detail Test Cabinet A1',
          type: 'cabinet',
          parentId: roomResponse.body.id,
          description: 'Cabinet for passive components',
          qrSize: 'medium',
          generateQR: true,
          tags: ['passives']
        })
        .expect(201);

      const drawerResponse = await request(app)
        .post('/api/locations')
        .send({
          name: 'Detail Test Drawer 1',
          type: 'drawer',
          parentId: cabinetResponse.body.id,
          description: 'Resistors drawer',
          qrSize: 'small',
          generateQR: true,
          tags: ['resistors']
        })
        .expect(201);

      // 2. Add some components to different levels
      await request(app)
        .post('/api/components')
        .send({
          name: 'Detail Test 1K Resistor',
          category: 'Resistors',
          subcategory: 'Carbon Film',
          quantity: 100,
          status: 'available',
          locationId: drawerResponse.body.id
        })
        .expect(201);

      await request(app)
        .post('/api/components')
        .send({
          name: 'Detail Test Multimeter',
          category: 'Test Equipment',
          quantity: 1,
          status: 'in_use',
          locationId: cabinetResponse.body.id
        })
        .expect(201);

      // 3. Test detailed view of the drawer (deepest level)
      const drawerDetailResponse = await request(app)
        .get(`/api/locations/${drawerResponse.body.id}`)
        .expect(200);

      expect(drawerDetailResponse.body.fullPath).toHaveLength(3);
      expect(drawerDetailResponse.body.fullPath[0].name).toBe('Detail Test Electronics Room');
      expect(drawerDetailResponse.body.fullPath[1].name).toBe('Detail Test Cabinet A1');
      expect(drawerDetailResponse.body.fullPath[2].name).toBe('Detail Test Drawer 1');

      // 4. Test components in the drawer
      const drawerComponentsResponse = await request(app)
        .get(`/api/locations/${drawerResponse.body.id}/components`)
        .expect(200);

      expect(drawerComponentsResponse.body).toHaveLength(1);
      expect(drawerComponentsResponse.body[0].name).toBe('Detail Test 1K Resistor');

      // 5. Test components in the cabinet (should include multimeter)
      const cabinetComponentsResponse = await request(app)
        .get(`/api/locations/${cabinetResponse.body.id}/components`)
        .expect(200);

      expect(cabinetComponentsResponse.body).toHaveLength(1);
      expect(cabinetComponentsResponse.body[0].name).toBe('Detail Test Multimeter');

      // 6. Test hierarchical structure retrieval
      const allLocationsResponse = await request(app)
        .get('/api/locations')
        .expect(200);

      // Find the room in the response
      const room = allLocationsResponse.body.find((loc: any) => loc.id === roomResponse.body.id);
      expect(room).toBeDefined();
      expect(room.children).toHaveLength(1);
      expect(room.children[0].id).toBe(cabinetResponse.body.id);
      expect(room.children[0].children).toHaveLength(1);
      expect(room.children[0].children[0].id).toBe(drawerResponse.body.id);
    });
  });

  describe('QR Code Size Display in Detail View', () => {
    it('should display QR size information correctly', async () => {
      const sizes = ['small', 'medium', 'large'] as const;
      const locationIds: string[] = [];

      // Create locations with different QR sizes
      for (const size of sizes) {
        const response = await request(app)
          .post('/api/locations')
          .send({
            name: `Detail Test ${size.charAt(0).toUpperCase() + size.slice(1)} QR Location`,
            type: 'cabinet',
            description: `Testing ${size} QR size display`,
            qrSize: size,
            generateQR: true
          })
          .expect(201);

        locationIds.push(response.body.id);
      }

      // Test each location's detail view
      for (let i = 0; i < sizes.length; i++) {
        const response = await request(app)
          .get(`/api/locations/${locationIds[i]}`)
          .expect(200);

        expect(response.body.qrSize).toBe(sizes[i]);
        expect(response.body.qrCode).toMatch(/LOC-[A-Z0-9]{8}/);
      }
    });
  });
});

// Helper function to clean up test data
export async function cleanupTestData() {
  try {
    const locations = await request(app).get('/api/locations');
    for (const location of locations.body) {
      if (location.name.includes('Detail Test')) {
        await request(app).delete(`/api/locations/${location.id}`);
      }
    }

    const components = await request(app).get('/api/components');
    for (const component of components.body) {
      if (component.name.includes('Detail Test')) {
        await request(app).delete(`/api/components/${component.id}`);
      }
    }
  } catch (error) {
    console.error('Cleanup error:', error);
  }
}