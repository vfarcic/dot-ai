#!/usr/bin/env node

import { AppAgent } from './core/index.js';
import { CliInterface } from './interfaces/cli.js';

async function main() {
    try {
        // Initialize the App Agent
        const appAgent = new AppAgent();
        await appAgent.initialize();

        // Create and run the CLI interface
        const cli = new CliInterface(appAgent);
        
        // Run CLI with full process.argv (commander.js handles parsing)
        await cli.run(process.argv);
    } catch (error) {
        console.error('Failed to start App Agent CLI:', (error as Error).message);
        process.exit(1);
    }
}

main().catch(error => {
    console.error('Unexpected error:', error);
    process.exit(1);
}); 