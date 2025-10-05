/**
 * Resource Capability Discovery & Inference Engine
 * 
 * PRD #48: Resource Capabilities Discovery & Integration
 * 
 * This module provides capability inference for Kubernetes resources through
 * AI-powered analysis of schemas and metadata.
 */

import { Logger } from './error-handling';
import { AIProvider } from './ai-provider.interface';
import { loadPrompt } from './shared-prompt-loader';


/**
 * Complete resource capability data structure for Vector DB storage
 */
export interface ResourceCapability {
  // Resource identification
  resourceName: string;      // "resourcegroups.azure.upbound.io"
  
  // Capability information (AI-inferred)
  capabilities: string[];    // ["postgresql", "mysql", "database", "multi-cloud"]
  providers: string[];       // ["azure", "gcp", "aws"] 
  abstractions: string[];    // ["high-availability", "persistent-storage", "backup"]
  complexity: 'low' | 'medium' | 'high';  // User experience complexity
  
  // Metadata for AI understanding
  description: string;       // "Managed database solution supporting multiple engines"
  useCase: string;          // "Simple database deployment without infrastructure complexity"
  
  // Vector embedding for semantic search (generated separately)
  embedding?: number[];      // Generated from capability description
  
  // Analysis metadata
  analyzedAt: string;        // ISO timestamp
  confidence: number;        // 0-1 AI confidence score
}

/**
 * Generic Capability Inference Engine
 * 
 * Analyzes any Kubernetes CRD using AI to extract semantic capabilities
 * for improved AI recommendations and resource matching.
 */
export class CapabilityInferenceEngine {
  private logger: Logger;
  private aiProvider: AIProvider;

  constructor(aiProvider: AIProvider, logger: Logger) {
    this.aiProvider = aiProvider;
    this.logger = logger;
  }

  /**
   * Main entry point: analyze resource to infer complete capabilities
   * 
   * @param resourceName - Full resource name (e.g., "resourcegroups.azure.upbound.io")
   * @throws Error if capability inference fails for any reason
   */
  async inferCapabilities(
    resourceName: string,
    resourceDefinition?: string
  ): Promise<ResourceCapability> {
    const requestId = `capability-inference-${Date.now()}`;
    
    this.logger.info('Starting capability inference', {
      requestId,
      resource: resourceName,
      hasDefinition: !!resourceDefinition
    });

    // Use AI to analyze all available information
    const aiResult = await this.inferWithAI(resourceName, resourceDefinition, requestId);

    // Convert AI result to final capability structure
    const finalCapability = this.buildResourceCapability(resourceName, aiResult);

    this.logger.info('Capability inference completed', {
      requestId,
      resource: resourceName,
      capabilitiesFound: finalCapability.capabilities.length,
      providersFound: finalCapability.providers.length,
      complexity: finalCapability.complexity,
      confidence: finalCapability.confidence
    });

    return finalCapability;
  }

  /**
   * Use AI to infer capabilities from all available resource context
   * 
   * @throws Error if AI inference fails
   */
  private async inferWithAI(
    resourceName: string,
    resourceDefinition?: string,
    requestId?: string
  ): Promise<{
    capabilities: string[];
    providers: string[];
    abstractions: string[];
    complexity: 'low' | 'medium' | 'high';
    description: string;
    useCase: string;
    confidence: number;
  }> {
    try {
      const prompt = await this.buildInferencePrompt(resourceName, resourceDefinition);
      const response = await this.aiProvider.sendMessage(prompt);
      return this.parseCapabilitiesFromAI(response.content);
    } catch (error) {
      this.logger.error('AI capability inference failed', error as Error, {
        requestId,
        resource: resourceName
      });
      throw error; // Re-throw to maintain fail-fast behavior
    }
  }

