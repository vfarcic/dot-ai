#!/usr/bin/env node

/**
 * MCP Server Entry Point for DevOps AI Toolkit
 *
 * This server exposes DevOps AI Toolkit functionality through the Model Context Protocol,
 * enabling AI assistants to interact with Kubernetes deployment capabilities.
 */

import { MCPServer } from '../interfaces/mcp.js';
import { DotAI } from '../core/index.js';
import { readFileSync } from 'fs';
import path from 'path';

async function main() {
  try {
    // Validate required environment variables
    process.stderr.write('Validating MCP server configuration...\n');
    
    // Check session directory configuration
    const sessionDir = process.env.DOT_AI_SESSION_DIR || '/app/sessions';
    process.stderr.write(`Using session directory: ${sessionDir}\n`);
    
    if (!process.env.DOT_AI_SESSION_DIR) {
      process.stderr.write('INFO: DOT_AI_SESSION_DIR not set, using default: /app/sessions\n');
      process.stderr.write('For custom session directory, set DOT_AI_SESSION_DIR environment variable\n');
    }
    
    // Validate session directory exists and is writable
    try {
      const fs = await import('fs');
      const path = await import('path');
      
      // Check if directory exists
      if (!fs.existsSync(sessionDir)) {
        process.stderr.write(`FATAL: Session directory does not exist: ${sessionDir}\n`);
        process.stderr.write('Solution: Create the directory or update DOT_AI_SESSION_DIR\n');
        process.exit(1);
      }
      
      // Check if it's actually a directory
      const stat = fs.statSync(sessionDir);
      if (!stat.isDirectory()) {
        process.stderr.write(`FATAL: Session directory path is not a directory: ${sessionDir}\n`);
        process.stderr.write('Solution: Use a valid directory path in DOT_AI_SESSION_DIR\n');
        process.exit(1);
      }
      
      // Test write permissions
      const testFile = path.join(sessionDir, '.mcp-test-write');
      try {
        fs.writeFileSync(testFile, 'test');
        fs.unlinkSync(testFile);
        process.stderr.write(`Session directory validated: ${sessionDir}\n`);
      } catch (writeError) {
        process.stderr.write(`FATAL: Session directory is not writable: ${sessionDir}\n`);
        process.stderr.write('Solution: Fix directory permissions or use a different directory\n');
        process.exit(1);
      }
      
    } catch (error) {
      process.stderr.write(`FATAL: Session directory validation failed: ${error}\n`);
      process.exit(1);
    }

    // Initialize DotAI - it will read KUBECONFIG and AI provider configuration from environment
    const dotAI = new DotAI();

    // Initialize without cluster connection (lazy connection)
    process.stderr.write('Initializing DevOps AI Toolkit...\n');
    try {
      await dotAI.initializeWithoutCluster();
      process.stderr.write('DevOps AI Toolkit initialized successfully\n');
      process.stderr.write('Cluster connectivity will be checked when needed by individual tools\n');
    } catch (initError) {
      process.stderr.write(`FATAL: Failed to initialize DevOps AI Toolkit: ${initError}\n`);
      process.exit(1);
    }

    // Load version dynamically from package.json
    const packageJson = JSON.parse(readFileSync(path.join(__dirname, '../../package.json'), 'utf8'));
    
    // Create and configure MCP server
    const mcpServer = new MCPServer(dotAI, {
      name: 'dot-ai',
      version: packageJson.version,
      description: 'Universal Kubernetes application deployment agent with AI-powered orchestration',
      author: 'Viktor Farcic'
    });

    // Start the MCP server
    const transportType = process.env.TRANSPORT_TYPE || 'stdio';
    process.stderr.write(`Starting DevOps AI Toolkit MCP server with ${transportType} transport...\n`);
    await mcpServer.start();
    process.stderr.write('DevOps AI Toolkit MCP server started successfully\n');

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      process.stderr.write('Shutting down DevOps AI Toolkit MCP server...\n');
      await mcpServer.stop();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      process.stderr.write('Shutting down DevOps AI Toolkit MCP server...\n');
      await mcpServer.stop();
      process.exit(0);
    });

    // Keep the process alive for HTTP transport
    if (transportType === 'http') {
      process.stderr.write('HTTP transport active - server will run until terminated\n');
      // Keep the process running indefinitely for HTTP server
      const keepAlive = () => {
        setTimeout(keepAlive, 24 * 60 * 60 * 1000); // Check every 24 hours
      };
      keepAlive();
    } else {
      process.stderr.write('STDIO transport active - waiting for client connection\n');
    }

  } catch (error) {
    process.stderr.write(`Failed to start DevOps AI Toolkit MCP server: ${error}\n`);
    process.exit(1);
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  process.stderr.write(`Uncaught exception in MCP server: ${error}\n`);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  process.stderr.write(`Unhandled rejection in MCP server: ${reason}\n`);
  process.exit(1);
});

// Start the server
main().catch((error) => {
  process.stderr.write(`Fatal error starting MCP server: ${error}\n`);
  process.exit(1);
});