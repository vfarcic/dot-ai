#!/usr/bin/env node

/**
 * Platform-Wide AI Model Synthesis Runner
 *
 * Executes comprehensive cross-tool analysis using all individual evaluation reports
 * Generates platform-wide insights, decision matrices, and usage recommendations
 */

import { PlatformSynthesizer } from './platform-synthesizer.js';
import { VercelProvider } from '../core/providers/vercel-provider.js';
import { getCurrentModel } from '../core/model-config.js';

async function runPlatformSynthesis() {
  console.log('🚀 Starting Platform-Wide AI Model Synthesis...\n');

  try {
    // Parse command line arguments for graph filtering
    const args = process.argv.slice(2);
    let graphsToGenerate: string[] | undefined;
    let skipReport = false;

    if (args.length > 0) {
      const graphArg = args.find(arg => arg.startsWith('--graphs='));
      if (graphArg) {
        graphsToGenerate = graphArg.split('=')[1].split(',');
        console.log(
          `📊 Generating specific graphs: ${graphsToGenerate.join(', ')}\n`
        );
      }

      skipReport = args.includes('--skip-report');
      if (skipReport) {
        console.log('⏭️  Skipping AI report generation (graphs only)\n');
      }
    }

    // Initialize AI provider for synthesis analysis (use Claude for comprehensive analysis)
    const aiProvider = new VercelProvider({
      provider: 'anthropic',
      apiKey: process.env.ANTHROPIC_API_KEY!,
      model: getCurrentModel('anthropic'),
      debugMode: process.env.DEBUG_DOT_AI === 'true',
    });

    // Initialize synthesizer
    const synthesizer = new PlatformSynthesizer(aiProvider);

    // Generate comprehensive platform-wide analysis (or just graphs if skip-report is set)
    console.log('📊 Generating platform-wide analysis...');
    const markdownReport = await synthesizer.generatePlatformWideAnalysis(
      graphsToGenerate,
      skipReport
    );

    // Save synthesis report only if we generated it
    if (!skipReport) {
      console.log('\n💾 Saving synthesis report...');
      await synthesizer.saveSynthesisReport(markdownReport);
    }

    console.log('\n✅ Platform-wide synthesis complete!');
    console.log(
      '📄 Report saved: ./eval/analysis/platform/synthesis-report.md'
    );

    console.log('\n✨ AI-generated comprehensive report includes:');
    console.log('   • Detailed model profiles with strengths/weaknesses');
    console.log('   • Production recommendations by priority');
    console.log('   • Cross-tool performance insights');
    console.log('   • Critical warnings and actionable guidance');
  } catch (error) {
    console.error('❌ Platform synthesis failed:', error);
    process.exit(1);
  }
}

// Run synthesis
runPlatformSynthesis();
