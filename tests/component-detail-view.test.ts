import { describe, it, expect, beforeEach } from '@jest/globals';
const request = require('supertest');
import app from '../server/index';

describe('Component Detail View Functionality', () => {
  let testLocationId: string;
  let testComponentId: string;

  beforeEach(async () => {
    // Create test location
    const locationResponse = await request(app)
      .post('/api/locations')
      .send({
        name: 'Detail View Test Location',
        type: 'cabinet',
        description: 'Location for detail view tests'
      })
      .expect(201);
    
    testLocationId = locationResponse.body.id;

    // Create test component with comprehensive data
    const componentResponse = await request(app)
      .post('/api/components')
      .send({
        name: 'Detail View Test Component',
        partNumber: 'DVT-001',
        manufacturer: 'Test Corp',
        category: 'microcontroller',
        subcategory: 'development_board',
        description: 'A comprehensive test component for detail view validation with URL: https://example.com/datasheet',
        tags: ['test', 'detail-view', 'microcontroller'],
        quantity: 15,
        minThreshold: 5,
        unitCost: 12.50,
        totalCost: 187.50,
        supplier: 'Test Supplier Inc',
        purchaseDate: '2024-01-15',
        locationId: testLocationId,
        status: 'available',
        datasheetUrl: 'https://example.com/datasheet.pdf',
        notes: 'Test notes with URL: https://github.com/example/repo',
        voltage: { min: 3.3, max: 5.0, nominal: 5.0, unit: 'V' },
        current: { value: 100, unit: 'mA' },
        pinCount: 40,
        protocols: ['I2C', 'SPI', 'UART'],
        packageType: 'DIP-40'
      })
      .expect(201);
    
    testComponentId = componentResponse.body.id;
  });

  describe('Component Detail API Endpoints', () => {
    it('should retrieve component with all field mappings', async () => {
      const response = await request(app)
        .get(`/api/components/${testComponentId}`)
        .expect(200);

      const component = response.body;

      // Verify all fields are properly mapped
      expect(component.id).toBe(testComponentId);
      expect(component.name).toBe('Detail View Test Component');
      expect(component.partNumber).toBe('DVT-001'); // camelCase mapping
      expect(component.manufacturer).toBe('Test Corp');
      expect(component.category).toBe('microcontroller');
      expect(component.subcategory).toBe('development_board');
      expect(component.description).toContain('https://example.com/datasheet');
      
      // Verify tags array
      expect(Array.isArray(component.tags)).toBe(true);
      expect(component.tags).toContain('test');
      expect(component.tags).toContain('detail-view');
      expect(component.tags).toContain('microcontroller');
      
      // Verify cost fields
      expect(component.unitCost).toBe(12.50);
      expect(component.totalCost).toBe(187.50);
      expect(component.quantity).toBe(15);
      expect(component.minThreshold).toBe(5);
      
      // Verify location mapping
      expect(component.locationId).toBe(testLocationId);
      
      // Verify other fields
      expect(component.supplier).toBe('Test Supplier Inc');
      expect(component.purchaseDate).toBe('2024-01-15');
      expect(component.status).toBe('available');
      expect(component.datasheetUrl).toBe('https://example.com/datasheet.pdf');
      expect(component.notes).toContain('https://github.com/example/repo');
      
      // Verify JSON fields are parsed
      expect(component.voltage).toEqual({ min: 3.3, max: 5.0, nominal: 5.0, unit: 'V' });
      expect(component.current).toEqual({ value: 100, unit: 'mA' });
      expect(component.pinCount).toBe(40);
      expect(Array.isArray(component.protocols)).toBe(true);
      expect(component.protocols).toContain('I2C');
      expect(component.packageType).toBe('DIP-40');
      
      // Verify timestamps
      expect(component.createdAt).toBeDefined();
      expect(component.updatedAt).toBeDefined();
    });

    it('should handle component not found', async () => {
      const fakeId = '12345678123456781234567812345678'; // Valid format but non-existent
      
      const response = await request(app)
        .get(`/api/components/${fakeId}`)
        .expect(404);

      expect(response.body.error).toBe('Component not found');
    });

    it('should return components with proper field mapping in search results', async () => {
      const response = await request(app)
        .get('/api/components?term=Detail View Test')
        .expect(200);

      expect(response.body.length).toBeGreaterThan(0);
      
      const component = response.body.find((c: any) => c.id === testComponentId);
      expect(component).toBeDefined();
      expect(component.partNumber).toBe('DVT-001');
      expect(component.unitCost).toBe(12.50);
      expect(component.totalCost).toBe(187.50);
      expect(component.locationId).toBe(testLocationId);
      expect(component.minThreshold).toBe(5);
      expect(component.datasheetUrl).toBe('https://example.com/datasheet.pdf');
      expect(component.packageType).toBe('DIP-40');
      expect(component.pinCount).toBe(40);
      expect(Array.isArray(component.tags)).toBe(true);
      expect(Array.isArray(component.protocols)).toBe(true);
    });

    it('should update component and return properly mapped fields', async () => {
      const updateData = {
        name: 'Updated Detail View Component',
        unitCost: 15.99,
        totalCost: 239.85,
        quantity: 20,
        notes: 'Updated notes with new URL: https://updated.example.com'
      };

      const response = await request(app)
        .put(`/api/components/${testComponentId}`)
        .send(updateData)
        .expect(200);

      // Verify updated fields are properly mapped
      expect(response.body.name).toBe('Updated Detail View Component');
      expect(response.body.unitCost).toBe(15.99);
      expect(response.body.totalCost).toBe(239.85);
      expect(response.body.quantity).toBe(20);
      expect(response.body.notes).toContain('https://updated.example.com');
      
      // Verify other fields remain unchanged
      expect(response.body.partNumber).toBe('DVT-001');
      expect(response.body.manufacturer).toBe('Test Corp');
      expect(response.body.locationId).toBe(testLocationId);
    });
  });

  describe('Component Detail View Data Requirements', () => {
    it('should provide all data needed for detail view display', async () => {
      const response = await request(app)
        .get(`/api/components/${testComponentId}`)
        .expect(200);

      const component = response.body;

      // Basic information section
      expect(component.name).toBeDefined();
      expect(component.partNumber).toBeDefined();
      expect(component.manufacturer).toBeDefined();
      expect(component.category).toBeDefined();
      expect(component.status).toBeDefined();
      expect(component.quantity).toBeDefined();
      expect(component.packageType).toBeDefined();

      // Cost information
      expect(component.unitCost).toBeDefined();
      expect(component.totalCost).toBeDefined();

      // Specifications
      expect(component.voltage).toBeDefined();
      expect(component.current).toBeDefined();
      expect(component.pinCount).toBeDefined();

      // Additional data
      expect(component.tags).toBeDefined();
      expect(component.protocols).toBeDefined();
      expect(component.description).toBeDefined();
      expect(component.notes).toBeDefined();
      expect(component.datasheetUrl).toBeDefined();

      // Timestamps
      expect(component.createdAt).toBeDefined();
      expect(component.updatedAt).toBeDefined();

      // Location reference
      expect(component.locationId).toBeDefined();
    });

    it('should handle components with minimal data gracefully', async () => {
      // Create a minimal component
      const minimalResponse = await request(app)
        .post('/api/components')
        .send({
          name: 'Minimal Test Component',
          category: 'passive',
          quantity: 1
        })
        .expect(201);

      const minimalComponentId = minimalResponse.body.id;

      // Retrieve the minimal component
      const response = await request(app)
        .get(`/api/components/${minimalComponentId}`)
        .expect(200);

      const component = response.body;
      
      // Required fields should be present
      expect(component.name).toBe('Minimal Test Component');
      expect(component.category).toBe('passive');
      expect(component.quantity).toBe(1);
      expect(component.status).toBe('available'); // default value
      
      // Optional fields should be handled gracefully (null, undefined, or empty arrays)
      expect(Array.isArray(component.tags)).toBe(true);
      expect(Array.isArray(component.protocols)).toBe(true);
    });
  });

  describe('Location Integration', () => {
    it('should support fetching location data for component detail view', async () => {
      // Get the location for the component
      const locationResponse = await request(app)
        .get(`/api/locations/${testLocationId}`)
        .expect(200);

      const location = locationResponse.body;
      expect(location.id).toBe(testLocationId);
      expect(location.name).toBe('Detail View Test Location');
      expect(location.type).toBe('cabinet');
      expect(location.description).toBe('Location for detail view tests');
    });
  });

  describe('Photo Management Integration', () => {
    it('should handle photo URL updates via component update endpoint', async () => {
      const photoUrl = '/uploads/test-component-photo.jpg';
      
      const response = await request(app)
        .put(`/api/components/${testComponentId}`)
        .send({ imageUrl: photoUrl })
        .expect(200);

      expect(response.body.imageUrl).toBe(photoUrl);
    });

    it('should handle photo URL removal', async () => {
      // First set a photo
      await request(app)
        .put(`/api/components/${testComponentId}`)
        .send({ imageUrl: '/uploads/temp-photo.jpg' })
        .expect(200);

      // Then remove it
      const response = await request(app)
        .put(`/api/components/${testComponentId}`)
        .send({ imageUrl: null })
        .expect(200);

      expect(response.body.imageUrl).toBeNull();
    });
  });

  describe('Field Validation for Detail View', () => {
    it('should validate URL fields properly', async () => {
      const validUrl = 'https://valid-url.example.com/datasheet.pdf';
      
      const response = await request(app)
        .put(`/api/components/${testComponentId}`)
        .send({ datasheetUrl: validUrl })
        .expect(200);

      expect(response.body.datasheetUrl).toBe(validUrl);
    });

    it('should reject invalid URL formats', async () => {
      const invalidUrl = 'not-a-valid-url';
      
      const response = await request(app)
        .put(`/api/components/${testComponentId}`)
        .send({ datasheetUrl: invalidUrl })
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
    });

    it('should handle complex voltage specifications', async () => {
      const voltageSpec = {
        min: 2.7,
        max: 5.5,
        nominal: 3.3,
        unit: 'V'
      };

      const response = await request(app)
        .put(`/api/components/${testComponentId}`)
        .send({ voltage: voltageSpec })
        .expect(200);

      expect(response.body.voltage).toEqual(voltageSpec);
    });
  });
});