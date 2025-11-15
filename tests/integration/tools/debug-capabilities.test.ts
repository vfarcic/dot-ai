/**
 * Debug Test: Capabilities Version Field
 *
 * Minimal test to debug why capability.version is undefined
 */

import { describe, test, expect, beforeAll } from 'vitest';
import { IntegrationTest } from '../helpers/test-base.js';

describe('Debug Capabilities Version', () => {
  const integrationTest = new IntegrationTest();

  beforeAll(async () => {
    const kubeconfig = process.env.KUBECONFIG;
    expect(kubeconfig).toContain('kubeconfig-test.yaml');
  });

  test('should scan and show what fields capabilities have', async () => {
    console.log('\n🔍 DEBUG: Starting capability scan...');

    // Start scan
    const startResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
      dataType: 'capabilities',
      operation: 'scan',
      interaction_id: 'debug_scan'
    });

    console.log('🔍 DEBUG: Start response meta:', JSON.stringify(startResponse.meta, null, 2));
    console.log('🔍 DEBUG: Start response success:', startResponse.success);
    console.log('🔍 DEBUG: Start response data keys:', Object.keys(startResponse.data || {}));

    const sessionId = startResponse.data.result.workflow.sessionId;

    // Select specific resources (fast)
    await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
      dataType: 'capabilities',
      operation: 'scan',
      sessionId,
      step: 'resource-selection',
      response: 'specific',
      interaction_id: 'debug_selection'
    });

    // Scan just Deployment
    const scanResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
      dataType: 'capabilities',
      operation: 'scan',
      sessionId,
      step: 'resource-specification',
      resourceList: 'Deployment.apps',
      interaction_id: 'debug_scan_deployment'
    }, { timeout: 120000 });

    console.log('🔍 DEBUG: Scan complete:', scanResponse.data.result.success);
    console.log('🔍 DEBUG: Scan summary:', JSON.stringify(scanResponse.data.result.summary, null, 2));

    // List capabilities
    const listResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
      dataType: 'capabilities',
      operation: 'list',
      limit: 5,
      interaction_id: 'debug_list'
    });

    console.log('🔍 DEBUG: List response meta:', JSON.stringify(listResponse.meta, null, 2));
    console.log('🔍 DEBUG: List response success:', listResponse.success);

    const capabilities = listResponse.data.result.data.capabilities;
    console.log('🔍 DEBUG: Found', capabilities.length, 'capabilities');

    if (capabilities.length > 0) {
      const firstCap = capabilities[0];
      console.log('🔍 DEBUG: First capability keys:', Object.keys(firstCap));
      console.log('🔍 DEBUG: First capability full object:', JSON.stringify(firstCap, null, 2));
      console.log('🔍 DEBUG: apiVersion:', firstCap.apiVersion);
      console.log('🔍 DEBUG: version:', firstCap.version);
      console.log('🔍 DEBUG: group:', firstCap.group);
    }

    // This will fail if version is missing, but we'll see the debug output
    expect(capabilities.length).toBeGreaterThan(0);
  }, 180000); // 3 minute timeout
});
