import { describe, it, expect, beforeEach } from '@jest/globals';
const request = require('supertest');
import app from '../server/index';
import { Component, StorageLocation, Project } from '../src/types';

describe('URL handling in descriptions', () => {
  let testLocationId: string;

  beforeEach(async () => {
    // Clean up any existing test data
    const components = await request(app).get('/api/components');
    for (const component of components.body) {
      if (component.name.includes('URL Test')) {
        await request(app).delete(`/api/components/${component.id}`);
      }
    }

    // Create a test location for components
    const locationData = {
      name: 'Test Location for URL Tests',
      type: 'cabinet',
      description: 'Test location for URL tests'
    };
    const locationResponse = await request(app)
      .post('/api/locations')
      .send(locationData)
      .expect(201);
    
    testLocationId = locationResponse.body.id;
  });

  describe('Component descriptions with URLs', () => {
    it('should preserve URLs in component descriptions without escaping forward slashes', async () => {
      const componentData = {
        name: 'URL Test Component',
        category: 'passive',
        quantity: 1,
        description: 'Check out the datasheet at https://example.com/datasheet.pdf and the tutorial at https://tutorial.example.com/getting-started',
        locationId: testLocationId
      };

      const response = await request(app)
        .post('/api/components')
        .send(componentData)
        .expect(201);

      expect(response.body.description).toContain('https://example.com/datasheet.pdf');
      expect(response.body.description).toContain('https://tutorial.example.com/getting-started');
      expect(response.body.description).not.toContain('&#x2F;'); // Should not contain escaped forward slashes
    });

    it('should handle multiple URLs in component descriptions', async () => {
      const componentData = {
        name: 'Multi URL Test Component',
        category: 'microcontroller',
        quantity: 1,
        description: 'Documentation: https://docs.example.com/api, Code examples: https://github.com/user/repo, Video tutorial: https://youtube.com/watch?v=123',
        locationId: testLocationId
      };

      const response = await request(app)
        .post('/api/components')
        .send(componentData)
        .expect(201);

      expect(response.body.description).toContain('https://docs.example.com/api');
      expect(response.body.description).toContain('https://github.com/user/repo');
      expect(response.body.description).toContain('https://youtube.com/watch?v=123');
    });

    it('should preserve URLs with query parameters and fragments', async () => {
      const componentData = {
        name: 'Complex URL Test Component',
        category: 'sensor',
        quantity: 1,
        description: 'API docs: https://api.example.com/v1/docs?section=sensors&type=temperature#configuration',
        locationId: testLocationId
      };

      const response = await request(app)
        .post('/api/components')
        .send(componentData)
        .expect(201);

      expect(response.body.description).toContain('https://api.example.com/v1/docs?section=sensors&type=temperature#configuration');
      expect(response.body.description).not.toContain('&#x2F;');
    });

    it('should handle mixed content with URLs and regular text', async () => {
      const componentData = {
        name: 'Mixed Content Test Component',
        category: 'passive',
        quantity: 1,
        description: 'This is a 10kΩ resistor. Specs: https://example.com/specs.pdf. Works great with Arduino projects!',
        locationId: testLocationId
      };

      const response = await request(app)
        .post('/api/components')
        .send(componentData)
        .expect(201);

      expect(response.body.description).toContain('This is a 10kΩ resistor');
      expect(response.body.description).toContain('https://example.com/specs.pdf');
      expect(response.body.description).toContain('Works great with Arduino projects!');
    });

    it('should update component descriptions with URLs correctly', async () => {
      // Create component
      const createResponse = await request(app)
        .post('/api/components')
        .send({
          name: 'URL Update Test Component',
          category: 'passive',
          quantity: 1,
          description: 'Original description without URLs',
          locationId: testLocationId
        })
        .expect(201);

      const componentId = createResponse.body.id;

      // Update with URLs
      const updateResponse = await request(app)
        .put(`/api/components/${componentId}`)
        .send({
          description: 'Updated with URL: https://updated.example.com/new-info and another: https://github.com/project/repo'
        })
        .expect(200);

      expect(updateResponse.body.description).toContain('https://updated.example.com/new-info');
      expect(updateResponse.body.description).toContain('https://github.com/project/repo');
      expect(updateResponse.body.description).not.toContain('&#x2F;');
    });
  });

  describe('Location descriptions with URLs', () => {
    it('should preserve URLs in location descriptions', async () => {
      const locationData = {
        name: 'URL Test Location',
        type: 'drawer',
        description: 'Storage info: https://example.com/storage-guide and inventory system: https://inventory.example.com'
      };

      const response = await request(app)
        .post('/api/locations')
        .send(locationData)
        .expect(201);

      expect(response.body.description).toContain('https://example.com/storage-guide');
      expect(response.body.description).toContain('https://inventory.example.com');
      expect(response.body.description).not.toContain('&#x2F;');
    });

    it('should update location descriptions with URLs correctly', async () => {
      // Create location
      const createResponse = await request(app)
        .post('/api/locations')
        .send({
          name: 'URL Update Test Location',
          type: 'box',
          description: 'Original description'
        })
        .expect(201);

      const locationId = createResponse.body.id;

      // Update with URLs
      const updateResponse = await request(app)
        .put(`/api/locations/${locationId}`)
        .send({
          description: 'Updated with documentation: https://docs.example.com/locations'
        })
        .expect(200);

      expect(updateResponse.body.description).toContain('https://docs.example.com/locations');
      expect(updateResponse.body.description).not.toContain('&#x2F;');
    });
  });

  describe('Project descriptions with URLs', () => {
    it('should preserve URLs in project descriptions', async () => {
      const projectData = {
        name: 'URL Test Project',
        description: 'Project repository: https://github.com/user/project and documentation: https://project-docs.example.com',
        status: 'planning'
      };

      const response = await request(app)
        .post('/api/projects')
        .send(projectData)
        .expect(201);

      expect(response.body.description).toContain('https://github.com/user/project');
      expect(response.body.description).toContain('https://project-docs.example.com');
      expect(response.body.description).not.toContain('&#x2F;');
    });

    it('should update project descriptions with URLs correctly', async () => {
      // Create project
      const createResponse = await request(app)
        .post('/api/projects')
        .send({
          name: 'URL Update Test Project',
          description: 'Original description',
          status: 'planning'
        })
        .expect(201);

      const projectId = createResponse.body.id;

      // Update with URLs
      const updateResponse = await request(app)
        .put(`/api/projects/${projectId}`)
        .send({
          description: 'Updated with resources: https://resources.example.com and wiki: https://wiki.example.com/project-info'
        })
        .expect(200);

      expect(updateResponse.body.description).toContain('https://resources.example.com');
      expect(updateResponse.body.description).toContain('https://wiki.example.com/project-info');
      expect(updateResponse.body.description).not.toContain('&#x2F;');
    });
  });

  describe('XSS protection with URLs', () => {
    it('should still sanitize potential XSS while preserving URLs', async () => {
      const componentData = {
        name: 'XSS Protection Test Component',
        category: 'passive',
        quantity: 1,
        description: 'Valid URL: https://example.com/safe and potential XSS: <script>alert("xss")</script> and another URL: https://another.example.com',
        locationId: testLocationId
      };

      const response = await request(app)
        .post('/api/components')
        .send(componentData)
        .expect(201);

      expect(response.body.description).toContain('https://example.com/safe');
      expect(response.body.description).toContain('https://another.example.com');
      expect(response.body.description).toContain('&lt;script&gt;');
      expect(response.body.description).not.toContain('<script>');
    });

    it('should handle edge cases with mixed content', async () => {
      const componentData = {
        name: 'Edge Case Test Component',
        category: 'passive',
        quantity: 1,
        description: 'URL with quotes: https://example.com/page?title="test" and HTML: <div>content</div> and another URL: https://test.com',
        locationId: testLocationId
      };

      const response = await request(app)
        .post('/api/components')
        .send(componentData)
        .expect(201);

      expect(response.body.description).toContain('https://example.com/page?title=');
      expect(response.body.description).toContain('https://test.com');
      expect(response.body.description).toContain('&lt;div&gt;');
      expect(response.body.description).toContain('&quot;test&quot;');
      expect(response.body.description).not.toContain('<div>');
    });
  });

  describe('URL patterns and validation', () => {
    it('should handle various URL protocols and formats', async () => {
      const componentData = {
        name: 'URL Patterns Test Component',
        category: 'passive',
        quantity: 1,
        description: 'HTTP: http://example.com HTTPS: https://secure.example.com FTP: ftp://files.example.com',
        locationId: testLocationId
      };

      const response = await request(app)
        .post('/api/components')
        .send(componentData)
        .expect(201);

      expect(response.body.description).toContain('http://example.com');
      expect(response.body.description).toContain('https://secure.example.com');
      // Note: FTP URLs might need special handling depending on linkification requirements
    });

    it('should handle URLs in notes field', async () => {
      const componentData = {
        name: 'Notes URL Test Component',
        category: 'passive',
        quantity: 1,
        notes: 'Additional info: https://notes.example.com/component-info',
        locationId: testLocationId
      };

      const response = await request(app)
        .post('/api/components')
        .send(componentData)
        .expect(201);

      expect(response.body.notes).toContain('https://notes.example.com/component-info');
      expect(response.body.notes).not.toContain('&#x2F;');
    });
  });
});