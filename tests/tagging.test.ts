import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
const request = require('supertest');
import app from '../server/index';
import { Component, StorageLocation, Project } from '../src/types';

describe('Tagging functionality', () => {
  let testLocationId: string;

  beforeEach(async () => {
    // Clean up any existing test data
    const components = await request(app).get('/api/components');
    for (const component of components.body) {
      if (component.name.includes('Test') || component.name.includes('Tagged')) {
        await request(app).delete(`/api/components/${component.id}`);
      }
    }

    // Create a test location for components
    const locationData = {
      name: 'Test Location for Tagging',
      type: 'cabinet',
      description: 'Test location for tagging tests'
    };
    const locationResponse = await request(app)
      .post('/api/locations')
      .send(locationData)
      .expect(201);
    
    testLocationId = locationResponse.body.id;
  });

  describe('Component tagging', () => {
    it('should create a component with tags', async () => {
      const componentData = {
        name: 'Test Component with Tags',
        category: 'passive',
        quantity: 10,
        tags: ['resistor', '1k-ohm', 'through-hole', 'carbon-film'],
        locationId: testLocationId
      };

      const response = await request(app)
        .post('/api/components')
        .send(componentData)
        .expect(201);

      expect(response.body.tags).toEqual(['resistor', '1k-ohm', 'through-hole', 'carbon-film']);
      expect(Array.isArray(response.body.tags)).toBe(true);
    });

    it('should create a component with empty tags array', async () => {
      
      const componentData = {
        name: 'Test Component No Tags',
        category: 'passive',
        quantity: 5,
        tags: [],
        locationId: testLocationId
      };

      const response = await request(app)
        .post('/api/components')
        .send(componentData)
        .expect(201);

      expect(response.body.tags).toEqual([]);
    });

    it('should update component tags', async () => {
      
      // Create component
      const createResponse = await request(app)
        .post('/api/components')
        .send({
          name: 'Test Update Tags',
          category: 'passive',
          quantity: 1,
          tags: ['original', 'tags'],
          locationId: testLocationId
        })
        .expect(201);

      const componentId = createResponse.body.id;

      // Update tags
      const updateResponse = await request(app)
        .put(`/api/components/${componentId}`)
        .send({
          tags: ['updated', 'different', 'tags', 'here']
        })
        .expect(200);

      expect(updateResponse.body.tags).toEqual(['updated', 'different', 'tags', 'here']);

      // Verify via GET
      const getResponse = await request(app)
        .get(`/api/components/${componentId}`)
        .expect(200);

      expect(getResponse.body.tags).toEqual(['updated', 'different', 'tags', 'here']);
    });

    it('should filter components by tags', async () => {
      
      // Create components with different tags
      await request(app)
        .post('/api/components')
        .send({
          name: 'Arduino Component',
          category: 'microcontroller',
          quantity: 1,
          tags: ['arduino', 'microcontroller', 'development'],
          locationId: testLocationId
        });

      await request(app)
        .post('/api/components')
        .send({
          name: 'Raspberry Pi Component',
          category: 'microcontroller',
          quantity: 1,
          tags: ['raspberry-pi', 'sbc', 'development'],
          locationId: testLocationId
        });

      await request(app)
        .post('/api/components')
        .send({
          name: 'Resistor Component',
          category: 'passive',
          quantity: 1,
          tags: ['resistor', 'passive'],
          locationId: testLocationId
        });

      // Search for components with 'arduino' tag
      const arduinoResponse = await request(app)
        .get('/api/components?tags=arduino')
        .expect(200);

      expect(arduinoResponse.body).toHaveLength(1);
      expect(arduinoResponse.body[0].name).toBe('Arduino Component');
      expect(arduinoResponse.body[0].tags).toContain('arduino');

      // Search for components with 'development' tag
      const developmentResponse = await request(app)
        .get('/api/components?tags=development')
        .expect(200);

      expect(developmentResponse.body).toHaveLength(2);
      expect(developmentResponse.body.map((c: Component) => c.name)).toContain('Arduino Component');
      expect(developmentResponse.body.map((c: Component) => c.name)).toContain('Raspberry Pi Component');

      // Search for components with multiple tags (should match all)
      const multiTagResponse = await request(app)
        .get('/api/components?tags=development,microcontroller')
        .expect(200);

      expect(multiTagResponse.body).toHaveLength(1);
      expect(multiTagResponse.body[0].name).toBe('Arduino Component');
    });

    it('should search components by tag text', async () => {
      
      await request(app)
        .post('/api/components')
        .send({
          name: 'Searchable Component',
          category: 'passive',
          quantity: 1,
          tags: ['special-search-tag', 'unique-identifier'],
          locationId: testLocationId
        });

      // Search by term that matches a tag
      const searchResponse = await request(app)
        .get('/api/components?term=special-search-tag')
        .expect(200);

      expect(searchResponse.body).toHaveLength(1);
      expect(searchResponse.body[0].name).toBe('Searchable Component');
    });

    it('should validate tag constraints', async () => {
      
      // Test max tags limit (more than 10)
      const tooManyTags = Array.from({length: 15}, (_, i) => `tag${i}`);
      
      const response = await request(app)
        .post('/api/components')
        .send({
          name: 'Too Many Tags Component',
          category: 'passive',
          quantity: 1,
          tags: tooManyTags,
          locationId: testLocationId
        })
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
      expect(response.body.details.some((d: any) => d.message.includes('Too many tags'))).toBe(true);
    });

    it('should handle special characters in tags', async () => {
      
      const componentData = {
        name: 'Special Char Tags Component',
        category: 'passive',
        quantity: 1,
        tags: ['tag-with-dash', 'tag_with_underscore', 'tag.with.dot', 'tag with space'],
        locationId: testLocationId
      };

      const response = await request(app)
        .post('/api/components')
        .send(componentData)
        .expect(201);

      expect(response.body.tags).toEqual([
        'tag-with-dash', 
        'tag_with_underscore', 
        'tag.with.dot', 
        'tag with space'
      ]);
    });
  });

  describe('Location tagging', () => {
    it('should create a location with tags', async () => {
      const locationData = {
        name: 'Tagged Storage Location',
        type: 'cabinet',
        description: 'A cabinet with tags',
        tags: ['electronics', 'components', 'organized', 'main-lab']
      };

      const response = await request(app)
        .post('/api/locations')
        .send(locationData)
        .expect(201);

      expect(response.body.tags).toEqual(['electronics', 'components', 'organized', 'main-lab']);
    });

    it('should update location tags', async () => {
      const createResponse = await request(app)
        .post('/api/locations')
        .send({
          name: 'Update Tags Location',
          type: 'drawer',
          tags: ['old', 'tags']
        })
        .expect(201);

      const locationId = createResponse.body.id;

      const updateResponse = await request(app)
        .put(`/api/locations/${locationId}`)
        .send({
          tags: ['new', 'updated', 'tags']
        })
        .expect(200);

      expect(updateResponse.body.tags).toEqual(['new', 'updated', 'tags']);
    });

    it('should handle empty location tags', async () => {
      const locationData = {
        name: 'No Tags Location',
        type: 'box',
        tags: []
      };

      const response = await request(app)
        .post('/api/locations')
        .send(locationData)
        .expect(201);

      expect(response.body.tags).toEqual([]);
    });
  });

  describe('Project tagging', () => {
    it('should create a project with tags', async () => {
      const projectData = {
        name: 'Tagged Project',
        description: 'A project with tags',
        status: 'planning',
        tags: ['iot', 'arduino', 'sensors', 'home-automation']
      };

      const response = await request(app)
        .post('/api/projects')
        .send(projectData)
        .expect(201);

      expect(response.body.tags).toEqual(['iot', 'arduino', 'sensors', 'home-automation']);
    });

    it('should update project tags', async () => {
      const createResponse = await request(app)
        .post('/api/projects')
        .send({
          name: 'Update Tags Project',
          description: 'Test project for tag updates',
          tags: ['original', 'project', 'tags']
        })
        .expect(201);

      const projectId = createResponse.body.id;

      const updateResponse = await request(app)
        .put(`/api/projects/${projectId}`)
        .send({
          tags: ['updated', 'project', 'tags', 'here']
        })
        .expect(200);

      expect(updateResponse.body.tags).toEqual(['updated', 'project', 'tags', 'here']);
    });

    it('should handle empty project tags', async () => {
      const projectData = {
        name: 'No Tags Project',
        description: 'A project without tags',
        tags: []
      };

      const response = await request(app)
        .post('/api/projects')
        .send(projectData)
        .expect(201);

      expect(response.body.tags).toEqual([]);
    });
  });

  describe('Tag validation across all entities', () => {
    it('should enforce tag length limits', async () => {
      const longTag = 'a'.repeat(55); // Longer than 50 character limit

      const response = await request(app)
        .post('/api/components')
        .send({
          name: 'Long Tag Component',
          category: 'passive',
          quantity: 1,
          tags: [longTag],
          locationId: testLocationId
        })
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
      expect(response.body.details.some((d: any) => d.message.includes('Tag too long'))).toBe(true);
    });

    it('should handle tag arrays in query parameters correctly', async () => {
      
      await request(app)
        .post('/api/components')
        .send({
          name: 'Query Test Component',
          category: 'passive',
          quantity: 1,
          tags: ['query-test', 'param-handling'],
          locationId: testLocationId
        });

      // Test comma-separated tags in query
      const response = await request(app)
        .get('/api/components?tags=query-test,param-handling')
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].name).toBe('Query Test Component');
    });
  });

  describe('Tag edge cases', () => {
    it('should preserve tag order', async () => {
      const orderedTags = ['first', 'second', 'third', 'fourth'];
      
      const response = await request(app)
        .post('/api/components')
        .send({
          name: 'Ordered Tags Component',
          category: 'passive',
          quantity: 1,
          tags: orderedTags,
          locationId: testLocationId
        })
        .expect(201);

      expect(response.body.tags).toEqual(orderedTags);
    });

    it('should handle unicode characters in tags', async () => {
      const unicodeTags = ['测试', '🔧', 'résistance', 'Ω'];
      
      const response = await request(app)
        .post('/api/components')
        .send({
          name: 'Unicode Tags Component',
          category: 'passive',
          quantity: 1,
          tags: unicodeTags,
          locationId: testLocationId
        })
        .expect(201);

      expect(response.body.tags).toEqual(unicodeTags);
    });

    it('should handle case insensitive tag searches (SQLite default)', async () => {
      
      await request(app)
        .post('/api/components')
        .send({
          name: 'Case Sensitive Component',
          category: 'passive',
          quantity: 1,
          tags: ['CaseSensitive', 'lowercase', 'UPPERCASE'],
          locationId: testLocationId
        });

      // Test exact case match
      const exactResponse = await request(app)
        .get('/api/components?tags=CaseSensitive')
        .expect(200);

      expect(exactResponse.body).toHaveLength(1);

      // Test different case - should still match (SQLite LIKE is case insensitive)
      const differentCaseResponse = await request(app)
        .get('/api/components?tags=casesensitive')
        .expect(200);

      expect(differentCaseResponse.body).toHaveLength(1);
      expect(differentCaseResponse.body[0].name).toBe('Case Sensitive Component');
    });
  });
});