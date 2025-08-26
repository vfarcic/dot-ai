// Jest setup file for configuring test environment and mocks

// Environment variable isolation - prevent tests from using real external services
beforeAll(() => {
  const envVarsToIsolate = [
    'ANTHROPIC_API_KEY',
    'OPENAI_API_KEY', 
    'KUBECONFIG',
    'QDRANT_URL',
    // DOT_AI_SESSION_DIR - removed from isolation as tests need it for workflow sessions
    'KUBERNETES_SERVICE_HOST', // Kubernetes in-cluster detection
    'KUBERNETES_SERVICE_PORT'
  ];

  // Unset environment variables to prevent real API/cluster connections during tests
  envVarsToIsolate.forEach(key => {
    delete process.env[key];
  });
  
  console.log('🔒 Environment variables isolated for testing - no external services will be used');
});

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