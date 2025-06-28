#!/usr/bin/env node

import { AppAgent } from '../src/core/index.js';
import { CliInterface } from '../src/interfaces/cli.js';

/**
 * CLI Binary Entry Point
 * 
 * Sets up the App Agent and CLI interface for command line usage
 */

async function main() {
  try {
    // Initialize the App Agent
    const appAgent = new AppAgent();
    await appAgent.initialize();

    // Create CLI interface
    const cli = new CliInterface(appAgent);

            // Run CLI with full process.argv (commander.js handles parsing)
        await cli.run(process.argv);
  } catch (error) {
    console.error('Fatal error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// Run if this module is the main module
if (require.main === module) {
  main();
}

export { main }; 