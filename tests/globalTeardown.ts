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
        if (file.startsWith('test-inventory-') || file === 'test-inventory.db') {
          const filePath = path.join(testDataDir, file);
          try {
            fs.unlinkSync(filePath);
          } catch (error) {
            console.warn(`Could not delete ${file}:`, error.message);
          }
        }
      });
      
      // Only remove directory if it's empty
      try {
        const remainingFiles = fs.readdirSync(testDataDir);
        if (remainingFiles.length === 0) {
          fs.rmdirSync(testDataDir);
        }
      } catch (error) {
        // Directory might not be empty, that's ok
      }
      
      console.log('Test database cleaned up');
    } catch (error) {
      console.warn('Warning: Could not clean up test database:', error.message);
    }
  }
  
  console.log('Test environment cleanup complete');
};