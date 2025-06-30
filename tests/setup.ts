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

// Filesystem mocks removed - tests should use real filesystem
// Individual tests can mock fs operations if needed for specific test cases

// Increase test timeout for integration tests
jest.setTimeout(30000);

// Suppress specific warnings that are expected in test environment
const originalWarn = console.warn;
console.warn = (...args: any[]) => {
  // Suppress specific ts-jest warnings that don't affect functionality
  if (typeof args[0] === 'string' && args[0].includes('ts-jest')) {
    return;
  }
  originalWarn.apply(console, args);
}; 