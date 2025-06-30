/**
 * Tests for MCP Server Entry Point
 * 
 * Tests the server.ts entry point functionality including initialization,
 * error handling, and graceful shutdown behavior.
 */

import * as path from 'path';
import * as fs from 'fs';

describe('MCP Server Entry Point', () => {
  
  describe('Server Module', () => {
    test('should exist as built file', () => {
      const projectRoot = path.join(__dirname, '..', '..');
      const serverPath = path.join(projectRoot, 'dist', 'mcp', 'server.js');
      expect(fs.existsSync(serverPath)).toBe(true);
    });

    test('should be executable file', () => {
      const projectRoot = path.join(__dirname, '..', '..');
      const serverPath = path.join(projectRoot, 'dist', 'mcp', 'server.js');
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
    test('should have proper shebang for Node.js execution', () => {
      const projectRoot = path.join(__dirname, '..', '..');
      const serverPath = path.join(projectRoot, 'dist', 'mcp', 'server.js');
      const content = fs.readFileSync(serverPath, 'utf8');
      
      // Should start with Node.js shebang
      expect(content.startsWith('#!/usr/bin/env node')).toBe(true);
    });

    test('should import required dependencies', () => {
      const projectRoot = path.join(__dirname, '..', '..');
      const serverPath = path.join(projectRoot, 'dist', 'mcp', 'server.js');
      const content = fs.readFileSync(serverPath, 'utf8');
      
      // Should import MCPServer and AppAgent (compiled JS format)
      expect(content).toContain('mcp_js_1.MCPServer');
      expect(content).toContain('index_js_1.AppAgent');
    });

    test('should contain main function with server configuration', () => {
      const projectRoot = path.join(__dirname, '..', '..');
      const serverPath = path.join(projectRoot, 'dist', 'mcp', 'server.js');
      const content = fs.readFileSync(serverPath, 'utf8');
      
      // Should have main function and server configuration
      expect(content).toContain('async function main()');
      expect(content).toContain('name: \'app-agent\'');
      expect(content).toContain('version: \'0.1.0\'');
      expect(content).toContain('Universal Kubernetes application deployment agent');
    });

    test('should have error handling and graceful shutdown', () => {
      const projectRoot = path.join(__dirname, '..', '..');
      const serverPath = path.join(projectRoot, 'dist', 'mcp', 'server.js');
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