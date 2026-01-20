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
import { getTelemetry, shutdownTelemetry } from '../core/telemetry/index.js';
import { readFileSync, existsSync } from 'fs';
import path from 'path';

// Track server start time for uptime calculation
const serverStartTime = Date.now();

/**
 * Detect deployment method from environment
 */
function detectDeploymentMethod(): string {
  // Check for Helm deployment (set by Helm chart)
  if (process.env.HELM_RELEASE_NAME || process.env.HELM_CHART_NAME) {
    return 'helm';
  }

  // Check for Kubernetes environment (service account or env vars set by k8s)
  if (process.env.KUBERNETES_SERVICE_HOST || process.env.KUBERNETES_PORT) {
    return 'kubernetes';
  }

  // Check for Docker container (/.dockerenv file exists in containers)
  if (existsSync('/.dockerenv') || process.env.DOCKER_CONTAINER === 'true') {
    return 'docker';
  }

  // Default to local development
  return 'local';
}

/**
 * Get Kubernetes version (non-blocking, returns undefined if unavailable)
 */
async function getK8sVersion(): Promise<string | undefined> {
  try {
    const { KubernetesDiscovery } = await import('../core/discovery.js');
    const discovery = new KubernetesDiscovery({});
    await discovery.connect();
    const result = await discovery.testConnection();
    return result.version;
  } catch {
    // K8s version is optional - don't fail startup
    return undefined;
  }
}

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

    // Track server start telemetry (non-blocking)
    const deploymentMethod = detectDeploymentMethod();
    getK8sVersion().then((k8sVersion) => {
      getTelemetry().trackServerStart(k8sVersion, deploymentMethod);
    }).catch(() => {
      // Telemetry errors are non-fatal - silently ignore
    });

    // Handle graceful shutdown
    const gracefulShutdown = async (signal: string) => {
      process.stderr.write(`Shutting down DevOps AI Toolkit MCP server (${signal})...\n`);

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