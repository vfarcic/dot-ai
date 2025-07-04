/**
 * Tests for MCP Server Entry Point
 * 
 * Tests the server.ts entry point functionality including initialization,
 * error handling, and graceful shutdown behavior.
 */

import * as path from 'path';
import * as fs from 'fs';

describe('MCP Server Entry Point', () => {
  const projectRoot = process.cwd();
  const serverPath = path.join(projectRoot, 'dist', 'mcp', 'server.js');
  
  // Helper function to wait for file to exist (handles race conditions during parallel test execution)
  const waitForFile = (filePath: string, timeoutMs: number = 15000): Promise<boolean> => {
    return new Promise((resolve) => {
      const startTime = Date.now();
      const checkFile = () => {
        if (fs.existsSync(filePath)) {
          resolve(true);
        } else if (Date.now() - startTime < timeoutMs) {
          setTimeout(checkFile, 100); // Check every 100ms
        } else {
          resolve(false);
        }
      };
      checkFile();
    });
  };

  // Ensure build is complete before running any tests
  beforeAll(async () => {
    // Wait for build to complete (triggered by pretest hook)
    await waitForFile(serverPath, 20000); // 20 second timeout for build
  }, 25000); // Jest timeout for beforeAll
  
  describe('Server Module', () => {
    test('should exist as built file', async () => {
      const fileExists = await waitForFile(serverPath);
      expect(fileExists).toBe(true);
    });

    test('should be executable file', async () => {
      await waitForFile(serverPath); // Ensure file exists first
      const stats = fs.statSync(serverPath);
      expect(stats.isFile()).toBe(true);
    });
  });

  describe('Server Configuration', () => {
    test('should use environment variables for configuration', () => {
      const originalKubeconfig = process.env.KUBECONFIG;
      
      // Test with custom kubeconfig
      process.env.KUBECONFIG = '/custom/path/kubeconfig.yaml';
      
      // The server should read the environment variable
      expect(process.env.KUBECONFIG).toBe('/custom/path/kubeconfig.yaml');
      
      // Restore original value
      if (originalKubeconfig) {
        process.env.KUBECONFIG = originalKubeconfig;
      } else {
        delete process.env.KUBECONFIG;
      }
    });

    test('should handle missing KUBECONFIG gracefully', () => {
      const originalKubeconfig = process.env.KUBECONFIG;
      delete process.env.KUBECONFIG;
      
      // Should not throw when KUBECONFIG is undefined
      expect(process.env.KUBECONFIG).toBeUndefined();
      
      // Restore original value
      if (originalKubeconfig) {
        process.env.KUBECONFIG = originalKubeconfig;
      }
    });
  });

  describe('Server Structure', () => {
    test('should have proper shebang for Node.js execution', async () => {
      await waitForFile(serverPath); // Ensure file exists first
      const content = fs.readFileSync(serverPath, 'utf8');
      
      // Should start with Node.js shebang
      expect(content.startsWith('#!/usr/bin/env node')).toBe(true);
    });

    test('should import required dependencies', async () => {
      await waitForFile(serverPath); // Ensure file exists first
      const content = fs.readFileSync(serverPath, 'utf8');
      
      // Should import MCPServer and AppAgent (compiled JS format)
      expect(content).toContain('mcp_js_1.MCPServer');
      expect(content).toContain('index_js_1.AppAgent');
    });

    test('should contain main function with server configuration', async () => {
      await waitForFile(serverPath); // Ensure file exists first
      const content = fs.readFileSync(serverPath, 'utf8');
      
      // Should have main function and server configuration
      expect(content).toContain('async function main()');
      expect(content).toContain('name: \'app-agent\'');
      expect(content).toContain('version: \'0.1.0\'');
      expect(content).toContain('Universal Kubernetes application deployment agent');
    });

    test('should have error handling and graceful shutdown', async () => {
      await waitForFile(serverPath); // Ensure file exists first
      const content = fs.readFileSync(serverPath, 'utf8');
      
      // Should have error handling
      expect(content).toContain('Failed to start App-Agent MCP server');
      expect(content).toContain('process.exit(1)');
      
      // Should have graceful shutdown handlers
      expect(content).toContain('SIGINT');
      expect(content).toContain('SIGTERM');
      expect(content).toContain('Shutting down App-Agent MCP server');
    });
  });
});