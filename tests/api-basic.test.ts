const request = require('supertest');
import app from '../server/index';

describe('Basic API Test', () => {
  it('should respond to health check', async () => {
    const response = await request(app)
      .get('/api/health')
      .expect(200);

    expect(response.body.status).toBe('OK');
    expect(response.body).toHaveProperty('timestamp');
  });

  it('should create and delete a location', async () => {
    // Create a location
    const locationData = {
      name: 'Test Basic Location',
      type: 'room',
      description: 'Basic test location'
    };

    const createResponse = await request(app)
      .post('/api/locations')
      .send(locationData)
      .expect(201);

    expect(createResponse.body.name).toBe('Test Basic Location');
    expect(createResponse.body).toHaveProperty('id');
    
    const locationId = createResponse.body.id;

    // Delete the location
    await request(app)
      .delete(`/api/locations/${locationId}`)
      .expect(200);

    // Verify it's deleted
    await request(app)
      .get(`/api/locations/${locationId}`)
      .expect(404);
  });
});