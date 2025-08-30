const fs = require('fs');
const path = require('path');

module.exports = async function globalSetup() {
  console.log('Setting up test environment...');
  
  // Create a separate test database directory
  const testDataDir = path.join(__dirname, '../data/test');
  if (!fs.existsSync(testDataDir)) {
    fs.mkdirSync(testDataDir, { recursive: true });
  }
  
  // Set environment variable to use test database
  process.env.NODE_ENV = 'test';
  process.env.DB_PATH = path.join(testDataDir, 'test-inventory.db');
  
  console.log('Test environment setup complete');
};