# Amazon Bedrock Integration Guide

This guide explains how to use Amazon Bedrock integration with the DevOps AI Toolkit.

## Implementation Overview

The DevOps AI Toolkit now supports Amazon Bedrock as an AI provider, enabling you to leverage AWS's foundation models for your AI operations.

### Key Features

- Support for both Bedrock API Keys and AWS IAM credentials
- Compatible with multiple model families (Anthropic, Amazon, Meta, etc.)
- Tool calling support for Anthropic models on Bedrock
- Bedrock embedding provider for vector-based semantic search
- Seamless integration with existing provider architecture

## Authentication Options

The implementation supports two authentication methods:

### 1. Bedrock API Key (Recommended)

```bash
export BEDROCK_API_KEY=your_bedrock_api_key
export AWS_REGION=us-west-2
export AI_PROVIDER=bedrock
```

API keys are easier to manage and can be limited in scope. You can create them in the AWS Management Console under "Amazon Bedrock > API keys" as detailed in [the API key documentation](https://docs.aws.amazon.com/bedrock/latest/userguide/api-keys.html).

### 2. AWS Credentials

```bash
export AWS_ACCESS_KEY_ID=your_aws_access_key
export AWS_SECRET_ACCESS_KEY=your_aws_secret_key
export AWS_REGION=us-west-2
export AI_PROVIDER=bedrock
```

AWS credentials provide full access to your AWS account based on your IAM permissions.

## Model Selection

You can specify which Bedrock model to use:

```bash
export AI_MODEL=anthropic.claude-3-opus-20240229-v1:0
```

If not specified, the default model will be `anthropic.claude-3-sonnet-20240229-v1:0`.

### Embedding Model Selection

You can now specify which Bedrock embedding model to use for vector search operations:

```bash
export EMBEDDINGS_PROVIDER=bedrock
export BEDROCK_EMBEDDING_MODEL=amazon.titan-embed-text-v1
```

If not specified, the default embedding model will be `amazon.titan-embed-text-v1`.

## Supported Model Families

The implementation supports different model families available on Bedrock:

- Anthropic models (`anthropic.*`)
- Amazon models (`amazon.*`)
- Meta models (`meta.*`)
- Cohere models (`cohere.*`)
- AI21 models (`ai21.*`)
- Mistral models (`mistral.*`)

Each model family uses its specific request/response format, automatically handled by the provider.

## Testing

### Integration Tests

To run integration tests specifically for Bedrock:

```bash
npm run test:integration:bedrock
```

The tests will automatically skip if no Bedrock credentials are configured.

### Standalone Testing

A standalone test script is provided to verify Bedrock API connectivity without requiring the full integration test environment:

```bash
# Run the standalone test
export BEDROCK_API_KEY=your_bedrock_api_key
export AWS_REGION=us-west-2
node test-bedrock-provider.js
```

This script will connect to Bedrock and run a simple query to verify that authentication and API communication work correctly.

## Implementation Details

### Files Added/Modified

1. **Created `/src/core/providers/bedrock-provider.ts`**:
   - Implemented the `AIProvider` interface for Bedrock
   - Added support for both API key and AWS credential authentication
   - Implemented model-specific request formatting for different Bedrock models
   - Added support for tool calling with Anthropic models on Bedrock

2. **Updated `/src/core/embedding-service.ts`**:
   - Added `BedrockEmbeddingProvider` class implementing the `EmbeddingProvider` interface
   - Implemented support for Amazon Titan and Cohere embedding models
   - Added support for both API key and AWS credential authentication
   - Updated `createEmbeddingProvider` function to handle Bedrock case
   - Updated `EmbeddingConfig` interface to include 'bedrock' option
   - Updated `getStatus` method to recognize the Bedrock embedding provider

3. **Updated `/src/core/model-config.ts`**:
   - Added default Bedrock model to `CURRENT_MODELS`
   - Added `bedrock_embedding` model to `CURRENT_MODELS`

3. **Updated `/src/core/ai-provider-factory.ts`**:
   - Added Bedrock to `PROVIDER_ENV_KEYS` with `BEDROCK_API_KEY` mapping
   - Updated `isProviderAvailable` to check for both API key and AWS credentials
   - Added `createBedrockProvider` method
   - Updated the `create` method to handle Bedrock provider

4. **Updated Docker Configuration**:
   - Modified `docker-compose-dot-ai.yaml` to support Bedrock
   - Added environment variables for Bedrock configuration
   - Set up to use a custom Docker image with Bedrock support

5. **Updated Documentation**:
   - Added Bedrock instructions to `docs/quick-start.md`
   - Updated AI provider configuration in `docs/mcp-setup.md`
   - Enhanced Docker setup guide in `docs/setup/docker-setup.md`

6. **Added AWS Bedrock SDK Dependency**:
   - Added `@aws-sdk/client-bedrock-runtime` to package.json

7. **Created Test Files**:
   - Added `test-bedrock-provider.js` for standalone testing
   - Added `tests/integration/core/bedrock-provider.test.ts` for integration testing

### Code Considerations

The implementation includes several careful code considerations:

1. **TypeScript Compatibility**:
   - Proper token usage tracking with all required fields
   - Correct type definitions for the Bedrock provider
   - Proper error handling and response typing
   - Fully typed embedding model responses and requests

2. **ESLint Compliance**:
   - Fixed issues with unused imports
   - Addressed double negation issues
   - Properly handled unused variables

3. **Tool Loop Format**:
   - Implements the proper format for tool calling with Anthropic models on Bedrock
   - Correctly serializes tool results for message history

4. **Vector Embeddings**:
   - Correctly formats provider-specific embedding requests
   - Handles different embedding model response formats
   - Properly extracts embedding arrays from responses
   - Compatible with Qdrant vector database

## Getting Started

### Docker Compose Setup (Recommended)

1. Download the Docker Compose file:
   ```bash
   curl -o docker-compose-dot-ai.yaml https://raw.githubusercontent.com/vfarcic/dot-ai/main/docker-compose-dot-ai.yaml
   ```

2. Set environment variables:
   ```bash
   # Configure Bedrock
   export AI_PROVIDER=bedrock
   export BEDROCK_API_KEY=your_bedrock_api_key_here
   export AWS_REGION=us-west-2

   # Optional: Specify model
   export AI_MODEL=anthropic.claude-3-sonnet-20240229-v1:0

   # Required for vector embeddings
   export OPENAI_API_KEY=your_openai_api_key_here

   # Use the image with Bedrock support
   export DOT_AI_IMAGE=jicowan/dot-ai:bedrock
   ```

3. Create MCP configuration:
   ```bash
   cat > .mcp.json << 'EOF'
   {
     "mcpServers": {
       "dot-ai": {
         "command": "docker",
         "args": [
           "compose",
           "-f",
           "docker-compose-dot-ai.yaml",
           "--env-file",
           ".env",
           "run",
           "--rm",
           "--remove-orphans",
           "dot-ai"
         ]
       }
     }
   }
   EOF
   ```

4. Start your MCP client (e.g., Claude Code) - all AI operations will now use Amazon Bedrock

### Manual Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Configure authentication (either API key or AWS credentials)

3. Set environment variables:
   ```bash
   export AI_PROVIDER=bedrock
   export BEDROCK_API_KEY=your_bedrock_api_key_here
   export AWS_REGION=us-west-2
   ```

4. Run the application as normal - all AI operations will now use Amazon Bedrock

## Examples

### Using the BedrockProvider programmatically:

```typescript
import { AIProviderFactory } from './src/core/ai-provider-factory';

// Create provider from environment variables
const provider = AIProviderFactory.createFromEnv();

// Or create explicitly
const bedrockProvider = AIProviderFactory.create({
  provider: 'bedrock',
  apiKey: process.env.BEDROCK_API_KEY || '',
  model: 'anthropic.claude-3-sonnet-20240229-v1:0' // optional
});

// Send a message
const response = await bedrockProvider.sendMessage('What is Kubernetes?');
console.log(response.content);
```

## Troubleshooting

- **Model Access**: Ensure your AWS account has access to the models you want to use through the Bedrock console
- **Permissions**: If using AWS credentials, verify the IAM user/role has `bedrock:InvokeModel` permissions
- **Region**: Ensure the AWS_REGION you specify has Bedrock available (not all AWS regions support Bedrock)
- **API Keys**: Verify API keys are created for the correct model access groups and haven't expired
- **Debugging**: If you experience issues, set `DEBUG_DOT_AI=true` to enable detailed logging

## Docker Image

The implementation requires a custom Docker image with Bedrock support. The `docker-compose-dot-ai.yaml` file is configured to use `jicowan/dot-ai:bedrock`, which includes:

1. The AWS Bedrock SDK dependencies
2. The Bedrock provider implementation
3. Updated model configuration and provider factory changes

### Building the Docker Image

To build the Docker image yourself:

1. Ensure you have all the Bedrock changes in your local source code:
   - `src/core/providers/bedrock-provider.ts`
   - Updated `src/core/model-config.ts`
   - Updated `src/core/ai-provider-factory.ts`

2. Build the image using the Bedrock Dockerfile:
   ```bash
   docker build -t your-registry/dot-ai:bedrock -f Dockerfile.bedrock .
   ```

3. Push the image to your registry (optional):
   ```bash
   docker push your-registry/dot-ai:bedrock
   ```

4. Use the image in your Docker Compose setup:
   ```bash
   export DOT_AI_IMAGE=your-registry/dot-ai:bedrock
   ```

### Docker Image Architecture

The `Dockerfile.bedrock` uses a multi-stage build approach:

1. **Build Stage**:
   - Starts with the full Node.js development environment
   - Installs all dependencies including the AWS Bedrock SDK
   - Compiles TypeScript source code including the Bedrock provider

2. **Production Stage**:
   - Creates a minimal runtime image
   - Includes only the necessary binaries and compiled code
   - Properly configures environment variables and file permissions

This approach ensures the final image is optimized for production use while incorporating all necessary Bedrock-specific modifications.

## Verification

The implementation has been successfully tested with the provided API key and confirmed to be working with the Claude 3 Sonnet model on AWS Bedrock. Successful test output shows both proper request formatting and response parsing:

```
Testing Bedrock provider...
Region: us-west-2
Model: anthropic.claude-3-sonnet-20240229-v1:0
Sending request to Bedrock...

Response from Bedrock:
=====================
Content: Kubernetes is an open-source container orchestration system for automating deployment, scaling, and management of containerized applications.

Usage:
- Input tokens: 17
- Output tokens: 28

Test successful!
```

## Using the Bedrock Embedding Provider

The new Bedrock embedding provider allows you to use Amazon Bedrock for generating vector embeddings for semantic search and similarity operations. This is particularly useful for pattern matching, capability discovery, and policy management.

### Environment Configuration

You can configure the Bedrock embedding provider with the following environment variables:

```bash
# Enable Bedrock for embeddings
export EMBEDDINGS_PROVIDER=bedrock

# Optionally specify a different model (default: amazon.titan-embed-text-v1)
export BEDROCK_EMBEDDING_MODEL=amazon.titan-embed-text-v1

# Authentication (same as for BedrockProvider)
export BEDROCK_API_KEY=your_bedrock_api_key
# OR
export AWS_ACCESS_KEY_ID=your_access_key
export AWS_SECRET_ACCESS_KEY=your_secret_key
export AWS_REGION=us-west-2
```

### Example Usage

```typescript
import { BedrockEmbeddingProvider } from './src/core/embedding-service';

// Create the Bedrock embedding provider
const embeddingProvider = new BedrockEmbeddingProvider({
  model: 'amazon.titan-embed-text-v1',
  // API key is optional if AWS credentials are set
  apiKey: process.env.BEDROCK_API_KEY
});

// Generate an embedding for a text
const text = "This is a sample text to embed";
const embedding = await embeddingProvider.generateEmbedding(text);

// Generate embeddings for multiple texts
const texts = [
  "First text to embed",
  "Second text to embed",
  "Third text to embed"
];
const embeddings = await embeddingProvider.generateEmbeddings(texts);

// Check provider status
const isAvailable = embeddingProvider.isAvailable();
const dimensions = embeddingProvider.getDimensions();
const modelName = embeddingProvider.getModel();
```

### Supported Models

Currently, the following Bedrock embedding models are supported:

1. **Amazon Titan Embeddings** (`amazon.titan-embed-text-v1`)
   - Default model
   - 1536-dimensional embeddings
   - Optimized for semantic search use cases

2. **Cohere Embeddings** (`cohere.embed-*`)
   - Support for Cohere's embedding models on Bedrock
   - Variable dimensions based on model variant
   - Advanced contextual understanding

Additional models may be supported by extending the provider with new format handlers in the `formatRequestForModel` and `extractEmbeddingFromResponse` methods.