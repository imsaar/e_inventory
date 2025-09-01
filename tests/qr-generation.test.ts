import { describe, it, expect } from '@jest/globals';

describe('QR Code Generation', () => {
  it('should generate location QR content', () => {
    const location = {
      id: 'test-location-id',
      name: 'Test Workshop',
      type: 'room' as const,
      qrCode: 'LOC-12345678',
      createdAt: '2023-01-01T00:00:00.000Z',
      updatedAt: '2023-01-01T00:00:00.000Z'
    };

    // Import the function and test it
    const { QRCodeGenerator } = require('../server/utils/qrGenerator');
    const content = QRCodeGenerator.generateLocationQRContent(location);
    
    expect(content).toBeDefined();
    expect(typeof content).toBe('string');
    
    // Parse the JSON content to verify structure
    const parsed = JSON.parse(content);
    expect(parsed.type).toBe('location');
    expect(parsed.id).toBe('test-location-id');
    expect(parsed.name).toBe('Test Workshop');
    expect(parsed.qrCode).toBe('LOC-12345678');
    expect(parsed.url).toContain('test-location-id');
  });

  it('should generate proper location URLs', () => {
    const { QRCodeGenerator } = require('../server/utils/qrGenerator');
    const url = QRCodeGenerator.generateLocationURL('test-id');
    
    expect(url).toBe('http://localhost:5173/locations?id=test-id');
  });

  it('should generate proper location URLs with custom base', () => {
    const { QRCodeGenerator } = require('../server/utils/qrGenerator');
    const url = QRCodeGenerator.generateLocationURL('test-id', 'https://myinventory.com');
    
    expect(url).toBe('https://myinventory.com/locations?id=test-id');
  });
});