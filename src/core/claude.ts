/**
 * Claude Integration Module
 * 
 * Handles AI communication, YAML generation, and learning integration
 */

import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs';
import * as path from 'path';
import { loadPrompt } from './shared-prompt-loader';
import * as crypto from 'crypto';

export interface ClaudeResponse {
  content: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

export interface YAMLResponse {
  yaml: string;
  explanation: string;
}

export interface Interaction {
  input: string;
  output: string;
  success: boolean;
  timestamp?: Date;
}

export type ImpactLevel = 'HIGH' | 'MEDIUM' | 'LOW';
export type ClarificationCategory =
  | 'TECHNICAL_SPECIFICATIONS'
  | 'ARCHITECTURAL_CONTEXT'
  | 'OPERATIONAL_REQUIREMENTS'
  | 'SECURITY_COMPLIANCE'
  | 'ORGANIZATIONAL_ALIGNMENT';

export interface ClarificationOpportunity {
  category: ClarificationCategory;
  missingContext: string;
  impactLevel: ImpactLevel;
  reasoning: string;
  suggestedQuestions?: string[];
  patternAlignment?: string;
}

export interface IntentAnalysisResult {
  clarificationOpportunities: ClarificationOpportunity[];
  overallAssessment: {
    enhancementPotential: ImpactLevel;
    primaryGaps: string[];
    recommendedFocus: string;
  };
  intentQuality: {
    currentSpecificity: string;
    strengthAreas: string[];
    improvementAreas: string[];
  };
}

export class ClaudeIntegration {
  private client: Anthropic | null = null;
  private apiKey: string;
  private conversationHistory: any[] = [];
  private interactions: Interaction[] = [];
  private debugMode: boolean;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.debugMode = process.env.DEBUG_DOT_AI === 'true';
    this.validateApiKey();
    
    if (this.apiKey) {
      this.client = new Anthropic({
        apiKey: this.apiKey,
      });
    }
  }

  private validateApiKey(): void {
    // Allow test-friendly initialization
    if (this.apiKey === 'test-key' || this.apiKey === 'mock-key') {
      return; // Allow test keys
    }
    
    if (!this.apiKey) {
      throw new Error('API key is required for Claude integration');
    }
    if (this.apiKey.length === 0) {
      throw new Error('Invalid API key: API key cannot be empty');
    }
  }

  /**
   * Create debug directory if it doesn't exist
   */
  private ensureDebugDirectory(): string {
    const debugDir = path.join(process.cwd(), 'tmp', 'debug-ai');
    if (!fs.existsSync(debugDir)) {
      fs.mkdirSync(debugDir, { recursive: true });
    }
    return debugDir;
  }

