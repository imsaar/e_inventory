import { describe, it, expect, beforeEach } from '@jest/globals';
import { getDatabaseInfo, resetDatabase } from '../server/database';

describe('Database Separation', () => {
  beforeEach(() => {
    // Reset database for each test
    resetDatabase();
  });

  it('should use test database in test environment', () => {
    const dbInfo = getDatabaseInfo();
    
    expect(dbInfo.isTest).toBe(true);
    expect(dbInfo.isDevelopment).toBe(false);
    expect(dbInfo.isProduction).toBe(false);
    expect(dbInfo.path).toContain('data/test');
    expect(dbInfo.path).toContain('test-inventory-');
    expect(dbInfo.path).toMatch(/test-inventory-\d+\.db$/);
  });

  it('should have separate data directory for tests', () => {
    const dbInfo = getDatabaseInfo();
    
    expect(dbInfo.dataDir).toContain('data/test');
    expect(dbInfo.dataDir).not.toContain('inventory-dev.db');
    expect(dbInfo.dataDir).not.toContain('inventory.db');
  });

  it('should not affect production database', () => {
    const dbInfo = getDatabaseInfo();
    
    // Ensure we're not using production paths
    expect(dbInfo.path).not.toContain('inventory.db');
    expect(dbInfo.path).not.toContain('inventory-dev.db');
  });

  it('should be able to reset test database without errors', () => {
    expect(() => {
      resetDatabase();
    }).not.toThrow();
  });

  it('should create unique database file per test run', () => {
    const dbInfo1 = getDatabaseInfo();
    
    // The database filename should contain a timestamp
    const timestampMatch = dbInfo1.path.match(/test-inventory-(\d+)\.db$/);
    expect(timestampMatch).toBeTruthy();
    
    if (timestampMatch) {
      const timestamp = parseInt(timestampMatch[1]);
      expect(timestamp).toBeGreaterThan(1640000000000); // After 2022
      expect(timestamp).toBeLessThanOrEqual(Date.now());
    }
  });
});

describe('Database Environment Configuration', () => {
  it('should log database configuration in test environment', () => {
    // Capture console output
    const consoleSpy = jest.spyOn(console, 'log');
    
    // Re-require the database module to trigger the logging
    jest.resetModules();
    require('../server/database');
    
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Database configuration:')
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Environment: test')
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Is test: true')
    );
    
    consoleSpy.mockRestore();
  });
});