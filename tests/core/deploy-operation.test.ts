import { DeployOperation } from '../../src/core/deploy-operation';
import { executeKubectl } from '../../src/core/kubernetes-utils';
import * as fs from 'fs';
import * as path from 'path';

// Mock dependencies
jest.mock('../../src/core/kubernetes-utils');
jest.mock('fs');

const mockExecuteKubectl = executeKubectl as jest.MockedFunction<typeof executeKubectl>;
const mockFs = fs as jest.Mocked<typeof fs>;

describe('DeployOperation', () => {
  let deployOp: DeployOperation;
  const testSessionDir = '/test/sessions';
  const testSolutionId = 'sol_test_123';
  const expectedManifestPath = path.join(testSessionDir, testSolutionId, 'manifest.yaml');

  beforeEach(() => {
    deployOp = new DeployOperation();
    jest.clearAllMocks();
  });

  describe('deploy', () => {
    const baseOptions = {
      solutionId: testSolutionId,
      sessionDir: testSessionDir
    };

    it('should successfully deploy manifest with default timeout', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockExecuteKubectl.mockResolvedValue('deployment.apps/test-app created\nservice/test-service created');

      const result = await deployOp.deploy(baseOptions);

      expect(mockExecuteKubectl).toHaveBeenCalledWith([
        'apply',
        '-f', expectedManifestPath,
        '--wait',
        '--timeout=30s'
      ]);

      expect(result).toEqual({
        success: true,
        kubectlOutput: 'deployment.apps/test-app created\nservice/test-service created',
        manifestPath: expectedManifestPath,
        solutionId: testSolutionId,
        readinessTimeout: false,
        message: 'Deployment completed successfully'
      });
    });

    it('should successfully deploy manifest with custom timeout', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockExecuteKubectl.mockResolvedValue('deployment.apps/test-app created');

      await deployOp.deploy({
        ...baseOptions,
        timeout: 60
      });

      expect(mockExecuteKubectl).toHaveBeenCalledWith([
        'apply',
        '-f', expectedManifestPath,
        '--wait',
        '--timeout=60s'
      ]);
    });

    it('should handle timeout errors appropriately', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockExecuteKubectl.mockRejectedValue(new Error('timed out waiting for the condition'));

      const result = await deployOp.deploy(baseOptions);

      expect(result).toEqual({
        success: false,
        kubectlOutput: 'timed out waiting for the condition',
        manifestPath: expectedManifestPath,
        solutionId: testSolutionId,
        readinessTimeout: true,
        message: 'Deployment applied but resources did not become ready within timeout'
      });
    });

    it('should handle general deployment failures', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockExecuteKubectl.mockRejectedValue(new Error('invalid manifest format'));

      const result = await deployOp.deploy(baseOptions);

      expect(result).toEqual({
        success: false,
        kubectlOutput: 'invalid manifest format',
        manifestPath: expectedManifestPath,
        solutionId: testSolutionId,
        readinessTimeout: false,
        message: 'Deployment failed'
      });
    });

    it('should fail when manifest file does not exist', async () => {
      mockFs.existsSync.mockReturnValue(false);

      const result = await deployOp.deploy(baseOptions);

      expect(result.success).toBe(false);
      expect(result.kubectlOutput).toContain('Manifest file not found');
      expect(mockExecuteKubectl).not.toHaveBeenCalled();
    });

    it('should fail when session directory is not provided', async () => {
      const result = await deployOp.deploy({ 
        solutionId: testSolutionId,
        sessionDir: '' // Empty sessionDir should trigger error
      });

      expect(result.success).toBe(false);
      expect(result.kubectlOutput).toContain('Session directory must be specified');
      expect(mockExecuteKubectl).not.toHaveBeenCalled();
    });

    it('should detect timeout from different error message formats', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockExecuteKubectl.mockRejectedValue(new Error('kubectl timeout occurred'));

      const result = await deployOp.deploy(baseOptions);

      expect(result.readinessTimeout).toBe(true);
      expect(result.message).toBe('Deployment applied but resources did not become ready within timeout');
    });
  });
});