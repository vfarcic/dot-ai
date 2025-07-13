/**
 * Tests for Generate Manifests Tool
 */

import { 
  GENERATEMANIFESTS_TOOL_NAME, 
  GENERATEMANIFESTS_TOOL_DESCRIPTION, 
  GENERATEMANIFESTS_TOOL_INPUT_SCHEMA,
  handleGenerateManifestsTool 
} from '../../src/tools/generate-manifests';
import * as fs from 'fs';

// Mock fs module
jest.mock('fs');
const mockFs = fs as jest.Mocked<typeof fs>;

// Mock DotAI for schema retrieval tests
const mockDotAI = {
  initialize: jest.fn(),
  discovery: {
    explainResource: jest.fn()
  }
};

jest.mock('../../src/core/index', () => ({
  DotAI: jest.fn(() => mockDotAI)
}));

// Mock Claude integration  
const mockClaudeIntegration = {
  sendMessage: jest.fn()
};

jest.mock('../../src/core/claude', () => ({
  ClaudeIntegration: jest.fn(() => mockClaudeIntegration)
}));

// Mock child process for kubectl commands
jest.mock('child_process', () => ({
  spawn: jest.fn()
}));

// Mock yaml library
jest.mock('js-yaml', () => ({
  loadAll: jest.fn(),
  dump: jest.fn()
}));

const mockLogger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  fatal: jest.fn()
};

const mockContext: any = {
  requestId: 'test-request',
  logger: mockLogger,
  dotAI: mockDotAI
};

