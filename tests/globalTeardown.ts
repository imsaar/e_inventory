const fs = require('fs');
const path = require('path');

module.exports = async function globalTeardown() {
  console.log('Cleaning up test environment...');
  
  // Clean up test database files
  const testDataDir = path.join(__dirname, '../data/test');
  if (fs.existsSync(testDataDir)) {
    try {
      const files = fs.readdirSync(testDataDir);
      files.forEach(file => {
        const filePath = path.join(testDataDir, file);
        fs.unlinkSync(filePath);
      });
      fs.rmdirSync(testDataDir);
      console.log('Test database cleaned up');
    } catch (error) {
      console.warn('Warning: Could not clean up test database:', error);
    }
  }
  
  console.log('Test environment cleanup complete');
};