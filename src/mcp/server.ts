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
    // Initialize AppAgent - it will read KUBECONFIG and ANTHROPIC_API_KEY from environment
    const appAgent = new AppAgent();

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