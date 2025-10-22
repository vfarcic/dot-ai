#!/bin/bash

# Set environment variables
export BEDROCK_API_KEY=BEDROCK_API_KEY_REMOVED
export AWS_REGION=us-west-2
export AI_PROVIDER=bedrock
export DEBUG_DOT_AI=true

# Skip full build and linting process, run tests directly
echo "Building TypeScript files without linting..."
npx tsc

echo "Running Bedrock provider tests..."
npx vitest run tests/integration/core/bedrock-provider.test.ts --config=vitest.integration.config.ts