/**
 * Configuration Validation Tests
 * 
 * These tests define the requirements for our package.json and TypeScript configuration
 * Following TDD approach - these tests define what we SHOULD have before we implement it
 */

import fs from 'fs';
import path from 'path';

describe('Package.json Configuration', () => {
  let packageJson: any;

  beforeAll(() => {
    packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  });

  describe('Basic Package Information', () => {
    test('should have correct package metadata', () => {
      expect(packageJson.name).toBe('@vfarcic/dot-ai');
      expect(packageJson.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(packageJson.description).toContain('Kubernetes');
      expect(packageJson.description).toContain('CLI');
      expect(packageJson.description).toContain('MCP');
      expect(packageJson.license).toBe('MIT');
      expect(packageJson.author).toBeDefined();
    });

    test('should have proper keywords for discoverability', () => {
      expect(packageJson.keywords).toContain('kubernetes');
      expect(packageJson.keywords).toContain('cli');
      expect(packageJson.keywords).toContain('mcp');
      expect(packageJson.keywords).toContain('deployment');
    });
  });

  describe('Entry Points and Exports', () => {
    test('should support both CLI and MCP entry points', () => {
      expect(packageJson.main).toBe('dist/index.js');
      expect(packageJson.bin).toHaveProperty('dot-ai');
      expect(packageJson.exports['.']).toBe('./dist/index.js');
      expect(packageJson.exports['./mcp']).toBe('./dist/mcp/server.js');
    });

    test('should have TypeScript declaration files', () => {
      expect(packageJson.types || packageJson.typings).toBeDefined();
    });
  });

  describe('Scripts', () => {
    test('should have comprehensive build scripts', () => {
      expect(packageJson.scripts.build).toBeDefined();
      expect(packageJson.scripts['build:watch']).toBeDefined();
      expect(packageJson.scripts.test).toBeDefined();
      expect(packageJson.scripts['test:watch']).toBeDefined();
      expect(packageJson.scripts['test:coverage']).toBeDefined();
    });

    test('should have development scripts', () => {
      expect(packageJson.scripts.dev).toBeDefined();
      expect(packageJson.scripts.lint).toBeDefined();
      expect(packageJson.scripts.format).toBeDefined();
    });

    test('should have CLI and MCP specific scripts', () => {
      expect(packageJson.scripts['start:cli']).toBeDefined();
      expect(packageJson.scripts['start:mcp']).toBeDefined();
      expect(packageJson.scripts['build:cli']).toBeDefined();
      expect(packageJson.scripts['build:mcp']).toBeDefined();
    });
  });

  describe('Dependencies', () => {
    test('should have required runtime dependencies', () => {
      expect(packageJson.dependencies['@kubernetes/client-node']).toBeDefined();
      expect(packageJson.dependencies['commander']).toBeDefined();
      expect(packageJson.dependencies['@anthropic-ai/sdk']).toBeDefined();
    });

    test('should have proper dev dependencies', () => {
      expect(packageJson.devDependencies['@types/jest']).toBeDefined();
      expect(packageJson.devDependencies['@types/node']).toBeDefined();
      expect(packageJson.devDependencies['typescript']).toBeDefined();
      expect(packageJson.devDependencies['jest']).toBeDefined();
      expect(packageJson.devDependencies['ts-jest']).toBeDefined();
    });

    test('should have code quality dependencies', () => {
      expect(packageJson.devDependencies['eslint']).toBeDefined();
      expect(packageJson.devDependencies['prettier']).toBeDefined();
      expect(packageJson.devDependencies['@typescript-eslint/eslint-plugin']).toBeDefined();
      expect(packageJson.devDependencies['@typescript-eslint/parser']).toBeDefined();
    });
  });

  describe('Jest Configuration', () => {
    test('should have comprehensive Jest setup', () => {
      expect(packageJson.jest.preset).toBe('ts-jest');
      expect(packageJson.jest.testEnvironment).toBe('node');
      expect(packageJson.jest.roots).toContain('<rootDir>/src');
      expect(packageJson.jest.roots).toContain('<rootDir>/tests');
    });

    test('should have proper coverage configuration', () => {
      expect(packageJson.jest.collectCoverageFrom).toContain('src/**/*.ts');
      expect(packageJson.jest.coverageDirectory).toBe('coverage');
      expect(packageJson.jest.coverageReporters).toContain('text');
      expect(packageJson.jest.coverageReporters).toContain('lcov');
    });
  });
});

describe('TypeScript Configuration', () => {
  let tsConfig: any;

  beforeAll(() => {
    tsConfig = JSON.parse(fs.readFileSync('tsconfig.json', 'utf8'));
  });

  describe('Compiler Options', () => {
    test('should have strict TypeScript settings', () => {
      expect(tsConfig.compilerOptions.strict).toBe(true);
      expect(tsConfig.compilerOptions.noImplicitAny).toBe(true);
      expect(tsConfig.compilerOptions.strictNullChecks).toBe(true);
      expect(tsConfig.compilerOptions.noImplicitReturns).toBe(true);
    });

    test('should target appropriate JavaScript version', () => {
      expect(tsConfig.compilerOptions.target).toBe('ES2022');
      expect(tsConfig.compilerOptions.lib).toContain('ES2022');
      expect(tsConfig.compilerOptions.module).toBe('commonjs');
    });

    test('should have proper output configuration', () => {
      expect(tsConfig.compilerOptions.outDir).toBe('./dist');
      expect(tsConfig.compilerOptions.rootDir).toBe('./src');
      expect(tsConfig.compilerOptions.declaration).toBe(true);
      expect(tsConfig.compilerOptions.sourceMap).toBe(true);
    });

    test('should support module resolution', () => {
      expect(tsConfig.compilerOptions.moduleResolution).toBe('node');
      expect(tsConfig.compilerOptions.esModuleInterop).toBe(true);
      expect(tsConfig.compilerOptions.resolveJsonModule).toBe(true);
    });
  });

  describe('Path Resolution', () => {
    test('should have proper include/exclude patterns', () => {
      expect(tsConfig.include).toContain('src/**/*');
      expect(tsConfig.exclude).toContain('node_modules');
      expect(tsConfig.exclude).toContain('dist');
      expect(tsConfig.exclude).toContain('**/*.test.ts');
    });

    test('should support path mapping for core modules', () => {
      if (tsConfig.compilerOptions.paths) {
        expect(tsConfig.compilerOptions.paths['@core/*']).toBeDefined();
        expect(tsConfig.compilerOptions.paths['@interfaces/*']).toBeDefined();
      }
    });
  });
});

describe('Build Configuration', () => {
  test('should be able to compile TypeScript successfully', async () => {
    // This test validates that our TypeScript configuration actually works
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);

    try {
      await execAsync('npx tsc --noEmit');
      // If we reach here, TypeScript compilation succeeded
      expect(true).toBe(true);
    } catch (error) {
      // If TypeScript compilation fails, we'll get details in the error
      throw new Error(`TypeScript compilation failed: ${error}`);
    }
  });

  test('should have working linting configuration', async () => {
    // Test that our linting setup works
    expect(fs.existsSync('.eslintrc.js') || fs.existsSync('.eslintrc.json')).toBe(true);
  });

  test('should have working prettier configuration', async () => {
    // Test that prettier is properly configured
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    expect(
      fs.existsSync('.prettierrc') || 
      fs.existsSync('.prettierrc.json') || 
      fs.existsSync('prettier.config.js') ||
      packageJson.prettier
    ).toBe(true);
  });
});

describe('Module Resolution Tests', () => {
  test('should be able to resolve core modules', () => {
    // Test that our module paths will work
    const corePath = path.resolve('src/core');
    const interfacesPath = path.resolve('src/interfaces');
    
    expect(fs.existsSync(corePath)).toBe(true);
    expect(fs.existsSync(interfacesPath)).toBe(true);
  });

  test('should support importing from planned modules', () => {
    // This validates our module structure expectations
    const expectedModules = [
      'src/core/index.ts',
      'src/core/discovery.ts',
      'src/core/memory.ts',
      'src/core/workflow.ts',
      'src/interfaces/cli.ts',
      'src/interfaces/mcp.ts'
    ];

    expectedModules.forEach(modulePath => {
      const dir = path.dirname(modulePath);
      expect(fs.existsSync(dir)).toBe(true);
    });
  });
});
 