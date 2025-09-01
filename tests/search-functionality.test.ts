import { describe, it, expect, beforeEach } from '@jest/globals';
const request = require('supertest');
import app from '../server/index';
import { Component } from '../src/types';

describe('Advanced Search Functionality', () => {
  let testLocationId: string;
  let testComponents: string[] = [];

  beforeEach(async () => {
    // Clean up existing test data
    const components = await request(app).get('/api/components');
    for (const component of components.body) {
      if (component.name.includes('Search Test')) {
        await request(app).delete(`/api/components/${component.id}`);
      }
    }

    // Create test location
    const locationResponse = await request(app)
      .post('/api/locations')
      .send({
        name: 'Search Test Location',
        type: 'cabinet',
        description: 'Location for search tests'
      })
      .expect(201);
    
    testLocationId = locationResponse.body.id;

    // Create diverse test components for search testing
    const componentData = [
      {
        name: 'Search Test Arduino Uno',
        category: 'microcontroller',
        subcategory: 'development_board',
        manufacturer: 'Arduino',
        partNumber: 'UNO-R3',
        description: 'Arduino Uno development board with USB connection',
        tags: ['arduino', 'microcontroller', 'development', 'usb'],
        quantity: 5,
        status: 'available',
        locationId: testLocationId
      },
      {
        name: 'Search Test Resistor 1k',
        category: 'passive',
        subcategory: 'resistor',
        manufacturer: 'Yageo',
        partNumber: 'CFR-25JB-52-1K',
        description: 'Carbon film resistor 1k ohm 1/4W',
        tags: ['resistor', 'passive', '1k', 'carbon-film'],
        quantity: 100,
        status: 'available',
        locationId: testLocationId
      },
      {
        name: 'Search Test ESP32 Module',
        category: 'microcontroller',
        subcategory: 'wireless_module',
        manufacturer: 'Espressif',
        partNumber: 'ESP32-WROOM-32',
        description: 'ESP32 WiFi and Bluetooth module for IoT projects',
        tags: ['esp32', 'wifi', 'bluetooth', 'iot', 'wireless'],
        quantity: 3,
        status: 'in_use',
        locationId: testLocationId
      },
      {
        name: 'Search Test LED Red 5mm',
        category: 'optoelectronics',
        subcategory: 'led',
        manufacturer: 'Kingbright',
        partNumber: 'WP7113ID',
        description: 'Standard red LED 5mm through-hole',
        tags: ['led', 'red', '5mm', 'through-hole'],
        quantity: 50,
        status: 'available',
        locationId: testLocationId
      },
      {
        name: 'Search Test Capacitor 100uF',
        category: 'passive',
        subcategory: 'capacitor',
        manufacturer: 'Panasonic',
        partNumber: 'ECA-1HM101',
        description: 'Electrolytic capacitor 100uF 50V radial',
        tags: ['capacitor', 'electrolytic', '100uf', 'radial'],
        quantity: 25,
        status: 'needs_testing',
        locationId: testLocationId
      }
    ];

    // Create all test components
    testComponents = [];
    for (const data of componentData) {
      const response = await request(app)
        .post('/api/components')
        .send(data)
        .expect(201);
      testComponents.push(response.body.id);
    }
  });

  describe('Text Search', () => {
    it('should search by component name', async () => {
      const response = await request(app)
        .get('/api/components?term=Arduino')
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].name).toContain('Arduino');
    });

    it('should search by part number', async () => {
      const response = await request(app)
        .get('/api/components?term=UNO-R3')
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].partNumber).toBe('UNO-R3');
    });

    it('should search by manufacturer', async () => {
      const response = await request(app)
        .get('/api/components?term=Espressif')
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].manufacturer).toBe('Espressif');
    });

    it('should search by description keywords', async () => {
      const response = await request(app)
        .get('/api/components?term=development board')
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].description).toContain('development board');
    });

    it('should search by tags', async () => {
      const response = await request(app)
        .get('/api/components?term=wifi')
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].tags).toContain('wifi');
    });

    it('should search by location name', async () => {
      const response = await request(app)
        .get('/api/components?term=Search Test Location')
        .expect(200);

      expect(response.body.length).toBeGreaterThan(0);
    });

    it('should perform case-insensitive search', async () => {
      const response = await request(app)
        .get('/api/components?term=ARDUINO')
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].name).toContain('Arduino');
    });

    it('should handle partial matches', async () => {
      const response = await request(app)
        .get('/api/components?term=resist')
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].name).toContain('Resistor');
    });
  });

  describe('Category Filtering', () => {
    it('should filter by category', async () => {
      const response = await request(app)
        .get('/api/components?category=microcontroller')
        .expect(200);

      expect(response.body).toHaveLength(2);
      response.body.forEach((component: Component) => {
        expect(component.category).toBe('microcontroller');
      });
    });

    it('should filter by subcategory', async () => {
      const response = await request(app)
        .get('/api/components?subcategory=led')
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].subcategory).toBe('led');
    });

    it('should filter by category and subcategory together', async () => {
      const response = await request(app)
        .get('/api/components?category=passive&subcategory=resistor')
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].category).toBe('passive');
      expect(response.body[0].subcategory).toBe('resistor');
    });
  });

  describe('Status and Manufacturer Filtering', () => {
    it('should filter by status', async () => {
      const response = await request(app)
        .get('/api/components?status=available')
        .expect(200);

      expect(response.body.length).toBeGreaterThan(0);
      response.body.forEach((component: Component) => {
        expect(component.status).toBe('available');
      });
    });

    it('should filter by manufacturer', async () => {
      const response = await request(app)
        .get('/api/components?manufacturer=Arduino')
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].manufacturer).toBe('Arduino');
    });

    it('should support partial manufacturer search', async () => {
      const response = await request(app)
        .get('/api/components?manufacturer=King')
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].manufacturer).toBe('Kingbright');
    });
  });

  describe('Quantity Filtering', () => {
    it('should filter by minimum quantity', async () => {
      const response = await request(app)
        .get('/api/components?minQuantity=50')
        .expect(200);

      expect(response.body.length).toBeGreaterThan(0);
      response.body.forEach((component: Component) => {
        expect(component.quantity).toBeGreaterThanOrEqual(50);
      });
    });

    it('should filter by maximum quantity', async () => {
      const response = await request(app)
        .get('/api/components?maxQuantity=10')
        .expect(200);

      expect(response.body.length).toBeGreaterThan(0);
      response.body.forEach((component: Component) => {
        expect(component.quantity).toBeLessThanOrEqual(10);
      });
    });

    it('should filter by quantity range', async () => {
      const response = await request(app)
        .get('/api/components?minQuantity=5&maxQuantity=50')
        .expect(200);

      expect(response.body.length).toBeGreaterThan(0);
      response.body.forEach((component: Component) => {
        expect(component.quantity).toBeGreaterThanOrEqual(5);
        expect(component.quantity).toBeLessThanOrEqual(50);
      });
    });
  });

  describe('Tag Filtering', () => {
    it('should filter by single tag', async () => {
      const response = await request(app)
        .get('/api/components?tags=arduino')
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].tags).toContain('arduino');
    });

    it('should filter by multiple tags (AND logic)', async () => {
      const response = await request(app)
        .get('/api/components?tags=esp32,wifi')
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].tags).toContain('esp32');
      expect(response.body[0].tags).toContain('wifi');
    });

    it('should handle non-existent tags gracefully', async () => {
      const response = await request(app)
        .get('/api/components?tags=nonexistent')
        .expect(200);

      expect(response.body).toHaveLength(0);
    });
  });

  describe('Location-based Filtering', () => {
    it('should filter by location ID', async () => {
      const response = await request(app)
        .get(`/api/components?locationId=${testLocationId}`)
        .expect(200);

      expect(response.body.length).toBe(5);
      response.body.forEach((component: Component) => {
        expect(component.locationId).toBe(testLocationId);
      });
    });

    it('should filter by location name', async () => {
      const response = await request(app)
        .get('/api/components?locationName=Search Test')
        .expect(200);

      expect(response.body.length).toBe(5);
    });

    it('should support partial location name search', async () => {
      const response = await request(app)
        .get('/api/components?locationName=Test')
        .expect(200);

      expect(response.body.length).toBe(5);
    });
  });

  describe('Part Number Filtering', () => {
    it('should filter by exact part number', async () => {
      const response = await request(app)
        .get('/api/components?partNumber=UNO-R3')
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].partNumber).toBe('UNO-R3');
    });

    it('should support partial part number search', async () => {
      const response = await request(app)
        .get('/api/components?partNumber=ESP32')
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].partNumber).toContain('ESP32');
    });
  });

  describe('Sorting', () => {
    it('should sort by name ascending (default)', async () => {
      const response = await request(app)
        .get('/api/components?sortBy=name&sortOrder=asc')
        .expect(200);

      const names = response.body.map((c: Component) => c.name);
      const sortedNames = [...names].sort();
      expect(names).toEqual(sortedNames);
    });

    it('should sort by name descending', async () => {
      const response = await request(app)
        .get('/api/components?sortBy=name&sortOrder=desc')
        .expect(200);

      const names = response.body.map((c: Component) => c.name);
      const sortedNames = [...names].sort().reverse();
      expect(names).toEqual(sortedNames);
    });

    it('should sort by quantity', async () => {
      const response = await request(app)
        .get('/api/components?sortBy=quantity&sortOrder=desc')
        .expect(200);

      const quantities = response.body.map((c: Component) => c.quantity);
      for (let i = 1; i < quantities.length; i++) {
        expect(quantities[i]).toBeLessThanOrEqual(quantities[i - 1]);
      }
    });

    it('should sort by category', async () => {
      const response = await request(app)
        .get('/api/components?sortBy=category&sortOrder=asc')
        .expect(200);

      const categories = response.body.map((c: Component) => c.category);
      const sortedCategories = [...categories].sort();
      expect(categories).toEqual(sortedCategories);
    });
  });

  describe('Combined Filtering', () => {
    it('should combine text search with category filter', async () => {
      const response = await request(app)
        .get('/api/components?term=test&category=passive')
        .expect(200);

      expect(response.body.length).toBeGreaterThan(0);
      response.body.forEach((component: Component) => {
        expect(component.category).toBe('passive');
        expect(component.name.toLowerCase()).toContain('test');
      });
    });

    it('should combine multiple filters', async () => {
      const response = await request(app)
        .get('/api/components?category=microcontroller&status=available&minQuantity=3')
        .expect(200);

      expect(response.body).toHaveLength(1);
      const component = response.body[0];
      expect(component.category).toBe('microcontroller');
      expect(component.status).toBe('available');
      expect(component.quantity).toBeGreaterThanOrEqual(3);
    });

    it('should combine text search, filters, and sorting', async () => {
      const response = await request(app)
        .get('/api/components?term=search&sortBy=quantity&sortOrder=desc')
        .expect(200);

      expect(response.body.length).toBeGreaterThan(1);
      
      // Check search results include the term
      response.body.forEach((component: Component) => {
        expect(component.name.toLowerCase()).toContain('search');
      });

      // Check sorting
      const quantities = response.body.map((c: Component) => c.quantity);
      for (let i = 1; i < quantities.length; i++) {
        expect(quantities[i]).toBeLessThanOrEqual(quantities[i - 1]);
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty search term', async () => {
      const response = await request(app)
        .get('/api/components?term=')
        .expect(200);

      expect(response.body.length).toBeGreaterThan(0);
    });

    it('should handle special characters in search', async () => {
      const response = await request(app)
        .get('/api/components?term=100uF')
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].name).toContain('100uF');
    });

    it('should handle no matches gracefully', async () => {
      const response = await request(app)
        .get('/api/components?term=nonexistentcomponent12345')
        .expect(200);

      expect(response.body).toHaveLength(0);
    });

    it('should handle invalid filter values gracefully', async () => {
      const response = await request(app)
        .get('/api/components?minQuantity=-1&maxQuantity=abc')
        .expect(400);

      expect(response.body.error).toBe('Invalid query parameters');
    });

    it('should return components with location information', async () => {
      const response = await request(app)
        .get('/api/components?term=search')
        .expect(200);

      expect(response.body.length).toBeGreaterThan(0);
      response.body.forEach((component: Component) => {
        expect(component.locationId).toBeDefined();
        // The location_name should be included from the JOIN
      });
    });
  });

  describe('Performance and Limits', () => {
    it('should handle large result sets efficiently', async () => {
      const startTime = Date.now();
      
      const response = await request(app)
        .get('/api/components')
        .expect(200);
      
      const endTime = Date.now();
      const responseTime = endTime - startTime;
      
      // Response should be under 1 second
      expect(responseTime).toBeLessThan(1000);
      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should validate search term length', async () => {
      const longTerm = 'a'.repeat(101);
      
      const response = await request(app)
        .get(`/api/components?term=${longTerm}`)
        .expect(400);
      
      expect(response.body.error).toBe('Invalid query parameters');
    });

    it('should validate tag array limits', async () => {
      const tooManyTags = Array.from({length: 11}, (_, i) => `tag${i}`).join(',');
      
      const response = await request(app)
        .get(`/api/components?tags=${tooManyTags}`)
        .expect(400);
      
      expect(response.body.error).toBe('Invalid query parameters');
    });
  });
});