/**
 * DevOps AI Toolkit Main Entry Point
 * 
 * Universal Kubernetes application deployment agent with dual CLI/MCP interfaces
 */

export * from './core';
export * from './interfaces/cli';

// Version information
export const version = '0.1.0';
export const name = 'dot-ai';

// Default export for convenience
export default {
  version,
  name,
}; 