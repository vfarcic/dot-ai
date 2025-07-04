#!/usr/bin/env node

import { DotAI } from '../dist/core/index.js';
import { CliInterface } from '../dist/interfaces/cli.js';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * CLI Binary Entry Point
 * 
 * Sets up the DevOps AI Toolkit and CLI interface for command line usage
 */

async function main() {
  try {
    // Parse kubeconfig option early for DotAI initialization
    const kubeconfigIndex = process.argv.indexOf('--kubeconfig');
    let kubeconfigPath: string | undefined;
    
    if (kubeconfigIndex !== -1 && kubeconfigIndex + 1 < process.argv.length) {
      kubeconfigPath = process.argv[kubeconfigIndex + 1];
    }

    // Initialize the DevOps AI Toolkit with kubeconfig if provided
    const dotAI = new DotAI(kubeconfigPath ? { kubernetesConfig: kubeconfigPath } : {});
    await dotAI.initialize();

    // Create CLI interface
    const cli = new CliInterface(dotAI);

    // Run CLI with full process.argv (commander.js handles parsing)
    await cli.run(process.argv);
  } catch (error) {
    console.error('Fatal error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// Run if this module is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { main }; 