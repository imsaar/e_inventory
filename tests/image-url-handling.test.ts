import { describe, it, expect, beforeEach } from '@jest/globals';
const request = require('supertest');
import app from '../server/index';
import path from 'path';
import fs from 'fs';

describe('Image URL Handling in Components', () => {
  let testLocationId: string;
  let uploadedPhotoUrl: string;

  beforeEach(async () => {
    // Clean up existing test components
    const components = await request(app).get('/api/components');
    for (const component of components.body) {
      if (component.name.includes('Image URL Test')) {
        await request(app).delete(`/api/components/${component.id}`);
      }
    }

    // Create test location
    const locationResponse = await request(app)
      .post('/api/locations')
      .send({ name: 'Image URL Test Location', type: 'box' });
    testLocationId = locationResponse.body.id;

    // Upload a test photo
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
      .attach('photo', testImageBuffer, 'test-image-url-handling.png');

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

  describe('Component Creation with Different Image URL Formats', () => {
    it('should handle absolute image URL with /uploads/ prefix', async () => {
      const componentData = {
        name: 'Image URL Test Component - Absolute',
        category: 'ICs',
        quantity: 5,
        imageUrl: uploadedPhotoUrl // This will be like "/uploads/filename.jpg"
      };

      const response = await request(app)
        .post('/api/components')
        .send(componentData)
        .expect(201);

      expect(response.body.imageUrl).toBe(uploadedPhotoUrl);
      expect(response.body.imageUrl).toMatch(/^\/uploads\//);
    });

    it('should handle relative image URL without prefix (AliExpress style)', async () => {
      const relativeImageUrl = 'imported-images/test-component.jpg';
      const componentData = {
        name: 'Image URL Test Component - Relative',
        category: 'ICs', 
        quantity: 5,
        imageUrl: relativeImageUrl
      };

      const response = await request(app)
        .post('/api/components')
        .send(componentData)
        .expect(201);

      expect(response.body.imageUrl).toBe(relativeImageUrl);
      expect(response.body.imageUrl).not.toMatch(/^\/uploads\//);
    });

    it('should handle empty image URL', async () => {
      const componentData = {
        name: 'Image URL Test Component - Empty',
        category: 'ICs',
        quantity: 5,
        imageUrl: ''
      };

      const response = await request(app)
        .post('/api/components')
        .send(componentData)
        .expect(201);

      expect(response.body.imageUrl).toBe('');
    });

    it('should handle null image URL', async () => {
      const componentData = {
        name: 'Image URL Test Component - Null',
        category: 'ICs',
        quantity: 5,
        imageUrl: null
      };

      const response = await request(app)
        .post('/api/components')
        .send(componentData)
        .expect(201);

      expect(response.body.imageUrl).toBeNull();
    });
  });

  describe('Component Updates with Image URLs', () => {
    let testComponentId: string;

    beforeEach(async () => {
      const componentData = {
        name: 'Image URL Test Update Component',
        category: 'Sensors',
        quantity: 10
      };

      const response = await request(app)
        .post('/api/components')
        .send(componentData);
      
      testComponentId = response.body.id;
    });

    it('should update component with new uploaded image URL', async () => {
      const updateData = {
        imageUrl: uploadedPhotoUrl
      };

      const response = await request(app)
        .put(`/api/components/${testComponentId}`)
        .send(updateData)
        .expect(200);

      expect(response.body.imageUrl).toBe(uploadedPhotoUrl);
      expect(response.body.imageUrl).toMatch(/^\/uploads\//);
    });

    it('should update component with relative image URL', async () => {
      const relativeUrl = 'imported-images/updated-component.png';
      const updateData = {
        imageUrl: relativeUrl
      };

      const response = await request(app)
        .put(`/api/components/${testComponentId}`)
        .send(updateData)
        .expect(200);

      expect(response.body.imageUrl).toBe(relativeUrl);
    });

    it('should clear image URL when set to empty string', async () => {
      // First set an image
      await request(app)
        .put(`/api/components/${testComponentId}`)
        .send({ imageUrl: uploadedPhotoUrl });

      // Then clear it
      const response = await request(app)
        .put(`/api/components/${testComponentId}`)
        .send({ imageUrl: '' })
        .expect(200);

      expect(response.body.imageUrl).toBe('');
    });

    it('should clear image URL when set to null', async () => {
      // First set an image
      await request(app)
        .put(`/api/components/${testComponentId}`)
        .send({ imageUrl: uploadedPhotoUrl });

      // Then clear it
      const response = await request(app)
        .put(`/api/components/${testComponentId}`)
        .send({ imageUrl: null })
        .expect(200);

      expect(response.body.imageUrl).toBeNull();
    });
  });

  describe('Component Retrieval with Image URLs', () => {
    let absoluteUrlComponentId: string;
    let relativeUrlComponentId: string;
    let noImageComponentId: string;

    beforeEach(async () => {
      // Create component with absolute URL
      const absoluteResponse = await request(app)
        .post('/api/components')
        .send({
          name: 'Image URL Test Retrieval - Absolute',
          category: 'ICs',
          quantity: 5,
          imageUrl: uploadedPhotoUrl
        });
      absoluteUrlComponentId = absoluteResponse.body.id;

      // Create component with relative URL
      const relativeResponse = await request(app)
        .post('/api/components')
        .send({
          name: 'Image URL Test Retrieval - Relative',
          category: 'ICs',
          quantity: 5,
          imageUrl: 'imported-images/test-component.jpg'
        });
      relativeUrlComponentId = relativeResponse.body.id;

      // Create component without image
      const noImageResponse = await request(app)
        .post('/api/components')
        .send({
          name: 'Image URL Test Retrieval - No Image',
          category: 'ICs',
          quantity: 5
        });
      noImageComponentId = noImageResponse.body.id;
    });

    it('should retrieve component with absolute image URL correctly', async () => {
      const response = await request(app)
        .get(`/api/components/${absoluteUrlComponentId}`)
        .expect(200);

      expect(response.body.imageUrl).toBe(uploadedPhotoUrl);
      expect(response.body.imageUrl).toMatch(/^\/uploads\//);
    });

    it('should retrieve component with relative image URL correctly', async () => {
      const response = await request(app)
        .get(`/api/components/${relativeUrlComponentId}`)
        .expect(200);

      expect(response.body.imageUrl).toBe('imported-images/test-component.jpg');
      expect(response.body.imageUrl).not.toMatch(/^\/uploads\//);
    });

    it('should retrieve component without image URL correctly', async () => {
      const response = await request(app)
        .get(`/api/components/${noImageComponentId}`)
        .expect(200);

      expect(response.body.imageUrl).toBeNull();
    });

    it('should list all components with proper image URL formats', async () => {
      const response = await request(app)
        .get('/api/components')
        .expect(200);

      const components = response.body;
      
      const absoluteComponent = components.find((c: any) => c.id === absoluteUrlComponentId);
      expect(absoluteComponent.imageUrl).toBe(uploadedPhotoUrl);

      const relativeComponent = components.find((c: any) => c.id === relativeUrlComponentId);
      expect(relativeComponent.imageUrl).toBe('imported-images/test-component.jpg');

      const noImageComponent = components.find((c: any) => c.id === noImageComponentId);
      expect(noImageComponent.imageUrl).toBeNull();
    });
  });

  describe('Photo Upload Integration', () => {
    it('should return correct URL format from photo upload endpoint', async () => {
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

      const response = await request(app)
        .post('/api/uploads/photo')
        .attach('photo', testImageBuffer, 'test-upload-format.png')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.photoUrl).toMatch(/^\/uploads\//);
      expect(response.body.photoUrl).toMatch(/\.png$/);

      // Clean up the uploaded photo
      await request(app)
        .delete('/api/uploads/photo')
        .send({ photoUrl: response.body.photoUrl });
    });

    it('should handle photo deletion correctly', async () => {
      // Upload a photo first
      const testImageBuffer = Buffer.from([0x89, 0x50, 0x4E, 0x47]);
      const uploadResponse = await request(app)
        .post('/api/uploads/photo')
        .attach('photo', testImageBuffer, 'test-delete.png');

      const photoUrl = uploadResponse.body.photoUrl;

      // Delete the photo
      const deleteResponse = await request(app)
        .delete('/api/uploads/photo')
        .send({ photoUrl })
        .expect(200);

      expect(deleteResponse.body.success).toBe(true);
    });

    it('should reject invalid photo URL format for deletion', async () => {
      const response = await request(app)
        .delete('/api/uploads/photo')
        .send({ photoUrl: 'invalid-url' })
        .expect(400);

      expect(response.body.error).toContain('Invalid photo URL');
    });

    it('should handle deletion of non-existent photo gracefully', async () => {
      const response = await request(app)
        .delete('/api/uploads/photo')
        .send({ photoUrl: '/uploads/non-existent-file.jpg' })
        .expect(404);

      expect(response.body.error).toContain('Photo file not found');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should validate image URL length', async () => {
      const longUrl = '/uploads/' + 'a'.repeat(500); // Exceeds max length
      const componentData = {
        name: 'Image URL Test Long URL',
        category: 'ICs',
        imageUrl: longUrl
      };

      const response = await request(app)
        .post('/api/components')
        .send(componentData)
        .expect(400);

      expect(response.body.error).toContain('Image URL too long');
    });

    it('should handle special characters in image URLs', async () => {
      const specialCharUrl = 'imported-images/component-with-spaces-and-chars!@#.jpg';
      const componentData = {
        name: 'Image URL Test Special Chars',
        category: 'ICs',
        imageUrl: specialCharUrl
      };

      const response = await request(app)
        .post('/api/components')
        .send(componentData)
        .expect(201);

      expect(response.body.imageUrl).toBe(specialCharUrl);
    });

    it('should preserve image URL during other field updates', async () => {
      // Create component with image
      const createResponse = await request(app)
        .post('/api/components')
        .send({
          name: 'Image URL Test Preserve',
          category: 'ICs',
          quantity: 5,
          imageUrl: uploadedPhotoUrl
        });
      
      const componentId = createResponse.body.id;

      // Update other fields without touching imageUrl
      const updateResponse = await request(app)
        .put(`/api/components/${componentId}`)
        .send({
          quantity: 10,
          notes: 'Updated notes'
        })
        .expect(200);

      expect(updateResponse.body.imageUrl).toBe(uploadedPhotoUrl);
      expect(updateResponse.body.quantity).toBe(10);
      expect(updateResponse.body.notes).toBe('Updated notes');
    });
  });
});