describe('Generate Manifests Tool', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset environment
    delete process.env.DOT_AI_SESSION_DIR;
  });

  describe('Input Validation', () => {
    it('should validate solution ID format', async () => {
      process.env.DOT_AI_SESSION_DIR = '/test/session';
      
      const args = {
        solutionId: 'invalid-format'
      };

      await expect(handleGenerateManifestsTool(args, mockContext.dotAI, mockContext.logger, mockContext.requestId))
        .rejects.toMatchObject({
          message: 'Session directory does not exist: /test/session'
        });
    });

    it('should require session directory from environment or args', async () => {
      const args = {
        solutionId: 'sol_2025-01-01T120000_abc123def456'
      };

      await expect(handleGenerateManifestsTool(args, mockContext.dotAI, mockContext.logger, mockContext.requestId))
        .rejects.toMatchObject({
          message: 'Session directory must be specified via --session-dir parameter or DOT_AI_SESSION_DIR environment variable'
        });
    });

    it('should accept session directory from args', async () => {
      const args = {
        solutionId: 'sol_2025-01-01T120000_abc123def456',
        sessionDir: '/nonexistent/path'
      };

      // Should fail on directory validation, not on session dir config
      await expect(handleGenerateManifestsTool(args, mockContext.dotAI, mockContext.logger, mockContext.requestId))
        .rejects.toMatchObject({
          message: 'Session directory does not exist: /nonexistent/path'
        });
    });

    it('should accept session directory from environment', async () => {
      process.env.DOT_AI_SESSION_DIR = '/nonexistent/path';
      
      const args = {
        solutionId: 'sol_2025-01-01T120000_abc123def456'
      };

      // Should fail on directory validation, not on session dir config
      await expect(handleGenerateManifestsTool(args, mockContext.dotAI, mockContext.logger, mockContext.requestId))
        .rejects.toMatchObject({
          message: 'Session directory does not exist: /nonexistent/path'
        });
    });
  });

  describe('Tool Metadata', () => {
    it('should have valid MCP tool metadata', () => {
      expect(GENERATEMANIFESTS_TOOL_NAME).toBe('generateManifests');
      expect(GENERATEMANIFESTS_TOOL_DESCRIPTION).toContain('Generate final Kubernetes manifests');
      expect(GENERATEMANIFESTS_TOOL_INPUT_SCHEMA.solutionId).toBeDefined();
    });
  });

  describe('Logging and Error Reporting', () => {
    it('should log meaningful error messages', async () => {
      const args = {
        solutionId: 'invalid-format'
      };

      try {
        await handleGenerateManifestsTool(args, mockContext.dotAI, mockContext.logger, mockContext.requestId);
      } catch (error) {
        // Should throw validation error before logging execution error
        expect(error).toBeDefined();
      }
    });

    it('should handle tool execution context properly', async () => {
      const args = {
        solutionId: 'sol_2025-01-01T120000_abc123def456'
      };

      try {
        await handleGenerateManifestsTool(args, mockContext.dotAI, mockContext.logger, mockContext.requestId);
      } catch (error) {
        // Should fail with session directory error, not context error
        expect((error as Error).message).toContain('Session directory must be specified via --session-dir parameter or DOT_AI_SESSION_DIR environment variable');
      }
    });
  });

  describe('Schema Retrieval Functionality', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      
      // Setup basic file system mocks
      mockFs.existsSync.mockImplementation((path: any) => {
        if (typeof path === 'string') {
          if (path.includes('/test/session')) return true;
          if (path.includes('sol_2025-01-01T120000_abc123def456.json')) return true;
          if (path.includes('.yaml')) return true; // Allow yaml file writes
        }
        return false;
      });
      
      mockFs.statSync.mockReturnValue({ isDirectory: () => true } as any);
      mockFs.readdirSync.mockReturnValue([]);
      mockFs.writeFileSync.mockImplementation(() => {});
      mockFs.renameSync.mockImplementation(() => {});
      mockFs.unlinkSync.mockImplementation(() => {});
      
      // Mock Claude AI to return valid YAML
      mockClaudeIntegration.sendMessage.mockResolvedValue({
        content: `apiVersion: devopstoolkit.live/v1alpha1
kind: AppClaim
metadata:
  name: test-webapp
  namespace: default
spec:
  namespace: default
  image: nginx:latest
  tag: latest
  port: 80
  host: test-webapp.local`
      });
      
      // Mock yaml parsing to succeed
      const yaml = require('js-yaml');
      yaml.loadAll.mockImplementation(() => {}); // No errors = valid YAML
      
      // Mock kubectl dry-run to succeed
      const { spawn } = require('child_process');
      const mockSpawn = {
        stdout: { on: jest.fn((event, cb) => event === 'data' ? cb('') : null) },
        stderr: { on: jest.fn((event, cb) => event === 'data' ? cb('') : null) },
        on: jest.fn((event, cb) => event === 'close' ? cb(0) : null) // Exit code 0 = success
      };
      spawn.mockReturnValue(mockSpawn);
    });

    it('should retrieve schemas for all resources in solution', async () => {
      // Mock solution with AppClaim resource
      const mockSolution = {
        solutionId: 'sol_2025-01-01T120000_abc123def456',
        resources: [
          {
            kind: 'AppClaim',
            apiVersion: 'devopstoolkit.live/v1alpha1',
            group: 'devopstoolkit.live'
          }
        ],
        questions: { required: [], basic: [], advanced: [], open: {} }
      };
      
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockSolution));
      
      // Mock kubectl explain output as raw string
      const mockExplanation = `GROUP:      devopstoolkit.live
KIND:       AppClaim
VERSION:    v1alpha1

DESCRIPTION:
     AppClaim resource for application deployment

FIELDS:
   apiVersion	<string>
     APIVersion defines the versioned schema

   kind	<string>
     Kind is a string value representing the REST resource

   metadata	<Object>
     Standard object metadata

   spec	<Object> -required-
     
     id	<string> -required-
       ID of this application

     parameters	<Object> -required-
       
       image	<string> -required-
         The container image

       port	<integer>
         The application port

       host	<string>
         The host address of the application`;
      
      mockDotAI.discovery.explainResource.mockResolvedValue(mockExplanation);
      
      process.env.DOT_AI_SESSION_DIR = '/test/session';
      
      const args = {
        solutionId: 'sol_2025-01-01T120000_abc123def456'
      };

      // This should succeed now that we have schema retrieval
      const result = await handleGenerateManifestsTool(args, mockContext.dotAI, mockContext.logger, mockContext.requestId);
      
      // Verify schema retrieval was attempted
      expect(mockDotAI.discovery.explainResource).toHaveBeenCalledWith('AppClaim');
      
      // Verify the result contains manifest data
      expect(result.content).toBeDefined();
      expect(result.content[0].type).toBe('text');
      
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.solutionId).toBe('sol_2025-01-01T120000_abc123def456');
    });

    it('should handle multiple resources in solution', async () => {
      const mockSolution = {
        solutionId: 'sol_2025-01-01T120000_abc123def456',
        resources: [
          {
            kind: 'Deployment',
            apiVersion: 'apps/v1',
            group: 'apps'
          },
          {
            kind: 'Service', 
            apiVersion: 'v1',
            group: ''
          }
        ],
        questions: { required: [], basic: [], advanced: [], open: {} }
      };
      
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockSolution));
      
      // Mock different explanations for each resource
      const deploymentExplanation = `GROUP:      apps
KIND:       Deployment
VERSION:    v1

FIELDS:
   spec	<Object>
     replicas	<integer>
       Number of desired pods`;

      const serviceExplanation = `GROUP:      
KIND:       Service
VERSION:    v1

FIELDS:
   spec	<Object>
     ports	<[]Object>
       List of ports that are exposed`;

      mockDotAI.discovery.explainResource
        .mockResolvedValueOnce(deploymentExplanation)
        .mockResolvedValueOnce(serviceExplanation);
      
      process.env.DOT_AI_SESSION_DIR = '/test/session';
      
      const args = {
        solutionId: 'sol_2025-01-01T120000_abc123def456'
      };

      await handleGenerateManifestsTool(args, mockContext.dotAI, mockContext.logger, mockContext.requestId);
      
      // Should call explainResource for each resource type
      expect(mockDotAI.discovery.explainResource).toHaveBeenCalledTimes(2);
      expect(mockDotAI.discovery.explainResource).toHaveBeenCalledWith('Deployment');
      expect(mockDotAI.discovery.explainResource).toHaveBeenCalledWith('Service');
    });

    it('should handle schema retrieval errors gracefully', async () => {
      const mockSolution = {
        solutionId: 'sol_2025-01-01T120000_abc123def456',
        resources: [
          {
            kind: 'UnknownResource',
            apiVersion: 'example.com/v1',
            group: 'example.com'
          }
        ],
        questions: { required: [], basic: [], advanced: [], open: {} }
      };
      
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockSolution));
      
      // Mock schema retrieval failure
      mockDotAI.discovery.explainResource.mockRejectedValue(new Error('Resource not found in cluster'));
      
      process.env.DOT_AI_SESSION_DIR = '/test/session';
      
      const args = {
        solutionId: 'sol_2025-01-01T120000_abc123def456'
      };

      await expect(handleGenerateManifestsTool(args, mockContext.dotAI, mockContext.logger, mockContext.requestId))
        .rejects.toMatchObject({
          message: expect.stringContaining('Failed to retrieve schema for UnknownResource')
        });
      
      // Should have attempted schema retrieval
      expect(mockDotAI.discovery.explainResource).toHaveBeenCalledWith('UnknownResource');
      
      // Should have logged the error
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to retrieve schema for resource',
        expect.any(Error),
        expect.objectContaining({
          resource: expect.objectContaining({ kind: 'UnknownResource' })
        })
      );
    });

    it('should handle solutions with no resources', async () => {
      const mockSolution = {
        solutionId: 'sol_2025-01-01T120000_abc123def456',
        resources: [], // No resources
        questions: { required: [], basic: [], advanced: [], open: {} }
      };
      
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockSolution));
      
      process.env.DOT_AI_SESSION_DIR = '/test/session';
      
      const args = {
        solutionId: 'sol_2025-01-01T120000_abc123def456'
      };

      const result = await handleGenerateManifestsTool(args, mockContext.dotAI, mockContext.logger, mockContext.requestId);
      
      // Should not attempt schema retrieval
      expect(mockDotAI.discovery.explainResource).not.toHaveBeenCalled();
      
      // Should log warning about no resources
      expect(mockLogger.warn).toHaveBeenCalledWith('No resources found in solution for schema retrieval');
      
      // Should still complete successfully
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
    });

    it('should fail fast when schema retrieval fails', async () => {
      const mockSolution = {
        solutionId: 'sol_2025-01-01T120000_abc123def456',
        resources: [
          {
            kind: 'AppClaim',
            apiVersion: 'devopstoolkit.live/v1alpha1',
            group: 'devopstoolkit.live'
          }
        ],
        questions: { required: [], basic: [], advanced: [], open: {} }
      };
      
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockSolution));
      
      // Mock schema retrieval failure
      mockDotAI.discovery.explainResource.mockRejectedValue(new Error('Cluster connection failed'));
      
      process.env.DOT_AI_SESSION_DIR = '/test/session';
      
      const args = {
        solutionId: 'sol_2025-01-01T120000_abc123def456'
      };

      await expect(handleGenerateManifestsTool(args, mockContext.dotAI, mockContext.logger, mockContext.requestId))
        .rejects.toMatchObject({
          message: expect.stringContaining('Failed to retrieve resource schemas')
        });
      
      expect(mockDotAI.discovery.explainResource).toHaveBeenCalledWith('AppClaim');
      expect(mockLogger.error).toHaveBeenCalledWith('Schema retrieval failed', expect.any(Error));
    });
  });

  describe('Resource Integration Patterns', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      
      // Setup basic file system mocks
      mockFs.existsSync.mockImplementation((path: any) => {
        if (typeof path === 'string') {
          if (path.includes('/test/session')) return true;
          if (path.includes('sol_2025-01-01T120000_abc123def456.json')) return true;
          if (path.includes('.yaml')) return true;
        }
        return false;
      });
      
      mockFs.statSync.mockReturnValue({ isDirectory: () => true } as any);
      mockFs.readdirSync.mockReturnValue([]);
      mockFs.writeFileSync.mockImplementation(() => {});
      mockFs.renameSync.mockImplementation(() => {});
      mockFs.unlinkSync.mockImplementation(() => {});
      
      // Mock yaml parsing to succeed
      const yaml = require('js-yaml');
      yaml.loadAll.mockImplementation(() => {});
      
      // Mock kubectl dry-run to succeed
      const { spawn } = require('child_process');
      const mockSpawn = {
        stdout: { on: jest.fn((event, cb) => event === 'data' ? cb('') : null) },
        stderr: { on: jest.fn((event, cb) => event === 'data' ? cb('') : null) },
        on: jest.fn((event, cb) => event === 'close' ? cb(0) : null)
      };
      spawn.mockReturnValue(mockSpawn);
    });

    it('should integrate StatefulSet with PersistentVolumeClaim using volumeClaimTemplates', async () => {
      const mockSolution = {
        solutionId: 'sol_2025-01-01T120000_abc123def456',
        resources: [
          {
            kind: 'StatefulSet',
            apiVersion: 'apps/v1',
            group: 'apps'
          },
          {
            kind: 'PersistentVolumeClaim',
            apiVersion: 'v1',
            group: ''
          }
        ],
        questions: {
          required: [
            { id: 'name', answer: 'test-app' },
            { id: 'namespace', answer: 'default' }
          ],
          basic: [],
          advanced: [
            { id: 'volumeSize', answer: 10 }
          ],
          open: {}
        }
      };
      
      // Mock file reads: solution file and prompt template
      mockFs.readFileSync.mockImplementation((path: any) => {
        if (typeof path === 'string') {
          if (path.includes('sol_2025-01-01T120000_abc123def456.json')) {
            return JSON.stringify(mockSolution);
          }
          if (path.includes('manifest-generation.md')) {
            return `# Test Prompt Template
{solution}
{schemas}
volumeClaimTemplates field available`;
          }
        }
        return '';
      });
      
      // Mock schemas that show StatefulSet supports volumeClaimTemplates
      const statefulSetSchema = `GROUP:      apps
KIND:       StatefulSet
VERSION:    v1

FIELDS:
   spec	<Object>
     volumeClaimTemplates	<[]Object>
       List of claims that pods are allowed to reference`;

      const pvcSchema = `GROUP:      
KIND:       PersistentVolumeClaim
VERSION:    v1

FIELDS:
   spec	<Object>
     resources	<Object>
       Requirements for storage resource`;

      mockDotAI.discovery.explainResource
        .mockResolvedValueOnce(statefulSetSchema)
        .mockResolvedValueOnce(pvcSchema);
      
      // Mock AI to return integrated manifest (StatefulSet with volumeClaimTemplates)
      mockClaudeIntegration.sendMessage.mockResolvedValue({
        content: `apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: test-app
  namespace: default
spec:
  serviceName: test-app
  replicas: 1
  selector:
    matchLabels:
      app: test-app
  template:
    metadata:
      labels:
        app: test-app
    spec:
      containers:
      - name: test-app
        image: nginx:latest
        volumeMounts:
        - name: data
          mountPath: /data
  volumeClaimTemplates:
  - metadata:
      name: data
    spec:
      accessModes: ["ReadWriteOnce"]
      resources:
        requests:
          storage: 10Gi`
      });
      
      process.env.DOT_AI_SESSION_DIR = '/test/session';
      
      const args = {
        solutionId: 'sol_2025-01-01T120000_abc123def456'
      };

      const result = await handleGenerateManifestsTool(args, mockContext.dotAI, mockContext.logger, mockContext.requestId);
      
      // Verify both resources were analyzed for schemas
      expect(mockDotAI.discovery.explainResource).toHaveBeenCalledWith('StatefulSet');
      expect(mockDotAI.discovery.explainResource).toHaveBeenCalledWith('PersistentVolumeClaim');
      
      // Verify the AI prompt included both resources and their schemas
      const promptCall = mockClaudeIntegration.sendMessage.mock.calls[0][0];
      expect(promptCall).toContain('StatefulSet');
      expect(promptCall).toContain('PersistentVolumeClaim'); 
      expect(promptCall).toContain('volumeClaimTemplates');
      
      // Verify successful result
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
    });

    it('should handle resource combinations that cannot be integrated', async () => {
      const mockSolution = {
        solutionId: 'sol_2025-01-01T120000_abc123def456',
        resources: [
          {
            kind: 'Deployment',
            apiVersion: 'apps/v1',
            group: 'apps'
          },
          {
            kind: 'NetworkPolicy',
            apiVersion: 'networking.k8s.io/v1',
            group: 'networking.k8s.io'
          }
        ],
        questions: {
          required: [
            { id: 'name', answer: 'test-app' },
            { id: 'namespace', answer: 'default' }
          ],
          basic: [],
          advanced: [],
          open: {}
        }
      };
      
      // Mock file reads: solution file and prompt template  
      mockFs.readFileSync.mockImplementation((path: any) => {
        if (typeof path === 'string') {
          if (path.includes('sol_2025-01-01T120000_abc123def456.json')) {
            return JSON.stringify(mockSolution);
          }
          if (path.includes('manifest-generation.md')) {
            return `# Test Prompt Template
{solution}
{schemas}
Resources for separate manifests`;
          }
        }
        return '';
      });
      
      // Mock schemas that show these resources should be separate
      const deploymentSchema = `GROUP:      apps
KIND:       Deployment
VERSION:    v1

FIELDS:
   spec	<Object>
     replicas	<integer>
       Number of desired pods`;

      const networkPolicySchema = `GROUP:      networking.k8s.io
KIND:       NetworkPolicy
VERSION:    v1

FIELDS:
   spec	<Object>
     podSelector	<Object>
       Selects pods to which this policy applies`;

      mockDotAI.discovery.explainResource
        .mockResolvedValueOnce(deploymentSchema)
        .mockResolvedValueOnce(networkPolicySchema);
      
      // Mock AI to return separate manifests
      mockClaudeIntegration.sendMessage.mockResolvedValue({
        content: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: test-app
  namespace: default
spec:
  replicas: 1
  selector:
    matchLabels:
      app: test-app
  template:
    metadata:
      labels:
        app: test-app
    spec:
      containers:
      - name: test-app
        image: nginx:latest
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: test-app
  namespace: default
spec:
  podSelector:
    matchLabels:
      app: test-app
  policyTypes:
  - Ingress`
      });
      
      process.env.DOT_AI_SESSION_DIR = '/test/session';
      
      const args = {
        solutionId: 'sol_2025-01-01T120000_abc123def456'
      };

      const result = await handleGenerateManifestsTool(args, mockContext.dotAI, mockContext.logger, mockContext.requestId);
      
      // Should generate separate manifests for resources that cannot be integrated
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.manifests).toContain('kind: Deployment');
      expect(response.manifests).toContain('kind: NetworkPolicy');
    });
  });
});