// Simple test script for Bedrock Embedding provider

const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from .env file
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
  console.log('Loaded environment variables from .env file');
} else {
  console.warn('No .env file found at', envPath);
}

// Set AWS region to us-west-2 for Bedrock
process.env.AWS_REGION = 'us-west-2';

// Default embedding model
const EMBEDDING_MODEL = process.env.BEDROCK_EMBEDDING_MODEL || 'amazon.titan-embed-text-v1';

class BedrockEmbeddingTester {
  constructor() {
    this.region = process.env.AWS_REGION || 'us-west-2';
    this.model = EMBEDDING_MODEL;
    this.available = false;

    // Initialize client with appropriate authentication
    const clientOptions = {
      region: this.region
    };

    // Check if API key authentication is available
    if (process.env.BEDROCK_API_KEY) {
      clientOptions.apiKey = process.env.BEDROCK_API_KEY;
      this.available = true;
      console.log('Using BEDROCK_API_KEY for authentication');
    } else if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
      // Use AWS credentials
      this.available = true;
      console.log('Using AWS credentials for authentication');
    } else {
      this.available = false;
      console.error('No authentication credentials available');
      return;
    }

    try {
      this.client = new BedrockRuntimeClient(clientOptions);
      this.available = true;
    } catch (error) {
      this.available = false;
      this.client = null;
      console.error('Failed to initialize Bedrock client:', error);
    }
  }

  async testEmbedding() {
    console.log('\nTesting Bedrock Embedding Provider');
    console.log('=================================');
    console.log(`Region: ${this.region}`);
    console.log(`Model: ${this.model}`);

    if (!this.available) {
      console.error('Bedrock embedding provider not available - check credentials');
      return false;
    }

    const text = 'This is a test text for embedding generation with Bedrock';

    try {
      console.log(`\nGenerating embedding for text: "${text}"`);
      const embedding = await this.generateEmbedding(text);

      console.log(`\nSuccess! Generated embedding with ${embedding.length} dimensions`);
      console.log('First 5 values:', embedding.slice(0, 5));
      console.log('Value range check:', this.getEmbeddingStats(embedding));

      return true;
    } catch (error) {
      console.error('Error generating embedding:', error);
      return false;
    }
  }

  getEmbeddingStats(embedding) {
    const min = Math.min(...embedding);
    const max = Math.max(...embedding);
    const avg = embedding.reduce((sum, val) => sum + val, 0) / embedding.length;

    return {
      min: min.toFixed(6),
      max: max.toFixed(6),
      avg: avg.toFixed(6),
      inExpectedRange: min >= -1.1 && max <= 1.1
    };
  }

  async generateEmbedding(text) {
    if (!this.available || !this.client) {
      throw new Error('Bedrock embedding provider not available');
    }

    if (!text || text.trim().length === 0) {
      throw new Error('Text cannot be empty');
    }

    try {
      const provider = this.getModelProvider();
      const requestBody = this.formatRequestForModel(provider, text.trim());

      const command = new InvokeModelCommand({
        modelId: this.model,
        body: JSON.stringify(requestBody)
      });

      const response = await this.client.send(command);
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));

      return this.extractEmbeddingFromResponse(provider, responseBody);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Bedrock embedding failed: ${error.message}`);
      }
      throw new Error(`Bedrock embedding failed: ${String(error)}`);
    }
  }

  getModelProvider() {
    return this.model.split('.')[0];
  }

  formatRequestForModel(provider, text) {
    switch (provider) {
      case 'amazon':
        return {
          inputText: text
        };
      case 'cohere':
        return {
          texts: [text],
          input_type: "search_document"
        };
      default:
        throw new Error(`Unsupported Bedrock embedding model provider: ${provider}`);
    }
  }

  extractEmbeddingFromResponse(provider, response) {
    switch (provider) {
      case 'amazon':
        return response.embedding;
      case 'cohere':
        return response.embeddings[0];
      default:
        throw new Error(`Unsupported Bedrock embedding model provider: ${provider}`);
    }
  }
}

// Run test
async function runTest() {
  console.log('Bedrock Embedding Provider Test');
  console.log('==============================');

  console.log('AWS credentials available:',
    !!process.env.AWS_ACCESS_KEY_ID &&
    !!process.env.AWS_SECRET_ACCESS_KEY);
  console.log('BEDROCK_API_KEY available:', !!process.env.BEDROCK_API_KEY);
  console.log('Using region:', process.env.AWS_REGION);

  const tester = new BedrockEmbeddingTester();
  const success = await tester.testEmbedding();

  if (success) {
    console.log('\n✅ Bedrock embedding provider test successful!');
    return 0;
  } else {
    console.error('\n❌ Bedrock embedding provider test failed!');
    return 1;
  }
}

runTest()
  .then(exitCode => process.exit(exitCode))
  .catch(error => {
    console.error('Unexpected error running test:', error);
    process.exit(1);
  });