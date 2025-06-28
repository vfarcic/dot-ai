#!/usr/bin/env node

import { AppAgent } from './core/index.js';
import { CliInterface } from './interfaces/cli.js';

async function main() {
    try {
        // Parse kubeconfig from command line early
        const kubeconfigIndex = process.argv.findIndex(arg => arg === '--kubeconfig');
        const kubeconfigPath = kubeconfigIndex !== -1 && kubeconfigIndex + 1 < process.argv.length 
            ? process.argv[kubeconfigIndex + 1] 
            : undefined;

        // Initialize the App Agent with kubeconfig if provided
        const appAgent = new AppAgent({
            kubernetesConfig: kubeconfigPath
        });
        await appAgent.initialize();

        // Create and run the CLI interface
        const cli = new CliInterface(appAgent);
        
        // Run CLI with full process.argv (commander.js handles parsing)
        await cli.run(process.argv);
    } catch (error) {
        // Use process.stderr.write instead of console.error to avoid ESLint warnings
        process.stderr.write(`Failed to start App Agent CLI: ${(error as Error).message}\n`);
        process.exit(1);
    }
}

main().catch(error => {
    // Use process.stderr.write instead of console.error to avoid ESLint warnings
    process.stderr.write(`Unexpected error: ${error}\n`);
    process.exit(1);
}); 