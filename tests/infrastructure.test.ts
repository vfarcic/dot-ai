/**
 * Test Infrastructure Validation
 * 
 * These tests ensure our test infrastructure is properly configured
 * and working before we implement any actual functionality.
 */

import { existsSync, readFileSync, mkdirSync } from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';

describe('Test Infrastructure', () => {
  describe('Project Structure', () => {
    test('should have package.json with correct structure', () => {
      const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
      
      expect(packageJson.name).toBe('@vfarcic/dot-ai');
      expect(packageJson.main).toBe('dist/index.js');
      expect(packageJson.bin).toHaveProperty('dot-ai-mcp');
      expect(packageJson.exports['.']).toBeDefined();
      expect(packageJson.exports['./mcp']).toBeDefined();
    });

    test('should have TypeScript configuration', () => {
      const tsConfig = JSON.parse(readFileSync('tsconfig.json', 'utf8'));
      
      expect(tsConfig.compilerOptions.strict).toBe(true);
      expect(tsConfig.compilerOptions.outDir).toBe('./dist');
      expect(tsConfig.compilerOptions.rootDir).toBe('./src');
    });

    test('should have Jest configuration in package.json', () => {
      const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
      
      expect(packageJson.jest).toBeDefined();
      expect(packageJson.jest.preset).toBe('ts-jest');
      expect(packageJson.jest.testEnvironment).toBe('node');
    });
  });

  describe('Directory Structure Expectations', () => {
    test('should be able to create src directory structure', () => {
      // Test that we can create the expected directory structure
      const expectedDirs = [
        'src',
        'src/core',
        'src/interfaces',
        'bin'
      ];

      expectedDirs.forEach(dir => {
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true });
        }
        expect(existsSync(dir)).toBe(true);
      });
    });

    test('should be able to validate expected file locations', () => {
      // Test paths that should exist or be creatable
      const expectedFiles = [
        { path: 'src/index.ts', shouldExist: false }, // Will be created
        { path: 'src/core/index.ts', shouldExist: false }, // Will be created
        { path: 'src/interfaces/cli.ts', shouldExist: false }, // Will be created
        { path: 'src/interfaces/mcp.ts', shouldExist: false }, // Will be created
        { path: 'bin/dot-ai', shouldExist: false } // Will be created
      ];

      expectedFiles.forEach(({ path: filePath, shouldExist }) => {
        if (shouldExist) {
          expect(existsSync(filePath)).toBe(true);
        } else {
          // Test that the directory exists for future file creation
          const dir = path.dirname(filePath);
          expect(existsSync(dir)).toBe(true);
        }
      });
    });
  });

  describe('TypeScript Environment', () => {
    test('should support TypeScript compilation', () => {
      // This test validates that our TypeScript environment is working
      // by using TypeScript features that would fail if not properly configured
      
      interface TestInterface {
        name: string;
        value: number;
      }

      const testObject: TestInterface = {
        name: 'test',
        value: 42
      };

      expect(testObject.name).toBe('test');
      expect(testObject.value).toBe(42);
    });

    test('should support ES2022 features', () => {
      // Test that our target ES2022 is working
      const testArray = [1, 2, 3, 4, 5];
      const result = testArray.at(-1); // ES2022 feature
      
      expect(result).toBe(5);
    });

    test('should support async/await', async () => {
      // Test async support which we'll need for Kubernetes API calls
      const asyncFunction = async (): Promise<string> => {
        return Promise.resolve('async works');
      };

      const result = await asyncFunction();
      expect(result).toBe('async works');
    });
  });

  describe('Test Utilities', () => {
    test('should be able to mock modules', () => {
      // Test that Jest mocking is working
      const mockFunction = jest.fn();
      mockFunction.mockReturnValue('mocked value');
      
      expect(mockFunction()).toBe('mocked value');
      expect(mockFunction).toHaveBeenCalledTimes(1);
    });

    test('should support test environment setup', () => {
      // Test that our test environment variables and setup are working
      expect(process.env.NODE_ENV).toBe('test');
    });
  });
});

describe('Smoke Tests', () => {
  test('Jest is working correctly', () => {
    expect(1 + 1).toBe(2);
  });

  test('TypeScript compilation is working', () => {
    const message: string = 'TypeScript works';
    expect(typeof message).toBe('string');
    expect(message).toBe('TypeScript works');
  });
});

