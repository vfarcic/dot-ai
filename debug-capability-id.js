/**
 * Debug script to test capability ID generation and usage
 */

const { CapabilityInferenceEngine } = require('./dist/core/capabilities');

// Test the ID generation
const resourceName = 'SQL.devopstoolkit.live';
const testId = '43a49011-e316-b8e1-9554-5a90b6add37f'; // Example from list operation

console.log('=== Capability ID Analysis ===');
console.log(`Resource Name: ${resourceName}`);
console.log(`Generated ID from resource name: ${CapabilityInferenceEngine.generateCapabilityId(resourceName)}`);
console.log(`Test ID from list operation: ${testId}`);
console.log(`IDs match: ${CapabilityInferenceEngine.generateCapabilityId(resourceName) === testId}`);

console.log('\n=== Problem Diagnosis ===');
console.log('1. List operation returns capabilities with Vector DB document IDs');
console.log('2. Get operation expects resource names and generates IDs from them');
console.log('3. These two ID sources never match, causing "not found" errors');

console.log('\n=== Solution ===');
console.log('The getCapability method should handle both:');
console.log('- Direct Vector DB ID lookup (for list->get flow)');
console.log('- Resource name -> ID generation -> lookup (for direct queries)');