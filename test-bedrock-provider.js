// Simple test script for Bedrock provider

const BedrockRuntimeClient = require('@aws-sdk/client-bedrock-runtime').BedrockRuntimeClient;
const InvokeModelCommand = require('@aws-sdk/client-bedrock-runtime').InvokeModelCommand;

// Set up environment
const API_KEY = process.env.BEDROCK_API_KEY
const REGION = process.env.AWS_REGION || 'us-west-2';
const MODEL_ID = 'anthropic.claude-3-sonnet-20240229-v1:0';

// Create Bedrock client
const client = new BedrockRuntimeClient({
  region: REGION,
  apiKey: API_KEY
});

async function testBedrockProvider() {
  console.log("Testing Bedrock provider...");
  console.log(`Region: ${REGION}`);
  console.log(`Model: ${MODEL_ID}`);

  try {
    // Create request
    const request = {
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 1000,
      messages: [{ role: "user", content: "What is Kubernetes? Keep the answer short." }]
    };

    // Create command
    const command = new InvokeModelCommand({
      modelId: MODEL_ID,
      body: JSON.stringify(request)
    });

    console.log("Sending request to Bedrock...");
    // Execute command
    const response = await client.send(command);

    // Process response
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    console.log("\nResponse from Bedrock:");
    console.log("=====================");
    console.log("Content:", responseBody.content[0].text);
    console.log("\nUsage:");
    console.log("- Input tokens:", responseBody.usage.input_tokens);
    console.log("- Output tokens:", responseBody.usage.output_tokens);
    console.log("\nTest successful!");

    return true;
  } catch (error) {
    console.error("Error testing Bedrock provider:", error);
    return false;
  }
}

// Run test
testBedrockProvider()
  .then(success => {
    if (success) {
      console.log("Bedrock provider test completed successfully!");
      process.exit(0);
    } else {
      console.error("Bedrock provider test failed!");
      process.exit(1);
    }
  })
  .catch(error => {
    console.error("Error running test:", error);
    process.exit(1);
  });
