import { describe, test, expect } from 'vitest';
import { AIProviderFactory } from '../../../src/core/ai-provider-factory';
import { AIProvider } from '../../../src/core/ai-provider.interface';

// These tests will only run if the proper credentials are configured
describe('Bedrock Provider Integration Tests', () => {
  // Dynamically skip tests if Bedrock provider is not configured
  const isBedrockConfigured = AIProviderFactory.isProviderAvailable('bedrock');

  test.runIf(isBedrockConfigured)('should initialize Bedrock provider', async () => {
    // Arrange
    const bedrockProvider = AIProviderFactory.create({
      provider: 'bedrock',
      apiKey: process.env.BEDROCK_API_KEY || ''
    });

    // Assert
    expect(bedrockProvider).toBeDefined();
    expect(bedrockProvider.getProviderType()).toBe('bedrock');
    expect(bedrockProvider.isInitialized()).toBe(true);
  }, 10000);

  test.runIf(isBedrockConfigured)('should return default model for Bedrock', () => {
    // Arrange
    const bedrockProvider = AIProviderFactory.create({
      provider: 'bedrock',
      apiKey: process.env.BEDROCK_API_KEY || ''
    });

    // Act
    const model = bedrockProvider.getDefaultModel();

    // Assert
    expect(model).toBeDefined();
    expect(model).toContain('anthropic'); // Default model should be an Anthropic model
  });

  test.runIf(isBedrockConfigured)('should send a message to Bedrock', async () => {
    // Arrange
    const bedrockProvider = AIProviderFactory.create({
      provider: 'bedrock',
      apiKey: process.env.BEDROCK_API_KEY || ''
    });

    // Act
    const response = await bedrockProvider.sendMessage(
      'What is Kubernetes? Keep your answer short.',
      'test-bedrock'
    );

    // Assert
    expect(response).toBeDefined();
    expect(response.content).toBeDefined();
    expect(response.content.length).toBeGreaterThan(0);
    expect(response.usage).toBeDefined();
    expect(response.usage.input_tokens).toBeGreaterThan(0);
    expect(response.usage.output_tokens).toBeGreaterThan(0);
  }, 30000); // Longer timeout for API call

  test.runIf(isBedrockConfigured)('should handle API errors gracefully', async () => {
    // Arrange
    const bedrockProvider = AIProviderFactory.create({
      provider: 'bedrock',
      apiKey: process.env.BEDROCK_API_KEY || '',
      model: 'invalid-model-id' // Intentionally invalid model
    });

    // Act & Assert
    await expect(bedrockProvider.sendMessage('This should fail due to invalid model')).rejects.toThrow();
  });

  test.runIf(isBedrockConfigured)('should create Bedrock provider from environment', async () => {
    // Arrange - save current env
    const originalProvider = process.env.AI_PROVIDER;
    const originalModel = process.env.AI_MODEL;

    try {
      // Set environment for Bedrock
      process.env.AI_PROVIDER = 'bedrock';
      process.env.AI_MODEL = process.env.AI_MODEL || 'anthropic.claude-3-sonnet-20240229-v1:0';

      // Act
      const provider = AIProviderFactory.createFromEnv();

      // Assert
      expect(provider).toBeDefined();
      expect(provider.getProviderType()).toBe('bedrock');
      expect(provider.getModelName()).toContain('anthropic');
    } finally {
      // Restore original environment
      process.env.AI_PROVIDER = originalProvider;
      process.env.AI_MODEL = originalModel;
    }
  });
});