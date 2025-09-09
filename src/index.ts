/**
 * DevOps AI Toolkit Main Entry Point
 * 
 * Universal Kubernetes application deployment agent with MCP interface
 */

export * from './core';

// Version information - loaded dynamically from package.json
import { readFileSync } from 'fs';
import { join } from 'path';

const packageJson = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8'));
export const version = packageJson.version;
export const name = packageJson.name.replace('@vfarcic/', '');

// Default export for convenience
export default {
  version,
  name,
}; 