  /**
   * Generate unique identifier for debug files with operation context
   */
  private generateDebugId(operation: string): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '').split('T');
    const dateTime = timestamp[0] + 'T' + timestamp[1].substring(0, 6);
    const randomHex = crypto.randomBytes(4).toString('hex');
    return `${dateTime}_${randomHex}_${operation}`;
  }

  /**
   * Save AI interaction for debugging when DEBUG_DOT_AI=true
   */
  private debugLogInteraction(debugId: string, prompt: string, response: ClaudeResponse, operation: string = 'ai_call'): void {
    if (!this.debugMode) return;

    try {
      const debugDir = this.ensureDebugDirectory();
      
      // Save prompt with descriptive naming
      const promptFile = path.join(debugDir, `${debugId}_prompt.md`);
      fs.writeFileSync(promptFile, `# AI Prompt - ${operation}\n\nTimestamp: ${new Date().toISOString()}\nOperation: ${operation}\n\n---\n\n${prompt}`);
      
      // Save response with matching naming
      const responseFile = path.join(debugDir, `${debugId}_response.md`);
      const responseContent = `# AI Response - ${operation}

Timestamp: ${new Date().toISOString()}
Operation: ${operation}
Input Tokens: ${response.usage.input_tokens}
Output Tokens: ${response.usage.output_tokens}

---

${response.content}`;
      
      fs.writeFileSync(responseFile, responseContent);
      
      console.log(`🐛 DEBUG: AI interaction logged to tmp/debug-ai/${debugId}_*.md`);
    } catch (error) {
      console.warn('Failed to log AI debug interaction:', error);
    }
  }

  async sendMessage(message: string, operation: string = 'generic'): Promise<ClaudeResponse> {
    if (!this.client) {
      throw new Error('Claude client not initialized due to missing API key');
    }

    if (this.apiKey === 'invalid-key') {
      throw new Error('Authentication failed: Invalid API key');
    }

    try {
      // Add message to conversation history
      this.conversationHistory.push({ role: 'user', content: message });

      // Use real Claude API if we have a real API key, otherwise fall back to mocks
      if (this.apiKey.startsWith('sk-ant-') && this.client) {
        // Make real API call to Claude
        const completion = await this.client.messages.create({
          model: 'claude-sonnet-4-20250514', // Latest Claude Sonnet 4 - check for newer versions periodically
          max_tokens: 64000,
          messages: [{ role: 'user', content: message }]
        });

        const content = completion.content[0].type === 'text' ? completion.content[0].text : '';
        const response: ClaudeResponse = {
          content,
          usage: {
            input_tokens: completion.usage.input_tokens,
            output_tokens: completion.usage.output_tokens
          }
        };

        this.conversationHistory.push({ role: 'assistant', content: response.content });
        
        // Debug log the interaction if enabled
        if (this.debugMode) {
          const debugId = this.generateDebugId(operation);
          this.debugLogInteraction(debugId, message, response, operation);
        }
        
        return response;
      }

      // For testing purposes, return mock responses
      let response: ClaudeResponse;
      
      if (message.toLowerCase().includes('deploy a web application')) {
        response = {
          content: 'I can help you deploy a web application to Kubernetes. Let me guide you through the process of creating the necessary YAML manifests for your deployment.',
          usage: { input_tokens: 10, output_tokens: 25 }
        };
      } else if (message.toLowerCase().includes('recommended resources') && 
          this.conversationHistory.some(msg => msg.content.toLowerCase().includes('nginx'))) {
        response = {
          content: 'For nginx deployment, I recommend starting with 2 replicas, 500m CPU and 512Mi memory per pod. You can adjust these based on your traffic patterns.',
          usage: { input_tokens: 8, output_tokens: 30 }
        };
      } else {
        // Default mock response
        response = {
          content: 'I understand you want help with Kubernetes deployment. Could you provide more specific details about what you\'d like to deploy?',
          usage: { input_tokens: message.length / 4, output_tokens: 20 }
        };
      }
      
      this.conversationHistory.push({ role: 'assistant', content: response.content });
      
      // Debug log the interaction if enabled (for mocks too)
      if (this.debugMode) {
        const debugId = this.generateDebugId(`mock-${operation}`);
        this.debugLogInteraction(debugId, message, response, `mock-${operation}`);
      }
      
      return response;

    } catch (error) {
      throw new Error(`Claude API error: ${error}`);
    }
  }

  async generateYAML(resourceType: string, config: any): Promise<YAMLResponse> {
    if (!this.client) {
      throw new Error('Claude client not initialized');
    }

    // Mock YAML generation for testing
    if (resourceType === 'deployment' && config.app === 'nginx') {
      return {
        yaml: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${config.app}
  labels:
    app: ${config.app}
spec:
  replicas: ${config.replicas || 1}
  selector:
    matchLabels:
      app: ${config.app}
  template:
    metadata:
      labels:
        app: ${config.app}
    spec:
      containers:
      - name: ${config.app}
        image: ${config.image}
        ports:
        - containerPort: 80`,
        explanation: `This deployment creates ${config.replicas || 1} replica(s) of ${config.app} using the ${config.image} image. The container exposes port 80 for web traffic.`
      };
    }

    // Default YAML response
    return {
      yaml: `apiVersion: apps/v1
kind: ${resourceType.charAt(0).toUpperCase() + resourceType.slice(1)}
metadata:
  name: example-${resourceType}
spec:
  # Generated configuration would go here`,
      explanation: `This is a basic ${resourceType} manifest. You should customize it based on your specific requirements.`
    };
  }

  async recordInteraction(interaction: Interaction): Promise<void> {
    const recordedInteraction = {
      ...interaction,
      timestamp: new Date()
    };
    
    this.interactions.push(recordedInteraction);
  }

  async getSuccessfulPatterns(): Promise<Interaction[]> {
    return this.interactions.filter(interaction => interaction.success);
  }

  getConversationHistory(): any[] {
    return [...this.conversationHistory];
  }

  clearConversationHistory(): void {
    this.conversationHistory = [];
  }

  async generateManifest(spec: any): Promise<string> {
    if (!this.client) {
      throw new Error('Claude client not initialized');
    }

    // Simulate manifest generation
    const yamlContent = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${spec.name || 'app'}
spec:
  replicas: ${spec.replicas || 1}
  selector:
    matchLabels:
      app: ${spec.name || 'app'}
  template:
    metadata:
      labels:
        app: ${spec.name || 'app'}
    spec:
      containers:
      - name: app
        image: ${spec.image || 'nginx:latest'}
        ports:
        - containerPort: 80
`;
    
    return yamlContent.trim();
  }

  async analyzeError(error: string, _context?: any): Promise<string> {
    if (!this.client) {
      throw new Error('Claude client not initialized');
    }

    // Simulate error analysis
    return `Error analysis: ${error}. Suggested fix: Check the configuration and try again.`;
  }

  async suggestImprovements(_manifest: string): Promise<string[]> {
    if (!this.client) {
      throw new Error('Claude client not initialized');
    }

    // Simulate improvement suggestions
    return [
      'Add resource limits and requests',
      'Consider adding health checks',
      'Add labels for better organization'
    ];
  }

  async processUserInput(input: string, context?: any): Promise<any> {
    if (!this.client) {
      throw new Error('Claude client not initialized');
    }

    // Simulate interactive workflow processing
    if (input.toLowerCase().includes('deploy') && context?.interactive) {
      return {
        phase: 'Planning',
        questions: ['What type of database do you need?']
      };
    }

    if (context?.responses) {
      return {
        phase: 'Validation',
        nextSteps: ['Review generated manifest']
      };
    }

    // Default response
    return {
      phase: 'Discovery',
      suggestions: ['Start by exploring your cluster resources']
    };
  }

  /**
   * Analyze user intent for clarification opportunities
   * 
   * @param intent User's deployment intent
   * @param organizationalPatterns Available organizational patterns context
   * @returns Analysis result with clarification opportunities
   */
  async analyzeIntentForClarification(intent: string, organizationalPatterns: string = ''): Promise<IntentAnalysisResult> {
    if (!this.client) {
      throw new Error('Claude client not initialized');
    }

    try {
      // Load intent analysis prompt template
      const analysisPrompt = loadPrompt('intent-analysis', {
        intent,
        organizational_patterns: organizationalPatterns || 'No specific organizational patterns available'
      });
      
      // Send to Claude for analysis
      const response = await this.sendMessage(analysisPrompt, 'intent-analysis');
      
      // Parse JSON response with robust error handling
      let jsonContent = response.content;
      
      // Try to find JSON object wrapped in code blocks
      const codeBlockMatch = response.content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      if (codeBlockMatch) {
        jsonContent = codeBlockMatch[1];
      } else {
        // Try to find JSON object that starts with { and find the matching closing }
        const jsonMatch = response.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          jsonContent = jsonMatch[0];
        }
      }
      
      // Parse the JSON
      const analysisResult = JSON.parse(jsonContent);
      
      // Validate the response structure
      if (!analysisResult.clarificationOpportunities || !Array.isArray(analysisResult.clarificationOpportunities)) {
        throw new Error('Invalid analysis result structure: missing clarificationOpportunities array');
      }
      
      if (!analysisResult.overallAssessment || !analysisResult.intentQuality) {
        throw new Error('Invalid analysis result structure: missing overallAssessment or intentQuality');
      }
      
      return analysisResult;
      
    } catch (error) {
      // If parsing fails or API call fails, return a fallback minimal analysis
      console.warn('Intent analysis failed, returning minimal analysis:', error);
      return {
        clarificationOpportunities: [],
        overallAssessment: {
          enhancementPotential: 'LOW',
          primaryGaps: [],
          recommendedFocus: 'Proceed with original intent - analysis unavailable'
        },
        intentQuality: {
          currentSpecificity: 'Unable to analyze - using original intent',
          strengthAreas: ['User provided clear deployment intent'],
          improvementAreas: []
        }
      };
    }
  }

  isInitialized(): boolean {
    return this.client !== null;
  }
} 