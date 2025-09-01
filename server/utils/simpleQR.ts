import { StorageLocation } from '../../src/types';

// Simple QR code generation for testing
export function generateLocationQRContent(location: StorageLocation): string {
  const content = {
    type: 'location',
    id: location.id,
    name: location.name,
    qrCode: location.qrCode,
    url: `http://localhost:5173/locations?id=${location.id}`
  };
  
  return JSON.stringify(content);
}

// For now, return a simple response without actual PDF generation
export function generateSimpleResponse(locations: StorageLocation[]): string {
  return JSON.stringify({
    message: `Found ${locations.length} locations with QR codes`,
    locations: locations.map(loc => ({
      name: loc.name,
      qrCode: loc.qrCode,
      content: generateLocationQRContent(loc)
    }))
  }, null, 2);
}