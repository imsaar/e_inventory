import { beforeEach } from '@jest/globals';

// Global test setup
beforeEach(() => {
  // Reset any global state if needed
  // This runs before each individual test
});

// Increase timeout for tests that might take longer
jest.setTimeout(30000);

// Handle uncaught exceptions in tests
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});