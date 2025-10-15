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
    // Initialize AI provider for synthesis analysis (use Claude for comprehensive analysis)
    const aiProvider = new VercelProvider({
      provider: 'anthropic',
      apiKey: process.env.ANTHROPIC_API_KEY!,
      model: getCurrentModel('anthropic'),
      debugMode: process.env.DEBUG_DOT_AI === 'true'
    });
    
    // Initialize synthesizer
    const synthesizer = new PlatformSynthesizer(aiProvider);
    
    // Generate comprehensive platform-wide analysis
    console.log('📊 Generating platform-wide analysis...');
    const markdownReport = await synthesizer.generatePlatformWideAnalysis();
    
    // Save synthesis report
    console.log('\n💾 Saving synthesis report...');
    await synthesizer.saveSynthesisReport(markdownReport);
    
    console.log('\n✅ Platform-wide synthesis complete!');
    console.log('📄 Report saved: ./eval/analysis/platform/synthesis-report.md');
    
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