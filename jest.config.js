module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: {
        esModuleInterop: true,
        allowSyntheticDefaultImports: true
      }
    }]
  },
  moduleNameMapper: {
    '^../server/(.*)$': '<rootDir>/server/$1'
  },
  collectCoverageFrom: [
    'server/**/*.{ts,js}',
    '!server/**/*.d.ts',
    '!server/database.ts', // Exclude database setup file from coverage
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  testTimeout: 30000,
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  globalSetup: '<rootDir>/tests/globalSetup.ts',
  globalTeardown: '<rootDir>/tests/globalTeardown.ts'
};