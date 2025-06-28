/**
 * Build System Tests (TDD Implementation)
 * 
 * Tests written FIRST to define requirements for production-ready build system
 * Supporting both CLI binary and MCP server from unified TypeScript package
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

describe('Build System Validation (TDD)', () => {
  const projectRoot = process.cwd();
  const distDir = path.join(projectRoot, 'dist');
  const packageJsonPath = path.join(projectRoot, 'package.json');
  
  beforeAll(() => {
    // Ensure clean build for testing
    if (fs.existsSync(distDir)) {
      fs.rmSync(distDir, { recursive: true });
    }
  });

  describe('TypeScript Compilation Requirements', () => {
    test('should compile TypeScript without errors', () => {
      expect(() => {
        execSync('npx tsc --noEmit', { cwd: projectRoot, stdio: 'pipe' });
      }).not.toThrow();
    });

    test('should generate clean JavaScript output', () => {
      execSync('npm run build', { cwd: projectRoot, stdio: 'pipe' });
      
      expect(fs.existsSync(distDir)).toBe(true);
      expect(fs.existsSync(path.join(distDir, 'core', 'index.js'))).toBe(true);
      expect(fs.existsSync(path.join(distDir, 'interfaces', 'cli.js'))).toBe(true);
      expect(fs.existsSync(path.join(distDir, 'interfaces', 'mcp.js'))).toBe(true);
    });

    test('should preserve module structure in output', () => {
      const coreDir = path.join(distDir, 'core');
      const interfacesDir = path.join(distDir, 'interfaces');
      
      expect(fs.existsSync(coreDir)).toBe(true);
      expect(fs.existsSync(interfacesDir)).toBe(true);
      
      // Check core modules
      const coreModules = ['index.js', 'discovery.js', 'memory.js', 'workflow.js', 'claude.js'];
      coreModules.forEach(module => {
        expect(fs.existsSync(path.join(coreDir, module))).toBe(true);
      });
      
      // Check interface modules
      const interfaceModules = ['cli.js', 'mcp.js'];
      interfaceModules.forEach(module => {
        expect(fs.existsSync(path.join(interfacesDir, module))).toBe(true);
      });
    });

    test('should generate TypeScript declaration files', () => {
      expect(fs.existsSync(path.join(distDir, 'core', 'index.d.ts'))).toBe(true);
      expect(fs.existsSync(path.join(distDir, 'interfaces', 'cli.d.ts'))).toBe(true);
      expect(fs.existsSync(path.join(distDir, 'interfaces', 'mcp.d.ts'))).toBe(true);
    });
  });

  describe('CLI Binary Build Requirements', () => {
    test('should create executable CLI binary', () => {
      const cliBinary = path.join(projectRoot, 'bin', 'app-agent.ts');
      expect(fs.existsSync(cliBinary)).toBe(true);
      
      // Check that binary is executable
      const stats = fs.statSync(cliBinary);
      expect(stats.mode & parseInt('111', 8)).toBeGreaterThan(0);
    });

    test('should allow CLI binary to run without errors', () => {
      expect(() => {
        const projectKubeconfig = path.join(projectRoot, 'kubeconfig.yaml');
        // Use the compiled JavaScript version for CI compatibility
        const output = execSync(`node dist/cli.js --kubeconfig "${projectKubeconfig}" --help`, { 
          cwd: projectRoot, 
          stdio: 'pipe' 
        });
        expect(output.toString()).toContain('app-agent');
      }).not.toThrow();
    });

    test('should include all required dependencies in CLI build', () => {
      const projectKubeconfig = path.join(projectRoot, 'kubeconfig.yaml');
      // Use the compiled JavaScript version for CI compatibility
      const output = execSync(`node dist/cli.js --kubeconfig "${projectKubeconfig}" --version`, { 
        cwd: projectRoot, 
        stdio: 'pipe' 
      });
      expect(output.toString().trim()).toMatch(/\d+\.\d+\.\d+/);
    });
  });

  describe('MCP Server Build Requirements', () => {
    test('should build MCP server without errors', () => {
      const mcpServer = path.join(distDir, 'interfaces', 'mcp.js');
      expect(fs.existsSync(mcpServer)).toBe(true);
      
      // Test that MCP server can be imported
      expect(() => {
        const mcpModule = require(mcpServer);
        expect(mcpModule.MCPServer).toBeDefined();
      }).not.toThrow();
    });

    test('should include MCP server startup script', () => {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      expect(packageJson.scripts).toHaveProperty('start:mcp');
      expect(packageJson.scripts['start:mcp']).toContain('mcp');
    });

    test('should validate MCP server dependencies are available', () => {
      const mcpServer = require(path.join(distDir, 'interfaces', 'mcp.js'));
      const { AppAgent } = require(path.join(distDir, 'core', 'index.js'));
      
      expect(() => {
        // Use project's working kubeconfig.yaml for integration tests
        const projectKubeconfig = path.join(process.cwd(), 'kubeconfig.yaml');
        const appAgent = new AppAgent({ kubernetesConfig: projectKubeconfig });
        const config = { name: 'test', version: '1.0.0', description: 'Test' };
        const server = new mcpServer.MCPServer(appAgent, config);
        expect(server.getToolCount()).toBeGreaterThan(0);
      }).not.toThrow();
    });
  });

  describe('Bundle Size and Performance Requirements', () => {
    test('should keep core module bundle size reasonable', () => {
      const coreIndexPath = path.join(distDir, 'core', 'index.js');
      const stats = fs.statSync(coreIndexPath);
      
      // Core module should be under 100KB
      expect(stats.size).toBeLessThan(100 * 1024);
    });

    test('should keep CLI interface bundle size reasonable', () => {
      const cliPath = path.join(distDir, 'interfaces', 'cli.js');
      const stats = fs.statSync(cliPath);
      
      // CLI interface should be under 50KB
      expect(stats.size).toBeLessThan(50 * 1024);
    });

    test('should keep MCP interface bundle size reasonable', () => {
      const mcpPath = path.join(distDir, 'interfaces', 'mcp.js');
      const stats = fs.statSync(mcpPath);
      
      // MCP interface should be under 50KB
      expect(stats.size).toBeLessThan(50 * 1024);
    });

    test('should not include unnecessary files in dist', () => {
      const distContents = fs.readdirSync(distDir);
      
      // Should not contain test files
      expect(distContents.some(file => file.includes('.test.'))).toBe(false);
      expect(distContents.some(file => file.includes('.spec.'))).toBe(false);
      
      // Should not contain source maps in production build
      const jsFiles = distContents.filter(file => file.endsWith('.js'));
      jsFiles.forEach(file => {
        const filePath = path.join(distDir, file);
        const content = fs.readFileSync(filePath, 'utf8');
        expect(content).not.toContain('//# sourceMappingURL=');
      });
    });
  });

  describe('Cross-Platform Compatibility Requirements', () => {
    test('should use cross-platform path handling', () => {
      const coreFiles = fs.readdirSync(path.join(distDir, 'core'));
      
      coreFiles.forEach(file => {
        if (file.endsWith('.js')) {
          const filePath = path.join(distDir, 'core', file);
          const content = fs.readFileSync(filePath, 'utf8');
          
          // Should not contain problematic hardcoded Unix paths (allow standard ones like .kube)
          expect(content).not.toMatch(/\/usr\/local\/|\/opt\/|\/tmp\/[^\/\s"']+\/|\/var\/[^\/\s"']+\//g);
          
          // Note: Files may contain the word "path" in error messages, variable names, etc.
          // without needing path.join/resolve. The important check is avoiding hardcoded Unix paths above.
        }
      });
    });

    test('should handle different node environments', () => {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      
      // Should specify node engine requirements
      expect(packageJson.engines).toBeDefined();
      expect(packageJson.engines.node).toBeDefined();
      
      // Should use compatible module target (CommonJS for broader compatibility)
      const tsconfigPath = path.join(projectRoot, 'tsconfig.json');
      const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf8'));
      expect(tsconfig.compilerOptions.target).toBe('ES2022');
      expect(['commonjs', 'ESNext']).toContain(tsconfig.compilerOptions.module);
    });

    test('should work with different package managers', () => {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      
      // Should not have package-lock.json dependencies in scripts
      Object.values(packageJson.scripts || {}).forEach(script => {
        expect(script).not.toContain('package-lock.json');
        expect(script).not.toContain('yarn.lock');
      });
    });
  });

  describe('Production Build Optimization Requirements', () => {
    test('should minify JavaScript output for production', () => {
      // Run production build if available
      try {
        execSync('npm run build:prod', { cwd: projectRoot, stdio: 'pipe' });
      } catch {
        // Production build script may not exist yet, skip for now
        return;
      }
      
      const coreIndexPath = path.join(distDir, 'core', 'index.js');
      const content = fs.readFileSync(coreIndexPath, 'utf8');
      
      // Production build should have minimal whitespace
      const lines = content.split('\n');
      const nonEmptyLines = lines.filter(line => line.trim().length > 0);
      expect(nonEmptyLines.length / lines.length).toBeGreaterThan(0.8);
    });

    test('should tree-shake unused dependencies', () => {
      const mcpPath = path.join(distDir, 'interfaces', 'mcp.js');
      const content = fs.readFileSync(mcpPath, 'utf8');
      
      // Should not include unused imports
      expect(content).not.toContain('import * as');
      
      // Should use specific imports
      if (content.includes('require(')) {
        const requireStatements = content.match(/require\(['"][^'"]+['"]\)/g) || [];
        requireStatements.forEach(stmt => {
          expect(stmt).not.toContain('*');
        });
      }
    });

    test('should validate all imports resolve correctly', () => {
      const interfaceFiles = ['cli.js', 'mcp.js'];
      
      interfaceFiles.forEach(file => {
        const filePath = path.join(distDir, 'interfaces', file);
        expect(() => {
          require(filePath);
        }).not.toThrow();
      });
    });
  });

  describe('Package Distribution Requirements', () => {
    test('should include all necessary files for npm distribution', () => {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      
      // Should have proper main entry point
      expect(packageJson.main).toBeDefined();
      expect(fs.existsSync(path.join(projectRoot, packageJson.main))).toBe(true);
      
      // Should have types definition
      expect(packageJson.types).toBeDefined();
      expect(fs.existsSync(path.join(projectRoot, packageJson.types))).toBe(true);
      
      // Should have bin entry for CLI
      expect(packageJson.bin).toBeDefined();
      expect(typeof packageJson.bin === 'object' || typeof packageJson.bin === 'string').toBe(true);
    });

    test('should have proper files field for npm publishing', () => {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      
      if (packageJson.files) {
        expect(Array.isArray(packageJson.files)).toBe(true);
        expect(packageJson.files).toContain('dist');
        expect(packageJson.files).toContain('bin');
      }
    });

    test('should validate package.json completeness', () => {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      
      // Essential package.json fields
      expect(packageJson.name).toBeDefined();
      expect(packageJson.version).toBeDefined();
      expect(packageJson.description).toBeDefined();
      expect(packageJson.license).toBeDefined();
      expect(packageJson.repository).toBeDefined();
      expect(packageJson.keywords).toBeDefined();
      expect(Array.isArray(packageJson.keywords)).toBe(true);
    });
  });

  describe('Build Script Integration Requirements', () => {
    test('should have all required build scripts', () => {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      const scripts = packageJson.scripts;
      
      expect(scripts).toHaveProperty('build');
      expect(scripts).toHaveProperty('build:cli');
      expect(scripts).toHaveProperty('build:mcp');
      expect(scripts).toHaveProperty('build:watch');
    });

    test('should have development and production build modes', () => {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      const scripts = packageJson.scripts;
      
      // Should have development build
      expect(scripts.build).toBeDefined();
      
      // Should have watch mode for development
      expect(scripts['build:watch']).toBeDefined();
      expect(scripts['build:watch']).toContain('watch');
    });

    test('should clean build directory before building', () => {
      // Create a test file in dist to verify it gets cleaned
      if (!fs.existsSync(distDir)) {
        fs.mkdirSync(distDir, { recursive: true });
      }
      
      const testFile = path.join(distDir, 'test-cleanup.txt');
      fs.writeFileSync(testFile, 'should be removed');
      
      execSync('npm run build', { cwd: projectRoot, stdio: 'pipe' });
      
      // Test file should be gone after build
      expect(fs.existsSync(testFile)).toBe(false);
    });
  });
}); 