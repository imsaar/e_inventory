const fs = require('fs');
const path = require('path');

module.exports = async function globalSetup() {
  console.log('Setting up test environment...');
  
  // Set test environment variables BEFORE any database imports
  process.env.NODE_ENV = 'test';
  
  // Create a separate test database directory
  const testDataDir = path.join(__dirname, '../data/test');
  if (!fs.existsSync(testDataDir)) {
    fs.mkdirSync(testDataDir, { recursive: true });
  }
  
  // Clean up any existing test databases
  if (fs.existsSync(testDataDir)) {
    const files = fs.readdirSync(testDataDir);
    files.forEach(file => {
      if (file.startsWith('test-inventory-') && file.endsWith('.db')) {
        const filePath = path.join(testDataDir, file);
        try {
          fs.unlinkSync(filePath);
        } catch (error) {
          // Ignore errors
        }
      }
    });
  }
  
  console.log('Test environment setup complete');
};