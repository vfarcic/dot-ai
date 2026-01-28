#!/usr/bin/env node

/**
 * MCP Server Entry Point for DevOps AI Toolkit
 *
 * This server exposes DevOps AI Toolkit functionality through the Model Context Protocol,
 * enabling AI assistants to interact with Kubernetes deployment capabilities.
 */

import { MCPServer } from '../interfaces/mcp.js';
import { DotAI } from '../core/index.js';
import { getTracer, shutdownTracer } from '../core/tracing/index.js';
import { getTelemetry, shutdownTelemetry, setTelemetryPluginManager } from '../core/telemetry/index.js';
import { readFileSync } from 'fs';
import path from 'path';
import { PluginManager } from '../core/plugin-manager.js';
import { ConsoleLogger } from '../core/error-handling.js';

// Track server start time for uptime calculation
const serverStartTime = Date.now();

/**
 * Get Kubernetes version (non-blocking, returns undefined if unavailable)
 */

async function main() {
  try {
    // Initialize OpenTelemetry tracing (must happen before HTTP server starts)
    const tracer = getTracer();
    if (tracer.isEnabled()) {
      process.stderr.write('OpenTelemetry tracing enabled\n');
      // Force initialization now to enable auto-instrumentation
      tracer.initialize();
    }

    // Validate required environment variables
    process.stderr.write('Validating MCP server configuration...\n');

    // Check session directory configuration
    const sessionDir = process.env.DOT_AI_SESSION_DIR || './tmp/sessions';
    process.stderr.write(`Using session directory: ${sessionDir}\n`);

    if (!process.env.DOT_AI_SESSION_DIR) {
      process.stderr.write('INFO: DOT_AI_SESSION_DIR not set, using default: ./tmp/sessions\n');
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

    // Initialize plugin discovery (PRD #343)
    const pluginLogger = new ConsoleLogger('PluginManager');
    const pluginManager = new PluginManager(pluginLogger);
    const pluginConfigs = PluginManager.parsePluginConfig();

    if (pluginConfigs.length > 0) {
      process.stderr.write(`Discovering ${pluginConfigs.length} plugin(s)...\n`);
      try {
        await pluginManager.discoverPlugins(pluginConfigs);
        const stats = pluginManager.getStats();
        const pending = pluginManager.getPendingPlugins();
        process.stderr.write(`Plugin discovery complete: ${stats.pluginCount} plugin(s), ${stats.toolCount} tool(s)\n`);
        if (pending.length > 0) {
          process.stderr.write(`Plugins pending background discovery: ${pending.join(', ')}\n`);
        }
      } catch (error) {
        // Non-required plugin failures are warnings, required failures throw
        if (error instanceof Error && error.name === 'PluginDiscoveryError') {
          process.stderr.write(`FATAL: Required plugin discovery failed: ${error.message}\n`);
          process.exit(1);
        }
        process.stderr.write(`Plugin discovery warning: ${error}\n`);
      }

      // Start background discovery for any plugins that failed initial discovery
      // They will be retried every 30 seconds for up to 10 minutes
      if (pluginManager.getPendingPlugins().length > 0) {
        pluginManager.setOnPluginDiscovered((plugin) => {
          process.stderr.write(`Background discovery: Plugin '${plugin.name}' now available with ${plugin.tools.length} tool(s)\n`);
          // Note: Tools are automatically registered via pluginManager's internal maps
          // The version tool will reflect the updated plugin status
        });
        pluginManager.startBackgroundDiscovery();
      }
    } else {
      process.stderr.write('No plugins configured (mount plugins.json at /etc/dot-ai/plugins.json to enable)\n');
    }

    // PRD #343: Set plugin manager for telemetry before first use
    // This enables cluster ID generation via plugin instead of direct K8s client
    if (pluginConfigs.length > 0) {
      setTelemetryPluginManager(pluginManager);
    }

    // Create and configure MCP server
    const mcpServer = new MCPServer(dotAI, {
      name: 'dot-ai',
      version: packageJson.version,
      description: 'Universal Kubernetes application deployment agent with AI-powered orchestration',
      author: 'Viktor Farcic',
      pluginManager: pluginConfigs.length > 0 ? pluginManager : undefined
    });

    // Start the MCP server (HTTP transport only)
    process.stderr.write('Starting DevOps AI Toolkit MCP server...\n');
    await mcpServer.start();
    process.stderr.write('DevOps AI Toolkit MCP server started successfully\n');

    // Track server start telemetry (non-blocking)
    // PRD #343: K8s version obtained via plugin at runtime, not at startup
    // PRD #345: Deployment method tracking removed (Kubernetes-only)
    getTelemetry().trackServerStart();

    // Handle graceful shutdown
    const gracefulShutdown = async (signal: string) => {
      process.stderr.write(`Shutting down DevOps AI Toolkit MCP server (${signal})...\n`);

      // Stop background plugin discovery if active
      pluginManager.stopBackgroundDiscovery();

      // Track server stop telemetry
      const uptimeSeconds = Math.floor((Date.now() - serverStartTime) / 1000);
      getTelemetry().trackServerStop(uptimeSeconds);

      await mcpServer.stop();
      await shutdownTracer();

      // Flush telemetry events before exit
      await shutdownTelemetry();

      process.exit(0);
    };

    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

    // HTTP server keeps the process alive
    process.stderr.write('HTTP server active - server will run until terminated\n');

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
