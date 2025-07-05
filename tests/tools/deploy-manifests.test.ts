import { 
  DEPLOYMANIFESTS_TOOL_NAME, 
  DEPLOYMANIFESTS_TOOL_DESCRIPTION, 
  DEPLOYMANIFESTS_TOOL_INPUT_SCHEMA,
  handleDeployManifestsTool 
} from '../../src/tools/deploy-manifests';
import { DeployOperation } from '../../src/core/deploy-operation';
import { ErrorHandler, ErrorCategory, ErrorSeverity } from '../../src/core/error-handling';

// Mock dependencies
jest.mock('../../src/core/deploy-operation');
jest.mock('../../src/core/error-handling', () => {
  const original = jest.requireActual('../../src/core/error-handling');
  return {
    ...original,
    ErrorHandler: {
      ...original.ErrorHandler,
      withErrorHandling: jest.fn((fn) => fn()),
      createError: jest.fn()
    }
  };
});

const mockDeployOperation = DeployOperation as jest.MockedClass<typeof DeployOperation>;

describe('Deploy Manifests Tool', () => {
  let mockContext: any;

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
      dotAI: null
    };
    jest.clearAllMocks();
  });

  // Get the mocked function reference
  const getMockWithErrorHandling = () => ErrorHandler.withErrorHandling as jest.MockedFunction<typeof ErrorHandler.withErrorHandling>;
  const getMockCreateError = () => ErrorHandler.createError as jest.MockedFunction<typeof ErrorHandler.createError>;

  describe('Tool Metadata', () => {
    it('should have correct tool metadata properties', () => {
      expect(DEPLOYMANIFESTS_TOOL_NAME).toBe('deployManifests');
      expect(DEPLOYMANIFESTS_TOOL_DESCRIPTION).toContain('Deploy Kubernetes manifests');
      expect(DEPLOYMANIFESTS_TOOL_INPUT_SCHEMA.solutionId).toBeDefined();
      expect(DEPLOYMANIFESTS_TOOL_INPUT_SCHEMA.timeout).toBeDefined();
    });
  });

  describe('Tool Handler', () => {
    const validArgs = {
      solutionId: 'sol_2025-01-01T120000_abc123',
      sessionDir: '/test/sessions',
      timeout: 60
    };

    it('should validate input arguments and handle CLI mode', async () => {
      const mockDeploy = jest.fn().mockResolvedValue({
        success: true,
        kubectlOutput: 'deployment created',
        manifestPath: '/test/path/manifest.yaml',
        solutionId: validArgs.solutionId,
        readinessTimeout: false,
        message: 'Success'
      });

      mockDeployOperation.prototype.deploy = mockDeploy;

      await handleDeployManifestsTool(validArgs, mockContext.dotAI, mockContext.logger, mockContext.requestId);

      expect(getMockWithErrorHandling()).toHaveBeenCalled();
      expect(mockDeploy).toHaveBeenCalledWith({
        solutionId: validArgs.solutionId,
        timeout: validArgs.timeout
      });
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

      const result = await handleDeployManifestsTool(validArgs, mockContext.dotAI, mockContext.logger, mockContext.requestId);

      expect(mockDeploy).toHaveBeenCalledWith({
        solutionId: validArgs.solutionId,
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

      const result = await handleDeployManifestsTool(validArgs, mockContext.dotAI, mockContext.logger, mockContext.requestId);

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

      const result = await handleDeployManifestsTool(validArgs, mockContext.dotAI, mockContext.logger, mockContext.requestId);

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

      await handleDeployManifestsTool(argsWithoutTimeout, mockContext.dotAI, mockContext.logger, mockContext.requestId);

      expect(mockDeploy).toHaveBeenCalledWith({
        solutionId: validArgs.solutionId,
        timeout: 30 // Default timeout
      });
    });

  });
});