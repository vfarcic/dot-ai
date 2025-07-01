#!/usr/bin/env node

/**
 * MCP Server Entry Point for App-Agent
 * 
 * This server exposes App-Agent functionality through the Model Context Protocol,
 * enabling AI assistants like Claude Code to interact with Kubernetes deployment capabilities.
 */

import { MCPServer } from '../interfaces/mcp.js';
import { AppAgent } from '../core/index.js';

async function main() {
  try {
    // Validate required environment variables
    process.stderr.write('Validating MCP server configuration...\n');
    
    // Check session directory configuration
    const sessionDir = process.env.APP_AGENT_SESSION_DIR;
    if (!sessionDir) {
      process.stderr.write('FATAL: APP_AGENT_SESSION_DIR environment variable is required\n');
      process.stderr.write('Configuration:\n');
      process.stderr.write('- Set APP_AGENT_SESSION_DIR in .mcp.json env section\n');
      process.stderr.write('- Example: "APP_AGENT_SESSION_DIR": "/tmp/app-agent-sessions"\n');
      process.stderr.write('- Ensure the directory exists and is writable\n');
      process.exit(1);
    }
    
    // Validate session directory exists and is writable
    try {
      const fs = await import('fs');
      const path = await import('path');
      
      // Check if directory exists
      if (!fs.existsSync(sessionDir)) {
        process.stderr.write(`FATAL: Session directory does not exist: ${sessionDir}\n`);
        process.stderr.write('Solution: Create the directory or update APP_AGENT_SESSION_DIR\n');
        process.exit(1);
      }
      
      // Check if it's actually a directory
      const stat = fs.statSync(sessionDir);
      if (!stat.isDirectory()) {
        process.stderr.write(`FATAL: Session directory path is not a directory: ${sessionDir}\n`);
        process.stderr.write('Solution: Use a valid directory path in APP_AGENT_SESSION_DIR\n');
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

    // Initialize AppAgent - it will read KUBECONFIG and ANTHROPIC_API_KEY from environment
    const appAgent = new AppAgent();

    // Test cluster connectivity immediately on startup
    process.stderr.write('Testing cluster connectivity...\n');
    try {
      await appAgent.initialize();
      await appAgent.discovery.connect();
      process.stderr.write('Cluster connectivity verified successfully\n');
    } catch (connectError) {
      process.stderr.write(`FATAL: Failed to connect to Kubernetes cluster: ${connectError}\n`);
      process.stderr.write('Troubleshooting:\n');
      process.stderr.write('- Check KUBECONFIG environment variable\n');
      process.stderr.write('- Verify cluster is running: kubectl cluster-info\n');
      process.stderr.write('- Test kubectl connectivity: kubectl get nodes\n');
      process.exit(1);
    }

    // Create and configure MCP server
    const mcpServer = new MCPServer(appAgent, {
      name: 'app-agent',
      version: '0.1.0',
      description: 'Universal Kubernetes application deployment agent with AI-powered orchestration',
      author: 'Viktor Farcic'
    });

    // Start the MCP server
    process.stderr.write('Starting App-Agent MCP server...\n');
    await mcpServer.start();
    process.stderr.write('App-Agent MCP server started successfully\n');

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      process.stderr.write('Shutting down App-Agent MCP server...\n');
      await mcpServer.stop();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      process.stderr.write('Shutting down App-Agent MCP server...\n');
      await mcpServer.stop();
      process.exit(0);
    });

  } catch (error) {
    process.stderr.write(`Failed to start App-Agent MCP server: ${error}\n`);
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