  /**
   * Build AI inference prompt using standard prompt loading pattern
   * 
   * @throws Error if prompt template cannot be loaded
   */
  private async buildInferencePrompt(
    resourceName: string,
    resourceDefinition?: string
  ): Promise<string> {
    // Load prompt template using shared prompt loader
    const finalPrompt = loadPrompt('capability-inference', {
      resourceName,
      resourceDefinition: resourceDefinition || 'No resource definition provided'
    });

    return finalPrompt;
  }

  /**
   * Parse AI response into structured capability data
   * 
   * @throws Error if AI response cannot be parsed or is invalid
   */
  private parseCapabilitiesFromAI(response: string): {
    capabilities: string[];
    providers: string[];
    abstractions: string[];
    complexity: 'low' | 'medium' | 'high';
    description: string;
    useCase: string;
    confidence: number;
  } {
    // Look for JSON in the response using standard pattern
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error(`No JSON found in AI response. Response: ${response.substring(0, 200)}...`);
    }

    let parsed: any;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      throw new Error(`Invalid JSON in AI response: ${parseError instanceof Error ? parseError.message : String(parseError)}. JSON: ${jsonMatch[0].substring(0, 200)}...`);
    }

    // Validate required fields with detailed error messages
    if (!Array.isArray(parsed.capabilities)) {
      throw new Error(`AI response missing or invalid capabilities array. Got: ${typeof parsed.capabilities}`);
    }
    if (!Array.isArray(parsed.providers)) {
      throw new Error(`AI response missing or invalid providers array. Got: ${typeof parsed.providers}`);
    }
    if (!Array.isArray(parsed.abstractions)) {
      throw new Error(`AI response missing or invalid abstractions array. Got: ${typeof parsed.abstractions}`);
    }
    if (!['low', 'medium', 'high'].includes(parsed.complexity)) {
      throw new Error(`AI response invalid complexity: ${parsed.complexity}. Must be low, medium, or high`);
    }
    if (typeof parsed.description !== 'string' || parsed.description.trim() === '') {
      throw new Error(`AI response missing or invalid description. Got: ${typeof parsed.description}`);
    }
    if (typeof parsed.useCase !== 'string' || parsed.useCase.trim() === '') {
      throw new Error(`AI response missing or invalid useCase. Got: ${typeof parsed.useCase}`);
    }
    if (typeof parsed.confidence !== 'number' || parsed.confidence < 0 || parsed.confidence > 1) {
      throw new Error(`AI response invalid confidence score: ${parsed.confidence}. Must be number between 0-1`);
    }

    return {
      capabilities: parsed.capabilities,
      providers: parsed.providers,
      abstractions: parsed.abstractions,
      complexity: parsed.complexity,
      description: parsed.description.trim(),
      useCase: parsed.useCase.trim(),
      confidence: parsed.confidence
    };
  }

  /**
   * Build final ResourceCapability from AI analysis result
   */
  private buildResourceCapability(
    resourceName: string,
    aiResult: {
      capabilities: string[];
      providers: string[];
      abstractions: string[];
      complexity: 'low' | 'medium' | 'high';
      description: string;
      useCase: string;
      confidence: number;
    }
  ): ResourceCapability {
    return {
      resourceName,
      capabilities: aiResult.capabilities,
      providers: aiResult.providers,
      abstractions: aiResult.abstractions,
      complexity: aiResult.complexity,
      description: aiResult.description,
      useCase: aiResult.useCase,
      confidence: aiResult.confidence,
      analyzedAt: new Date().toISOString()
    };
  }

  /**
   * Generate Vector DB ID for capability storage
   * Creates deterministic UUID from resource name for Qdrant compatibility
   */
  static generateCapabilityId(resourceName: string): string {
    // Create deterministic UUID from resource name hash
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256').update(`capability-${resourceName}`).digest('hex');
    
    // Convert to UUID format: 8-4-4-4-12
    return `${hash.substring(0,8)}-${hash.substring(8,12)}-${hash.substring(12,16)}-${hash.substring(16,20)}-${hash.substring(20,32)}`;
  }
}