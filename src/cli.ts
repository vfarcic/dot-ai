#!/usr/bin/env node

import { AppAgent } from './core/index.js';
import { CliInterface } from './interfaces/cli.js';

function isHelpCommand(argv: string[]): boolean {
    return argv.includes('--help') || argv.includes('-h') || 
           argv.includes('help') || argv.length <= 2;
}

async function main() {
    try {
        // Create CLI interface first (without cluster connection)
        const cli = new CliInterface();
        
        // If it's a help command, run immediately without cluster
        if (isHelpCommand(process.argv)) {
            await cli.run(process.argv);
            return;
        }

        // For other commands, initialize cluster connection
        const kubeconfigIndex = process.argv.findIndex(arg => arg === '--kubeconfig');
        const kubeconfigPath = kubeconfigIndex !== -1 && kubeconfigIndex + 1 < process.argv.length 
            ? process.argv[kubeconfigIndex + 1] 
            : undefined;

        const appAgent = new AppAgent({
            kubernetesConfig: kubeconfigPath
        });
        await appAgent.initialize();

        // Set the initialized agent and run the command
        cli.setAppAgent(appAgent);
        await cli.run(process.argv);
    } catch (error) {
        process.stderr.write(`Failed to start App Agent CLI: ${(error as Error).message}\n`);
        
        // Provide troubleshooting guidance for cluster connection issues
        if ((error as Error).message.includes('No active cluster') || 
            (error as Error).message.includes('connection refused') ||
            (error as Error).message.includes('kubeconfig')) {
            process.stderr.write(`\nTroubleshooting steps:\n`);
            process.stderr.write(`- Run 'kubectl cluster-info' to verify cluster connectivity\n`);
            process.stderr.write(`- Check your kubeconfig with 'kubectl config view'\n`);
            process.stderr.write(`- Verify cluster endpoint accessibility\n`);
        }
        
        process.exit(1);
    }
}

main().catch(error => {
    // Use process.stderr.write instead of console.error to avoid ESLint warnings
    process.stderr.write(`Unexpected error: ${error}\n`);
    process.exit(1);
}); 