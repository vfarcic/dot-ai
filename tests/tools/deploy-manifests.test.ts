import { deployManifestsToolDefinition, deployManifestsToolHandler } from '../../src/tools/deploy-manifests';
import { DeployOperation } from '../../src/core/deploy-operation';
import { SchemaValidator, MCPToolSchemas } from '../../src/core/validation';
import { ToolContext } from '../../src/core/tool-registry';

// Mock dependencies
jest.mock('../../src/core/deploy-operation');
jest.mock('../../src/core/validation', () => {
  const original = jest.requireActual('../../src/core/validation');
  return {
    ...original,
    SchemaValidator: {
      ...original.SchemaValidator,
      validateToolInput: jest.fn()
    }
  };
});

const mockDeployOperation = DeployOperation as jest.MockedClass<typeof DeployOperation>;

describe('Deploy Manifests Tool', () => {
  let mockContext: ToolContext;

  beforeEach(() => {
    mockContext = {
      requestId: 'test-request',
      logger: {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        fatal: jest.fn()
      },
      appAgent: null
    };
    jest.clearAllMocks();
  });

  // Get the mocked function reference
  const getMockValidateToolInput = () => SchemaValidator.validateToolInput as jest.MockedFunction<typeof SchemaValidator.validateToolInput>;

  describe('Tool Definition', () => {
    it('should have correct tool definition properties', () => {
      expect(deployManifestsToolDefinition.name).toBe('deployManifests');
      expect(deployManifestsToolDefinition.description).toContain('Deploy Kubernetes manifests');
      expect(deployManifestsToolDefinition.inputSchema).toBe(MCPToolSchemas.DEPLOY_MANIFESTS_INPUT);
      expect(deployManifestsToolDefinition.category).toBe('deployment');
      expect(deployManifestsToolDefinition.tags).toContain('kubernetes');
      expect(deployManifestsToolDefinition.tags).toContain('deploy');
    });
  });

  describe('Tool Handler', () => {
    const validArgs = {
      solutionId: 'sol_2025-01-01T120000_abc123',
      sessionDir: '/test/sessions',
      timeout: 60
    };

    it('should validate input arguments using schema validator', async () => {
      const mockDeploy = jest.fn().mockResolvedValue({
        success: true,
        kubectlOutput: 'deployment created',
        manifestPath: '/test/path/manifest.yaml',
        solutionId: validArgs.solutionId,
        readinessTimeout: false,
        message: 'Success'
      });

      mockDeployOperation.prototype.deploy = mockDeploy;

      await deployManifestsToolHandler(validArgs, mockContext);

      expect(getMockValidateToolInput()).toHaveBeenCalledWith(
        'deployManifests',
        validArgs,
        MCPToolSchemas.DEPLOY_MANIFESTS_INPUT
      );
    });

    it('should successfully deploy manifests and return formatted response', async () => {
      const deployResult = {
        success: true,
        kubectlOutput: 'deployment.apps/test-app created\nservice/test-service created',
        manifestPath: '/test/sessions/sol_test/manifest.yaml',
        solutionId: validArgs.solutionId,
        readinessTimeout: false,
        message: 'Deployment completed successfully'
      };

      const mockDeploy = jest.fn().mockResolvedValue(deployResult);
      mockDeployOperation.prototype.deploy = mockDeploy;

      const result = await deployManifestsToolHandler(validArgs, mockContext);

      expect(mockDeploy).toHaveBeenCalledWith({
        solutionId: validArgs.solutionId,
        sessionDir: validArgs.sessionDir,
        timeout: validArgs.timeout
      });

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
      
      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.success).toBe(true);
      expect(responseData.deploymentComplete).toBe(true);
      expect(responseData.requiresStatusCheck).toBe(false);
      expect(responseData.kubectlOutput).toBe(deployResult.kubectlOutput);
    });

    it('should handle deployment timeout correctly', async () => {
      const deployResult = {
        success: true,
        kubectlOutput: 'deployment applied but timed out',
        manifestPath: '/test/sessions/sol_test/manifest.yaml',
        solutionId: validArgs.solutionId,
        readinessTimeout: true,
        message: 'Deployment applied but resources did not become ready within timeout'
      };

      const mockDeploy = jest.fn().mockResolvedValue(deployResult);
      mockDeployOperation.prototype.deploy = mockDeploy;

      const result = await deployManifestsToolHandler(validArgs, mockContext);

      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.success).toBe(true);
      expect(responseData.readinessTimeout).toBe(true);
      expect(responseData.deploymentComplete).toBe(false);
      expect(responseData.requiresStatusCheck).toBe(true);
    });

    it('should handle deployment failures', async () => {
      const deployResult = {
        success: false,
        kubectlOutput: 'Error: manifest validation failed',
        manifestPath: '/test/sessions/sol_test/manifest.yaml',
        solutionId: validArgs.solutionId,
        readinessTimeout: false,
        message: 'Deployment failed'
      };

      const mockDeploy = jest.fn().mockResolvedValue(deployResult);
      mockDeployOperation.prototype.deploy = mockDeploy;

      const result = await deployManifestsToolHandler(validArgs, mockContext);

      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.success).toBe(false);
      expect(responseData.deploymentComplete).toBe(false);
      expect(responseData.requiresStatusCheck).toBe(false);
      expect(responseData.message).toBe('Deployment failed');
    });

    it('should use default timeout when not provided', async () => {
      const argsWithoutTimeout = {
        solutionId: validArgs.solutionId,
        sessionDir: validArgs.sessionDir
      };

      const mockDeploy = jest.fn().mockResolvedValue({
        success: true,
        kubectlOutput: 'success',
        manifestPath: '/test/path',
        solutionId: validArgs.solutionId,
        readinessTimeout: false,
        message: 'Success'
      });

      mockDeployOperation.prototype.deploy = mockDeploy;

      await deployManifestsToolHandler(argsWithoutTimeout, mockContext);

      expect(mockDeploy).toHaveBeenCalledWith({
        solutionId: validArgs.solutionId,
        sessionDir: validArgs.sessionDir,
        timeout: 30 // Default timeout
      });
    });

    it('should propagate validation errors from schema validator', async () => {
      const validationError = new Error('Invalid solution ID format');
      getMockValidateToolInput().mockImplementation(() => {
        throw validationError;
      });

      await expect(deployManifestsToolHandler({}, mockContext))
        .rejects.toThrow('Invalid solution ID format');
    });
  });
});