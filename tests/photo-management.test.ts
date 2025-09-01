import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
const request = require('supertest');
import app from '../server/index';
import path from 'path';
import fs from 'fs';

describe('Photo Management', () => {
  let testLocationId: string;
  let uploadedPhotoUrl: string;
  const uploadsDir = path.join(__dirname, '../uploads');

  beforeEach(async () => {
    // Clean up existing test data
    const locations = await request(app).get('/api/locations');
    for (const location of locations.body) {
      if (location.name.includes('Photo Test')) {
        await request(app).delete(`/api/locations/${location.id}`);
      }
    }

    // Clean up any existing test photos
    if (fs.existsSync(uploadsDir)) {
      const files = fs.readdirSync(uploadsDir);
      for (const file of files) {
        if (file.includes('test-')) {
          fs.unlinkSync(path.join(uploadsDir, file));
        }
      }
    }
  });

  afterEach(() => {
    // Clean up uploaded photos after tests
    if (uploadedPhotoUrl && fs.existsSync(uploadsDir)) {
      try {
        const filename = path.basename(uploadedPhotoUrl);
        const filePath = path.join(uploadsDir, filename);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (error) {
        console.warn('Failed to clean up test photo:', error);
      }
    }
  });

  describe('Photo Upload API', () => {
    it('should upload a photo successfully', async () => {
      // Create a small test image buffer (1x1 pixel PNG)
      const testImageBuffer = Buffer.from([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
        0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1x1 pixel
        0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
        0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41, // IDAT chunk
        0x54, 0x08, 0x99, 0x01, 0x01, 0x00, 0x00, 0x00,
        0xFF, 0xFF, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01,
        0xE2, 0x21, 0xBC, 0x33, 0x00, 0x00, 0x00, 0x00, // IEND chunk
        0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
      ]);

      const response = await request(app)
        .post('/api/uploads/photo')
        .attach('photo', testImageBuffer, 'test-image.png')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.photoUrl).toBeDefined();
      expect(response.body.photoUrl).toMatch(/^\/uploads\/.*\.png$/);
      expect(response.body.originalName).toBe('test-image.png');

      uploadedPhotoUrl = response.body.photoUrl;

      // Verify file actually exists
      const filename = path.basename(uploadedPhotoUrl);
      const filePath = path.join(uploadsDir, filename);
      expect(fs.existsSync(filePath)).toBe(true);
    });

    it('should reject non-image files', async () => {
      const textBuffer = Buffer.from('This is not an image');

      const response = await request(app)
        .post('/api/uploads/photo')
        .attach('photo', textBuffer, 'test.txt')
        .expect(400);

      expect(response.body.error).toContain('Only image files');
    });

    it('should reject requests without photo file', async () => {
      const response = await request(app)
        .post('/api/uploads/photo')
        .expect(400);

      expect(response.body.error).toBe('No photo file provided');
    });
  });

  describe('Photo Delete API', () => {
    beforeEach(async () => {
      // Upload a photo for deletion tests
      const testImageBuffer = Buffer.from([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
        0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
        0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41,
        0x54, 0x08, 0x99, 0x01, 0x01, 0x00, 0x00, 0x00,
        0xFF, 0xFF, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01,
        0xE2, 0x21, 0xBC, 0x33, 0x00, 0x00, 0x00, 0x00,
        0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
      ]);

      const uploadResponse = await request(app)
        .post('/api/uploads/photo')
        .attach('photo', testImageBuffer, 'delete-test.png')
        .expect(200);

      uploadedPhotoUrl = uploadResponse.body.photoUrl;
    });

    it('should delete a photo successfully', async () => {
      const response = await request(app)
        .delete('/api/uploads/photo')
        .send({ photoUrl: uploadedPhotoUrl })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Photo deleted successfully');

      // Verify file is actually deleted
      const filename = path.basename(uploadedPhotoUrl);
      const filePath = path.join(uploadsDir, filename);
      expect(fs.existsSync(filePath)).toBe(false);
    });

    it('should return 404 for non-existent photo', async () => {
      const response = await request(app)
        .delete('/api/uploads/photo')
        .send({ photoUrl: '/uploads/non-existent-file.png' })
        .expect(404);

      expect(response.body.error).toBe('Photo file not found');
    });

    it('should reject invalid photo URLs', async () => {
      const response = await request(app)
        .delete('/api/uploads/photo')
        .send({ photoUrl: '/malicious/path/file.png' })
        .expect(400);

      expect(response.body.error).toBe('Invalid photo URL');
    });

    it('should reject empty photo URL', async () => {
      const response = await request(app)
        .delete('/api/uploads/photo')
        .send({ photoUrl: '' })
        .expect(400);

      expect(response.body.error).toBe('Invalid photo URL');
    });
  });

  describe('Location Photo Integration', () => {
    beforeEach(async () => {
      // Upload a photo for location tests
      const testImageBuffer = Buffer.from([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
        0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
        0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41,
        0x54, 0x08, 0x99, 0x01, 0x01, 0x00, 0x00, 0x00,
        0xFF, 0xFF, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01,
        0xE2, 0x21, 0xBC, 0x33, 0x00, 0x00, 0x00, 0x00,
        0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
      ]);

      const uploadResponse = await request(app)
        .post('/api/uploads/photo')
        .attach('photo', testImageBuffer, 'location-test.png')
        .expect(200);

      uploadedPhotoUrl = uploadResponse.body.photoUrl;
    });

    it('should create location with photo', async () => {
      const locationData = {
        name: 'Photo Test Location',
        type: 'cabinet',
        description: 'Location for testing photo functionality',
        photoUrl: uploadedPhotoUrl,
        generateQR: true,
        tags: ['test', 'photo']
      };

      const response = await request(app)
        .post('/api/locations')
        .send(locationData)
        .expect(201);

      testLocationId = response.body.id;

      expect(response.body.name).toBe('Photo Test Location');
      expect(response.body.photoUrl).toBe(uploadedPhotoUrl);
      expect(response.body.description).toBe('Location for testing photo functionality');
    });

    it('should update location photo', async () => {
      // First create a location without a photo
      const locationResponse = await request(app)
        .post('/api/locations')
        .send({
          name: 'Photo Test Location Update',
          type: 'shelf',
          description: 'Location for testing photo updates',
          generateQR: false
        })
        .expect(201);

      testLocationId = locationResponse.body.id;

      // Update with photo
      const updateResponse = await request(app)
        .put(`/api/locations/${testLocationId}`)
        .send({
          photoUrl: uploadedPhotoUrl
        })
        .expect(200);

      expect(updateResponse.body.photoUrl).toBe(uploadedPhotoUrl);

      // Verify the change persisted
      const getResponse = await request(app)
        .get(`/api/locations/${testLocationId}`)
        .expect(200);

      expect(getResponse.body.photoUrl).toBe(uploadedPhotoUrl);
    });

    it('should remove photo from location', async () => {
      // Create location with photo
      const locationResponse = await request(app)
        .post('/api/locations')
        .send({
          name: 'Photo Test Location Remove',
          type: 'drawer',
          photoUrl: uploadedPhotoUrl,
          generateQR: false
        })
        .expect(201);

      testLocationId = locationResponse.body.id;

      // Remove photo by setting it to empty string
      const updateResponse = await request(app)
        .put(`/api/locations/${testLocationId}`)
        .send({
          photoUrl: ''
        })
        .expect(200);

      expect(updateResponse.body.photoUrl).toBeFalsy(); // Could be null or empty string

      // Verify removal persisted
      const getResponse = await request(app)
        .get(`/api/locations/${testLocationId}`)
        .expect(200);

      expect(getResponse.body.photoUrl).toBeFalsy(); // Could be null or empty string
    });

    it('should include photo in location detail view', async () => {
      // Create location with photo
      const locationResponse = await request(app)
        .post('/api/locations')
        .send({
          name: 'Photo Test Location Detail',
          type: 'room',
          description: 'Location for testing photo in detail view',
          photoUrl: uploadedPhotoUrl,
          generateQR: true,
          tags: ['test', 'detail', 'photo']
        })
        .expect(201);

      testLocationId = locationResponse.body.id;

      // Get location details
      const detailResponse = await request(app)
        .get(`/api/locations/${testLocationId}`)
        .expect(200);

      expect(detailResponse.body.photoUrl).toBe(uploadedPhotoUrl);
      expect(detailResponse.body.name).toBe('Photo Test Location Detail');
      expect(detailResponse.body.description).toBe('Location for testing photo in detail view');
      expect(detailResponse.body.tags).toEqual(['test', 'detail', 'photo']);
    });

    it('should handle location hierarchy with photos', async () => {
      // Upload another photo for child location
      const testImageBuffer2 = Buffer.from([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
        0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
        0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41,
        0x54, 0x08, 0x99, 0x01, 0x01, 0x00, 0x00, 0x00,
        0xFF, 0xFF, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01,
        0xE2, 0x21, 0xBC, 0x33, 0x00, 0x00, 0x00, 0x00,
        0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
      ]);

      const childPhotoResponse = await request(app)
        .post('/api/uploads/photo')
        .attach('photo', testImageBuffer2, 'child-location.png')
        .expect(200);

      const childPhotoUrl = childPhotoResponse.body.photoUrl;

      // Create parent location with photo
      const parentResponse = await request(app)
        .post('/api/locations')
        .send({
          name: 'Photo Test Parent Room',
          type: 'room',
          description: 'Parent room with photo',
          photoUrl: uploadedPhotoUrl,
          qrSize: 'large',
          generateQR: true
        })
        .expect(201);

      // Create child location with different photo
      const childResponse = await request(app)
        .post('/api/locations')
        .send({
          name: 'Photo Test Child Cabinet',
          type: 'cabinet',
          parentId: parentResponse.body.id,
          description: 'Child cabinet with photo',
          photoUrl: childPhotoUrl,
          qrSize: 'medium',
          generateQR: true
        })
        .expect(201);

      // Verify both locations have their respective photos
      expect(parentResponse.body.photoUrl).toBe(uploadedPhotoUrl);
      expect(childResponse.body.photoUrl).toBe(childPhotoUrl);

      // Get hierarchical structure and verify photos are preserved
      const allLocationsResponse = await request(app)
        .get('/api/locations')
        .expect(200);

      const parent = allLocationsResponse.body.find((loc: any) => loc.id === parentResponse.body.id);
      expect(parent).toBeDefined();
      expect(parent.photoUrl).toBe(uploadedPhotoUrl);
      expect(parent.children).toHaveLength(1);
      expect(parent.children[0].photoUrl).toBe(childPhotoUrl);

      // Clean up child photo
      await request(app)
        .delete('/api/uploads/photo')
        .send({ photoUrl: childPhotoUrl })
        .expect(200);
    });
  });

  describe('Photo Security', () => {
    it('should serve static files securely', async () => {
      // Upload a test photo
      const testImageBuffer = Buffer.from([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
        0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
        0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41,
        0x54, 0x08, 0x99, 0x01, 0x01, 0x00, 0x00, 0x00,
        0xFF, 0xFF, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01,
        0xE2, 0x21, 0xBC, 0x33, 0x00, 0x00, 0x00, 0x00,
        0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
      ]);

      const uploadResponse = await request(app)
        .post('/api/uploads/photo')
        .attach('photo', testImageBuffer, 'security-test.png')
        .expect(200);

      uploadedPhotoUrl = uploadResponse.body.photoUrl;

      // Try to access the uploaded file
      const filename = path.basename(uploadedPhotoUrl);
      const fileResponse = await request(app)
        .get(`/uploads/${filename}`)
        .expect(200);

      expect(fileResponse.type).toMatch(/image/);
    });

    it('should prevent directory traversal in photo deletion', async () => {
      const response = await request(app)
        .delete('/api/uploads/photo')
        .send({ photoUrl: '/uploads/../../../etc/passwd' })
        .expect(404);

      expect(response.body.error).toBe('Photo file not found');
    });
  });
});