describe('CI/CD Pipeline Infrastructure', () => {
  const rootDir = process.cwd();
  const githubWorkflowsDir = path.join(rootDir, '.github', 'workflows');

  describe('GitHub Actions Configuration', () => {
    test('should have .github/workflows directory', () => {
      expect(existsSync(githubWorkflowsDir)).toBe(true);
    });

    test('should have main CI workflow file', () => {
      const ciWorkflowPath = path.join(githubWorkflowsDir, 'ci.yml');
      expect(existsSync(ciWorkflowPath)).toBe(true);
    });

    test('should have consolidated CI & security workflow', () => {
      const ciWorkflowPath = path.join(githubWorkflowsDir, 'ci.yml');
      expect(existsSync(ciWorkflowPath)).toBe(true);
      
      // Should NOT have separate security.yml (consolidated into ci.yml)
      const securityWorkflowPath = path.join(githubWorkflowsDir, 'security.yml');
      expect(existsSync(securityWorkflowPath)).toBe(false);
    });

    test('should have renovate configuration for dependency management', () => {
      const renovatePath = path.join(rootDir, 'renovate.json');
      expect(existsSync(renovatePath)).toBe(true);
      
      const renovateContent = readFileSync(renovatePath, 'utf-8');
      const renovateConfig = JSON.parse(renovateContent);
      expect(renovateConfig.extends).toContain('config:base');
      expect(renovateConfig.schedule).toBeDefined();
      expect(renovateConfig.packageRules).toBeDefined();
    });
  });

  describe('CI Workflow Validation', () => {
    let ciWorkflow: any;

    beforeAll(() => {
      const ciWorkflowPath = path.join(githubWorkflowsDir, 'ci.yml');
      if (existsSync(ciWorkflowPath)) {
        const content = readFileSync(ciWorkflowPath, 'utf-8');
        ciWorkflow = yaml.parse(content);
      }
    });

    test('should trigger on push and pull request', () => {
      expect(ciWorkflow?.on).toBeDefined();
      expect(ciWorkflow.on.push).toBeDefined();
      expect(ciWorkflow.on.pull_request).toBeDefined();
    });

    test('should have test job with proper Node.js setup', () => {
      expect(ciWorkflow?.jobs?.test).toBeDefined();
      const testJob = ciWorkflow.jobs.test;
      
      expect(testJob['runs-on']).toBe('ubuntu-latest');
      
      // Should use single Node.js 22.x (no matrix for performance)
      expect(testJob.strategy?.matrix).toBeUndefined();
      
      // Should use Node.js 22.x in setup step
      const nodeSetupStep = testJob?.steps?.find((step: any) => step.uses?.includes('actions/setup-node'));
      expect(nodeSetupStep?.with?.['node-version']).toBe('22.x');
    });

    test('should include all required CI steps', () => {
      const testJob = ciWorkflow?.jobs?.test;
      const stepNames = testJob?.steps?.map((step: any) => step.name || step.uses) || [];
      
      expect(stepNames.some((name: string) => name.toLowerCase().includes('checkout'))).toBe(true);
      expect(stepNames.some((name: string) => name.includes('Node.js'))).toBe(true);
      expect(stepNames.some((name: string) => name.toLowerCase().includes('install'))).toBe(true);
      expect(stepNames.some((name: string) => name.toLowerCase().includes('lint'))).toBe(true);
      expect(stepNames.some((name: string) => name.toLowerCase().includes('build'))).toBe(true);
      expect(stepNames.some((name: string) => name.toLowerCase().includes('test'))).toBe(true);
    });

    test('should focus on unit testing without cluster setup', () => {
      const ciContent = readFileSync('.github/workflows/ci.yml', 'utf8');
      const ciWorkflow = yaml.parse(ciContent);
      
      const testJob = ciWorkflow.jobs?.test;
      expect(testJob).toBeDefined();
      
      const stepNames = testJob?.steps?.map((step: any) => step.name || step.uses) || [];
      
      // Should NOT have cluster setup since we use mocked tests
      expect(stepNames.some((name: string) => name.toLowerCase().includes('kind'))).toBe(false);
      expect(stepNames.some((name: string) => name.toLowerCase().includes('cluster'))).toBe(false);
    });

    test('should use npm ci for efficient dependency installation', () => {
      const testJob = ciWorkflow?.jobs?.test;
      const stepCommands = testJob?.steps?.map((step: any) => step.run) || [];
      
      // Should use npm ci (which handles caching automatically)
      expect(stepCommands.some((cmd: string) => cmd?.includes('npm ci'))).toBe(true);
      
      // Should have Node.js cache enabled in setup step
      const nodeSetupStep = testJob?.steps?.find((step: any) => step.uses?.includes('actions/setup-node'));
      expect(nodeSetupStep?.with?.cache).toBe('npm');
    });
  });

  describe('Consolidated Security Features Validation', () => {
    let ciWorkflow: any;

    beforeAll(() => {
      const ciWorkflowPath = path.join(githubWorkflowsDir, 'ci.yml');
      if (existsSync(ciWorkflowPath)) {
        const content = readFileSync(ciWorkflowPath, 'utf-8');
        ciWorkflow = yaml.parse(content);
      }
    });

    test('should have separate security job with dependency audit', () => {
      expect(ciWorkflow?.jobs?.security).toBeDefined();
      const securityJob = ciWorkflow.jobs.security;
      
      const auditStep = securityJob?.steps?.find((step: any) => 
        step.name?.toLowerCase().includes('audit') ||
        step.run?.includes('npm audit')
      );
      expect(auditStep).toBeDefined();
    });

    test('should include CodeQL analysis job', () => {
      expect(ciWorkflow?.jobs?.security).toBeDefined();
      const securityJob = ciWorkflow.jobs.security;
      
      const codeqlInitStep = securityJob?.steps?.find((step: any) => 
        step.uses?.includes('github/codeql-action/init')
      );
      expect(codeqlInitStep).toBeDefined();
      
      const codeqlAnalyzeStep = securityJob?.steps?.find((step: any) => 
        step.uses?.includes('github/codeql-action/analyze')
      );
      expect(codeqlAnalyzeStep).toBeDefined();
    });

    test('should have proper permissions for security scanning and publishing', () => {
      expect(ciWorkflow?.permissions).toBeDefined();
      expect(ciWorkflow.permissions.actions).toBe('read');
      expect(ciWorkflow.permissions.contents).toBe('write'); // Needed for publishing and tagging
      expect(ciWorkflow.permissions['security-events']).toBe('write');
      expect(ciWorkflow.permissions['id-token']).toBe('write'); // Needed for npm publishing
    });
  });

  describe('Renovate Configuration Validation', () => {
    let renovateConfig: any;

    beforeAll(() => {
      const renovatePath = path.join(rootDir, 'renovate.json');
      if (existsSync(renovatePath)) {
        const content = readFileSync(renovatePath, 'utf-8');
        renovateConfig = JSON.parse(content);
      }
    });

    test('should extend base configuration', () => {
      expect(renovateConfig?.extends).toBeDefined();
      expect(renovateConfig.extends).toContain('config:base');
    });

    test('should have scheduled updates', () => {
      expect(renovateConfig?.schedule).toBeDefined();
      expect(Array.isArray(renovateConfig.schedule)).toBe(true);
    });

    test('should have package rules for intelligent grouping', () => {
      expect(renovateConfig?.packageRules).toBeDefined();
      expect(Array.isArray(renovateConfig.packageRules)).toBe(true);
      expect(renovateConfig.packageRules.length).toBeGreaterThan(0);
    });

    test('should configure automerge for safe updates', () => {
      const automergeRule = renovateConfig?.packageRules?.find((rule: any) => 
        rule.automerge === true
      );
      expect(automergeRule).toBeDefined();
    });
  });

  describe('Workflow Security and Best Practices', () => {
    test('workflows should use specific action versions (not @main)', () => {
      const workflowFiles = ['ci.yml', 'security.yml'];
      
      workflowFiles.forEach(file => {
        const workflowPath = path.join(githubWorkflowsDir, file);
        if (existsSync(workflowPath)) {
          const content = readFileSync(workflowPath, 'utf-8');
          const workflow = yaml.parse(content);
          
          // Check all jobs for action versions
          Object.values(workflow.jobs || {}).forEach((job: any) => {
            job.steps?.forEach((step: any) => {
              if (step.uses && !step.uses.includes('@v')) {
                // Allow some exceptions for well-known stable actions
                const allowedMainActions = ['actions/checkout@main'];
                if (!allowedMainActions.includes(step.uses)) {
                  expect(step.uses).toMatch(/@v\d+/);
                }
              }
            });
          });
        }
      });
    });

    test('workflows should use secure action versions', () => {
      const ciWorkflowPath = path.join(githubWorkflowsDir, 'ci.yml');
      if (existsSync(ciWorkflowPath)) {
        const content = readFileSync(ciWorkflowPath, 'utf-8');
        const workflow = yaml.parse(content);
        
        // Simple workflows don't need explicit permissions for basic read/test operations
        // but should use versioned actions for security
        Object.values(workflow.jobs || {}).forEach((job: any) => {
          job.steps?.forEach((step: any) => {
            if (step.uses) {
              expect(step.uses).toMatch(/@v\d+/);
            }
          });
        });
      }
    });
  });

  describe('Package.json CI/CD Integration', () => {
    let packageJson: any;

    beforeAll(() => {
      const packagePath = path.join(rootDir, 'package.json');
      const content = readFileSync(packagePath, 'utf-8');
      packageJson = JSON.parse(content);
    });

    test('should have CI-friendly scripts', () => {
      expect(packageJson.scripts['ci']).toBeDefined();
      expect(packageJson.scripts['ci:test']).toBeDefined();
      expect(packageJson.scripts['ci:build']).toBeDefined();
    });

    test('should have engines field for Node.js version', () => {
      expect(packageJson.engines?.node).toBeDefined();
      expect(packageJson.engines.node).toMatch(/>=\s*18/);
    });

    test('should have repository field for GitHub integration', () => {
      expect(packageJson.repository).toBeDefined();
      expect(typeof packageJson.repository === 'string' || packageJson.repository.type).toBe('git');
    });
  });

  describe('Development Dependencies for CI/CD', () => {
    let packageJson: any;

    beforeAll(() => {
      const packagePath = path.join(rootDir, 'package.json');
      const content = readFileSync(packagePath, 'utf-8');
      packageJson = JSON.parse(content);
    });

    test('should include security scanning tools', () => {
      const allDeps = { ...packageJson.dependencies, ...packageJson.devDependencies };
      // Should have audit tools or rely on npm audit
      expect(packageJson.scripts).toHaveProperty('audit');
    });

    test('should include linting and formatting for CI', () => {
      const devDeps = packageJson.devDependencies || {};
      expect(devDeps.eslint).toBeDefined();
      expect(devDeps.prettier).toBeDefined();
    });
  });
}); 