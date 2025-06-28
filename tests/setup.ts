// Jest setup file for configuring test environment and mocks

// Mock console methods to reduce noise in test output (but allow console.error for actual errors)
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;

global.console = {
  ...console,
  log: jest.fn(),
  warn: jest.fn(),
  // Keep error for actual error reporting
  error: originalConsoleLog,
  info: jest.fn(),
  debug: jest.fn()
};

// Smart filesystem mocks that return real content for existing files
// but provide fallbacks for non-existent files
const fs = jest.requireActual('fs');

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  writeFileSync: jest.fn(),
  mkdirSync: jest.fn(),
  readdirSync: jest.fn((path: string) => {
    try {
      return fs.readdirSync(path);
    } catch {
      return [];
    }
  }),
  existsSync: jest.fn((path: string) => {
    try {
      return fs.existsSync(path);
    } catch {
      return false;
    }
  }),
  readFileSync: jest.fn((path: string, encoding?: any) => {
    try {
      return fs.readFileSync(path, encoding);
    } catch {
      // Return appropriate default for missing files
      if (path.includes('package.json')) {
        return JSON.stringify({ name: 'test-package', version: '1.0.0' });
      }
      if (path.includes('.yml') || path.includes('.yaml')) {
        return 'name: test\n';
      }
      return '';
    }
  })
}));

// Increase test timeout for integration tests
jest.setTimeout(30000);

// Suppress specific warnings that are expected in test environment
const originalWarn = console.warn;
console.warn = (...args) => {
  // Suppress specific ts-jest warnings that don't affect functionality
  if (typeof args[0] === 'string' && args[0].includes('ts-jest')) {
    return;
  }
  originalWarn.apply(console, args);
}; 