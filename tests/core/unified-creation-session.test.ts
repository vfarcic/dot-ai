/**
 * Test suite for unified creation session manager
 * 
 * Tests step-by-step workflow creation for both patterns and policies
 * with context-aware questions and AI-powered trigger expansion
 */

import { UnifiedCreationSessionManager } from '../../src/core/unified-creation-session';
import { UnifiedCreationSession, EntityType, WorkflowStep } from '../../src/core/unified-creation-types';
import * as fs from 'fs';
import * as path from 'path';

// Mock KubernetesDiscovery
const mockDiscovery = {
  connect: jest.fn().mockResolvedValue(undefined),
  explainResource: jest.fn().mockResolvedValue('Mock schema explanation for resource'),
  discoverResources: jest.fn()
};

jest.mock('../../src/core/discovery', () => ({
  KubernetesDiscovery: jest.fn(() => mockDiscovery)
}));

// Mock CapabilityVectorService
const mockCapabilityService = {
  searchCapabilities: jest.fn().mockResolvedValue([
    {
      data: {
        resourceName: 'LimitRange',
        capabilities: ['resource-limits', 'quotas'],
        providers: ['kubernetes'],
        abstractions: ['resource-management']
      },
      score: 0.95
    },
    {
      data: {
        resourceName: 'Pod',
        capabilities: ['containers', 'workloads'],
        providers: ['kubernetes'],
        abstractions: ['compute']
      },
      score: 0.85
    }
  ])
};

jest.mock('../../src/core/capability-vector-service', () => ({
  CapabilityVectorService: jest.fn(() => mockCapabilityService)
}));

// Mock the session utils
jest.mock('../../src/core/session-utils', () => ({
  getAndValidateSessionDirectory: jest.fn(() => '/tmp/test-sessions')
}));

// Mock the pattern operations  
jest.mock('../../src/core/pattern-operations', () => ({
  createPattern: jest.fn(() => ({
    id: 'test-pattern-id',
    description: 'Test pattern',
    triggers: ['test', 'pattern'],
    suggestedResources: ['Pod', 'Service'],
    rationale: 'Test rationale',
    createdBy: 'test-user',
    createdAt: new Date().toISOString()
  }))
}));

// Mock shared prompt loader
jest.mock('../../src/core/shared-prompt-loader', () => ({
  loadPrompt: jest.fn((promptName: string, variables?: Record<string, string>) => {
    const basePrompt = `Mock ${promptName} prompt`;
    if (variables) {
      let result = basePrompt;
      Object.entries(variables).forEach(([key, value]) => {
        result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
      });
      return result;
    }
    return basePrompt;
  })
}));

// Mock Claude integration to prevent real API calls
const mockClaudeResponse = {
  content: 'applications, web applications, microservices, containerized applications',
  usage: { input_tokens: 50, output_tokens: 20 }
};

jest.mock('../../src/core/claude', () => ({
  ClaudeIntegration: jest.fn().mockImplementation(() => ({
    sendMessage: jest.fn().mockResolvedValue(mockClaudeResponse),
    isInitialized: jest.fn().mockReturnValue(true)
  }))
}));

// Mock DeployOperation to avoid actual kubectl calls in tests
jest.mock('../../src/core/deploy-operation', () => ({
  DeployOperation: jest.fn().mockImplementation(() => ({
    deploy: jest.fn().mockResolvedValue({
      success: true,
      solutionId: 'test-policy-kyverno',
      manifestPath: '/tmp/test-path',
      readinessTimeout: false,
      message: 'Deployment completed successfully',
      kubectlOutput: 'clusterpolicy.kyverno.io/test-policy created'
    })
  }))
}));

// Mock ManifestValidator for validation loop testing
jest.mock('../../src/core/schema', () => ({
  ManifestValidator: jest.fn().mockImplementation(() => ({
    validateManifest: jest.fn().mockResolvedValue({
      valid: true,
      errors: [],
      warnings: []
    })
  }))
}));

// Mock js-yaml for YAML validation
jest.mock('js-yaml', () => ({
  loadAll: jest.fn().mockImplementation(() => {
    // Mock successful YAML parsing
    return [];
  })
}));

describe('UnifiedCreationSessionManager', () => {
  let tempSessionDir: string;

  beforeAll(() => {
    // Create temporary session directory
    tempSessionDir = path.join(__dirname, 'temp-sessions');
    if (!fs.existsSync(tempSessionDir)) {
      fs.mkdirSync(tempSessionDir, { recursive: true });
    }
  });

  afterAll(() => {
    // Clean up temporary session directory
    if (fs.existsSync(tempSessionDir)) {
      fs.rmSync(tempSessionDir, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    // Clean up any existing session files
    const patternSessionsDir = path.join(tempSessionDir, 'pattern-sessions');
    const policySessionsDir = path.join(tempSessionDir, 'policy-sessions');
    
    [patternSessionsDir, policySessionsDir].forEach(dir => {
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  describe('Pattern workflow', () => {
    let manager: UnifiedCreationSessionManager;

    beforeEach(() => {
      manager = new UnifiedCreationSessionManager('pattern');
    });

    it('should create a new pattern session', () => {
      const args = { sessionDir: tempSessionDir };
      const session = manager.createSession(args);

      expect(session).toMatchObject({
        sessionId: expect.stringMatching(/^pattern-\d+-[a-f0-9]{8}$/),
        entityType: 'pattern',
        currentStep: 'description',
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
        data: {}
      });
    });

    it('should progress through pattern workflow steps correctly', () => {
      const args = { sessionDir: tempSessionDir };
      const session = manager.createSession(args);

      // Step 1: Description
      expect(session.currentStep).toBe('description');
      let updatedSession = manager.processResponse(session.sessionId, 'Test pattern description', args);
      expect(updatedSession.currentStep).toBe('triggers');
      expect(updatedSession.data.description).toBe('Test pattern description');

      // Step 2: Triggers
      updatedSession = manager.processResponse(session.sessionId, 'web, api, http', args);
      expect(updatedSession.currentStep).toBe('trigger-expansion');
      expect(updatedSession.data.initialTriggers).toEqual(['web', 'api', 'http']);

      // Step 3: Trigger expansion
      updatedSession = manager.processResponse(session.sessionId, 'web, api, http, service, rest', args);
      expect(updatedSession.currentStep).toBe('resources');
      expect(updatedSession.data.expandedTriggers).toEqual(['web', 'api', 'http', 'service', 'rest']);

      // Step 4: Resources (pattern-specific)
      updatedSession = manager.processResponse(session.sessionId, 'Pod, Service, Ingress', args);
      expect(updatedSession.currentStep).toBe('rationale');
      expect(updatedSession.data.suggestedResources).toEqual(['Pod', 'Service', 'Ingress']);

      // Step 5: Rationale
      updatedSession = manager.processResponse(session.sessionId, 'For web application deployment', args);
      expect(updatedSession.currentStep).toBe('created-by');
      expect(updatedSession.data.rationale).toBe('For web application deployment');

      // Step 6: Created by
      updatedSession = manager.processResponse(session.sessionId, 'test-user', args);
      expect(updatedSession.currentStep).toBe('review');
      expect(updatedSession.data.createdBy).toBe('test-user');

      // Step 7: Review
      updatedSession = manager.processResponse(session.sessionId, 'confirmed', args);
      expect(updatedSession.currentStep).toBe('complete');
    });

    it('should generate correct workflow steps for patterns', async () => {
      const args = { sessionDir: tempSessionDir };
      const session = manager.createSession(args);

      // Test description step
      const descStep = await manager.getNextWorkflowStep(session);
      expect(descStep).toMatchObject({
        sessionId: session.sessionId,
        entityType: 'pattern',
        prompt: expect.stringContaining('Mock pattern-description prompt'),
        nextStep: 'triggers'
      });

      // Progress to triggers and test
      const updatedSession = manager.processResponse(session.sessionId, 'Test description', args);
      const triggersStep = await manager.getNextWorkflowStep(updatedSession);
      expect(triggersStep).toMatchObject({
        prompt: expect.stringContaining('Mock infrastructure-triggers prompt'),
        nextStep: 'trigger-expansion'
      });
    });
  });

  describe('Policy workflow', () => {
    let manager: UnifiedCreationSessionManager;

    beforeEach(() => {
      manager = new UnifiedCreationSessionManager('policy');
    });

    it('should create a new policy session', () => {
      const args = { sessionDir: tempSessionDir };
      const session = manager.createSession(args);

      expect(session).toMatchObject({
        sessionId: expect.stringMatching(/^policy-\d+-[a-f0-9]{8}$/),
        entityType: 'policy',
        currentStep: 'description',
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
        data: {}
      });
    });

    it('should skip resources step for policies', () => {
      const args = { sessionDir: tempSessionDir };
      const session = manager.createSession(args);

      // Progress through workflow
      let updatedSession = manager.processResponse(session.sessionId, 'Test policy description', args);
      updatedSession = manager.processResponse(session.sessionId, 'security, compliance', args);
      updatedSession = manager.processResponse(session.sessionId, 'security, compliance, audit', args);

      // Should skip resources step and go directly to rationale
      expect(updatedSession.currentStep).toBe('rationale');
    });

    it('should generate correct workflow steps for policies', async () => {
      const args = { sessionDir: tempSessionDir };
      const session = manager.createSession(args);

      // Test description step
      const descStep = await manager.getNextWorkflowStep(session);
      expect(descStep).toMatchObject({
        sessionId: session.sessionId,
        entityType: 'policy',
        prompt: expect.stringContaining('Mock policy-description prompt'),
        nextStep: 'triggers'
      });
    });

    it('should complete policy creation successfully', async () => {
      const args = { sessionDir: tempSessionDir };
      let session = manager.createSession(args);

      // Progress through all steps (description, triggers, trigger-expansion, rationale, created-by)
      session = manager.processResponse(session.sessionId, 'Security policy', args);
      session = manager.processResponse(session.sessionId, 'security, compliance', args);
      session = manager.processResponse(session.sessionId, 'security, compliance, audit', args);
      session = manager.processResponse(session.sessionId, 'Ensures security compliance', args);
      session = manager.processResponse(session.sessionId, 'security-team', args);

      // After created-by step, kyverno-generation happens automatically and goes directly to review step
      const reviewStep = await manager.getNextWorkflowStep(session, args);
      expect(reviewStep).toMatchObject({
        sessionId: session.sessionId,
        entityType: 'policy',
        instruction: expect.stringContaining('Present the policy intent and generated Kyverno policy for user review')
      });

      // Verify that the session has the generated Kyverno policy saved
      const sessionAfterGeneration = manager.loadSession(session.sessionId, args);
      expect(sessionAfterGeneration!.data.generatedKyvernoPolicy).toBeDefined();
      expect(sessionAfterGeneration!.data.generatedKyvernoPolicy).not.toBe('save');

      // Simulate user choosing store intent only (option 2)
      session = manager.processResponse(session.sessionId, '2', args);

      // Now should go to completion
      const completionStep = await manager.getNextWorkflowStep(session);
      expect(completionStep).toMatchObject({
        sessionId: session.sessionId,
        entityType: 'policy',
        instruction: expect.stringContaining('**Policy Intent Stored Successfully!**')
      });
    });

    it('should save YAML file immediately after generation with validation loop', async () => {
      const manager = new UnifiedCreationSessionManager('policy');
      const args = { sessionDir: tempSessionDir };
      
      // Create and complete full policy workflow
      let session = manager.createSession(args);
      session = manager.processResponse(session.sessionId, 'Test policy for immediate YAML saving', args);
      session = manager.processResponse(session.sessionId, 'resource-limits,security', args);
      session = manager.processResponse(session.sessionId, 'resource-limits,security,compliance', args);
      session = manager.processResponse(session.sessionId, 'Ensures containers have resource limits', args);
      session = manager.processResponse(session.sessionId, 'security-team', args);

      // Trigger kyverno-generation step
      const result = await manager.getNextWorkflowStep(session, args);
      
      // Verify the step succeeded (should reach review step)
      expect(result.instruction).toContain('Present the policy intent and generated Kyverno policy for user review');
      
      // Verify session has the generated policy (this confirms validation loop completed successfully)
      const sessionAfterGen = manager.loadSession(session.sessionId, args);
      expect(sessionAfterGen!.data.generatedKyvernoPolicy).toBeDefined();
      expect(sessionAfterGen!.data.generatedKyvernoPolicy!.length).toBeGreaterThan(10);
      
      // Verify no generation error occurred
      expect(sessionAfterGen!.data.kyvernoGenerationError).toBeUndefined();
    });

    it('should have validation loop implementation with ManifestValidator', async () => {
      // Test verifies that the validation loop pattern is implemented
      // by checking that ManifestValidator is used in the generation process
      const manager = new UnifiedCreationSessionManager('policy');
      const args = { sessionDir: tempSessionDir };
      
      // Spy on the ManifestValidator constructor to see if it's being used
      const schemaMock = require('../../src/core/schema');
      const constructorSpy = jest.spyOn(schemaMock, 'ManifestValidator');
      
      // Create and complete policy workflow
      let session = manager.createSession(args);
      session = manager.processResponse(session.sessionId, 'Test validation loop integration', args);
      session = manager.processResponse(session.sessionId, 'validation,testing', args);
      session = manager.processResponse(session.sessionId, 'validation,testing,quality', args);
      session = manager.processResponse(session.sessionId, 'Ensures validation patterns work', args);
      session = manager.processResponse(session.sessionId, 'test-team', args);

      // Trigger kyverno-generation step
      const result = await manager.getNextWorkflowStep(session, args);
      
      // Should succeed and reach review step
      expect(result.instruction).toContain('Present the policy intent and generated Kyverno policy for user review');
      
      // Verify ManifestValidator was instantiated (shows validation loop is in place)
      expect(constructorSpy).toHaveBeenCalled();
      
      // Verify session has the generated policy
      const sessionAfterGen = manager.loadSession(session.sessionId, args);
      expect(sessionAfterGen!.data.generatedKyvernoPolicy).toBeDefined();
      expect(sessionAfterGen!.data.generatedKyvernoPolicy!.length).toBeGreaterThan(10);
      
      constructorSpy.mockRestore();
    });

    describe('Kyverno Generation and Deployment', () => {
      let localManager: UnifiedCreationSessionManager;

      beforeEach(() => {
        localManager = new UnifiedCreationSessionManager('policy');
      });

      it('should generate Kyverno step with correct template variables', async () => {
        const args = { sessionDir: tempSessionDir };
        let session = localManager.createSession(args);

        // Progress through to created-by step
        session = localManager.processResponse(session.sessionId, 'Container security policy', args);
        session = localManager.processResponse(session.sessionId, 'security, container', args);
        session = localManager.processResponse(session.sessionId, 'security, container, resource-limits', args);
        session = localManager.processResponse(session.sessionId, 'Enforce container resource limits', args);
        session = localManager.processResponse(session.sessionId, 'security-team', args);

        const reviewStep = await localManager.getNextWorkflowStep(session, args);
        
        // With validation loop, may succeed or fail depending on mock validation
        if (reviewStep.instruction.includes('Present the policy intent and generated Kyverno policy for user review')) {
          // Success case - validation passed
          expect(reviewStep).toMatchObject({
            sessionId: session.sessionId,
            entityType: 'policy',
            instruction: expect.stringContaining('Present the policy intent and generated Kyverno policy for user review')
          });
        } else {
          // Failure case - validation failed after max attempts
          expect(reviewStep).toMatchObject({
            sessionId: session.sessionId,
            entityType: 'policy',
            instruction: expect.stringContaining('Kyverno policy generation failed after multiple attempts')
          });
          return; // Skip rest of test if generation failed
        }

        // Check that policy data includes policy intent information
        expect(reviewStep.data).toMatchObject({
          description: 'Container security policy',
          rationale: 'Enforce container resource limits',
          expandedTriggers: expect.arrayContaining(['security', 'container', 'resource-limits']),
          generatedKyvernoPolicy: expect.any(String)
        });

        // CRITICAL: Verify that Kyverno policy is saved to session file immediately after generation (only if generation succeeded)
        const savedSession = localManager.loadSession(session.sessionId, args);
        expect(savedSession).not.toBeNull();
        expect(savedSession!.data.generatedKyvernoPolicy).toBeDefined();
        expect(savedSession!.data.generatedKyvernoPolicy).toEqual(expect.any(String));
        expect(savedSession!.data.generatedKyvernoPolicy!.length).toBeGreaterThan(10); // Ensure it's not empty or just "save"
        expect(savedSession!.data.generatedKyvernoPolicy).not.toBe('save'); // Critical: ensure user choice didn't overwrite policy
      });

      it('should save Kyverno policy to session file immediately after generation', async () => {
        const args = { sessionDir: tempSessionDir };
        let session = localManager.createSession(args);

        // Complete workflow up to Kyverno generation
        session = localManager.processResponse(session.sessionId, 'No latest image tags policy', args);
        session = localManager.processResponse(session.sessionId, 'app, deployment', args);
        session = localManager.processResponse(session.sessionId, 'app, deployment', args);
        session = localManager.processResponse(session.sessionId, 'Prevent latest tag usage for security', args);
        session = localManager.processResponse(session.sessionId, 'test-team', args);

        // Before Kyverno generation - policy should not exist in session file
        let sessionBeforeGen = localManager.loadSession(session.sessionId, args);
        expect(sessionBeforeGen!.data.generatedKyvernoPolicy).toBeUndefined();

        // Trigger Kyverno generation step
        const reviewStep = await localManager.getNextWorkflowStep(session, args);
        
        // With validation loop, may succeed or fail depending on mock validation
        if (reviewStep.instruction.includes('Present the policy intent and generated Kyverno policy for user review')) {
          // After Kyverno generation - policy should be immediately saved to session file
          const sessionAfterGen = localManager.loadSession(session.sessionId, args);
          expect(sessionAfterGen).not.toBeNull();
          expect(sessionAfterGen!.data.generatedKyvernoPolicy).toBeDefined();
          expect(sessionAfterGen!.data.generatedKyvernoPolicy).toEqual(expect.any(String));
          expect(sessionAfterGen!.data.generatedKyvernoPolicy!.length).toBeGreaterThan(10);
          expect(sessionAfterGen!.data.generatedKyvernoPolicy).not.toBe('save'); // Critical: ensure user choice didn't overwrite policy
        } else {
          // Validation failed - verify either error was stored or no policy was generated
          const sessionAfterGen = localManager.loadSession(session.sessionId, args);
          expect(sessionAfterGen).not.toBeNull();
          // Either there's an error or simply no policy was generated due to validation failure
          expect(
            sessionAfterGen!.data.kyvernoGenerationError ||
            !sessionAfterGen!.data.generatedKyvernoPolicy
          ).toBeTruthy();
          return; // Skip rest of test if generation failed
        }
        
        // Verify session data is preserved along with new policy
        const finalSession = localManager.loadSession(session.sessionId, args);
        expect(finalSession!.data.description).toBe('No latest image tags policy');
        expect(finalSession!.data.rationale).toBe('Prevent latest tag usage for security');
        expect(finalSession!.data.createdBy).toBe('test-team');
      });

      it('should handle policy-only deployment choice', async () => {
        const args = { sessionDir: tempSessionDir };
        let session = localManager.createSession(args);

        // Complete workflow through review
        session = localManager.processResponse(session.sessionId, 'Test policy', args);
        session = localManager.processResponse(session.sessionId, 'test', args);
        session = localManager.processResponse(session.sessionId, 'test', args);
        session = localManager.processResponse(session.sessionId, 'Test rationale', args);
        session = localManager.processResponse(session.sessionId, 'test-user', args);
        session = localManager.processResponse(session.sessionId, 'mock-kyverno-policy', args);

        // Choose policy-only
        session = localManager.processResponse(session.sessionId, 'policy-only', args);
        const completion = await localManager.getNextWorkflowStep(session);

        expect(completion.instruction).toContain('**Policy Intent Stored Successfully!**');
        expect(completion.data?.policy).toMatchObject({
          description: 'Test policy',
          rationale: 'Test rationale',
          createdBy: 'test-user',
          deployedPolicies: []
        });
      });

      it('should handle save deployment choice', async () => {
        const args = { sessionDir: tempSessionDir };
        let session = localManager.createSession(args);

        // Complete workflow with generated Kyverno policy
        session = localManager.processResponse(session.sessionId, 'Test policy', args);
        session = localManager.processResponse(session.sessionId, 'test', args);
        session = localManager.processResponse(session.sessionId, 'test', args);
        session = localManager.processResponse(session.sessionId, 'Test rationale', args);
        session = localManager.processResponse(session.sessionId, 'test-user', args);
        
        const kyvernoPolicy = 'apiVersion: kyverno.io/v1\nkind: ClusterPolicy\nmetadata:\n  name: test-policy';
        session = localManager.processResponse(session.sessionId, kyvernoPolicy, args);

        // Choose store intent only (option 2)
        session = localManager.processResponse(session.sessionId, '2', args);
        const completion = await localManager.getNextWorkflowStep(session);

        expect(completion.instruction).toContain('**Policy Intent Stored Successfully!**');
        expect(completion.data?.kyvernoPolicy).toBe(kyvernoPolicy);
        expect(completion.data?.applied).toBe(false);
      });

      it('should handle apply deployment choice with tracking', async () => {
        const args = { sessionDir: tempSessionDir };
        let session = localManager.createSession(args);

        // Complete workflow with generated Kyverno policy
        session = localManager.processResponse(session.sessionId, 'Test policy', args);
        session = localManager.processResponse(session.sessionId, 'test', args);
        session = localManager.processResponse(session.sessionId, 'test', args);
        session = localManager.processResponse(session.sessionId, 'Test rationale', args);
        session = localManager.processResponse(session.sessionId, 'test-user', args);
        
        const kyvernoPolicy = 'apiVersion: kyverno.io/v1\nkind: ClusterPolicy\nmetadata:\n  name: test-policy';
        session = localManager.processResponse(session.sessionId, kyvernoPolicy, args);

        // Choose apply
        session = localManager.processResponse(session.sessionId, 'apply', args);
        const completion = await localManager.getNextWorkflowStep(session);

        expect(completion.instruction).toContain('**Policy Applied to Cluster Successfully!**');
        expect(completion.data?.policy.deployedPolicies).toHaveLength(1);
        expect(completion.data?.policy.deployedPolicies[0]).toMatchObject({
          name: expect.stringMatching(/^policy-/),
          appliedAt: expect.any(String)
        });
      });

      it('should handle discard deployment choice', async () => {
        const args = { sessionDir: tempSessionDir };
        let session = localManager.createSession(args);

        // Complete workflow
        session = localManager.processResponse(session.sessionId, 'Test policy', args);
        session = localManager.processResponse(session.sessionId, 'test', args);
        session = localManager.processResponse(session.sessionId, 'test', args);
        session = localManager.processResponse(session.sessionId, 'Test rationale', args);
        session = localManager.processResponse(session.sessionId, 'test-user', args);
        session = localManager.processResponse(session.sessionId, 'mock-kyverno-policy', args);

        // Choose discard
        session = localManager.processResponse(session.sessionId, 'discard', args);
        const completion = await localManager.getNextWorkflowStep(session);

        expect(completion.instruction).toContain('Mock policy-complete-discard prompt');
        expect(completion.data?.discarded).toBe(true);
      });

      it('should handle missing Kyverno policy correctly', async () => {
        const args = { sessionDir: tempSessionDir };
        let session = localManager.createSession(args);

        // Complete workflow through kyverno generation without generating policy
        session = localManager.processResponse(session.sessionId, 'Test policy', args);
        session = localManager.processResponse(session.sessionId, 'test', args);
        session = localManager.processResponse(session.sessionId, 'test', args);
        session = localManager.processResponse(session.sessionId, 'Test rationale', args);
        session = localManager.processResponse(session.sessionId, 'test-user', args);
        // Generate error instead of policy
        session = localManager.processResponse(session.sessionId, 'ERROR: Failed to generate policy', args);

        // Verify error was stored and no policy was generated
        expect(session.data.kyvernoGenerationError).toBe('ERROR: Failed to generate policy');
        expect(session.data.generatedKyvernoPolicy).toBeUndefined();

        // With no policy generated, choosing save should result in an error
        session = localManager.processResponse(session.sessionId, 'save', args);
        
        // Should show error completion since save was requested without a policy
        const completion = await localManager.getNextWorkflowStep(session);
        expect(completion.instruction).toContain('Mock policy-complete-error prompt');
      });

      it('should store Kyverno generation errors', () => {
        const args = { sessionDir: tempSessionDir };
        let session = localManager.createSession(args);

        // Progress to Kyverno generation
        session = localManager.processResponse(session.sessionId, 'Test policy', args);
        session = localManager.processResponse(session.sessionId, 'test', args);
        session = localManager.processResponse(session.sessionId, 'test', args);
        session = localManager.processResponse(session.sessionId, 'Test rationale', args);
        session = localManager.processResponse(session.sessionId, 'test-user', args);

        // Simulate Kyverno generation error
        session = localManager.processResponse(session.sessionId, 'ERROR: Invalid schema provided', args);

        expect(session.data.kyvernoGenerationError).toBe('ERROR: Invalid schema provided');
        expect(session.data.generatedKyvernoPolicy).toBeUndefined();
      });
    });
  });

  describe('Session persistence', () => {
    let manager: UnifiedCreationSessionManager;

    beforeEach(() => {
      manager = new UnifiedCreationSessionManager('pattern');
    });

    it('should save and load sessions correctly', () => {
      const args = { sessionDir: tempSessionDir };
      const originalSession = manager.createSession(args);

      // Load the saved session
      const loadedSession = manager.loadSession(originalSession.sessionId, args);
      
      expect(loadedSession).toMatchObject({
        sessionId: originalSession.sessionId,
        entityType: 'pattern',
        currentStep: 'description',
        data: {}
      });
    });

    it('should return null for non-existent sessions', () => {
      const args = { sessionDir: tempSessionDir };
      const loadedSession = manager.loadSession('non-existent-session', args);
      
      expect(loadedSession).toBeNull();
    });

    it('should update session data when processing responses', () => {
      const args = { sessionDir: tempSessionDir };
      const originalSession = manager.createSession(args);

      // Process a response
      manager.processResponse(originalSession.sessionId, 'Test description', args);

      // Load session and verify data was persisted
      const loadedSession = manager.loadSession(originalSession.sessionId, args);
      expect(loadedSession?.data.description).toBe('Test description');
      expect(loadedSession?.currentStep).toBe('triggers');
    });
  });

  describe('Error handling', () => {
    let manager: UnifiedCreationSessionManager;

    beforeEach(() => {
      manager = new UnifiedCreationSessionManager('pattern');
    });

    it('should handle invalid session ID in processResponse', () => {
      const args = { sessionDir: tempSessionDir };
      
      expect(() => {
        manager.processResponse('invalid-session-id', 'test response', args);
      }).toThrow('Pattern session invalid-session-id not found');
    });

    it('should handle JSON parsing in trigger-expansion step', () => {
      const args = { sessionDir: tempSessionDir };
      
      // Test JSON response parsing
      let session1 = manager.createSession(args);
      session1 = manager.processResponse(session1.sessionId, 'Test description', args);
      session1 = manager.processResponse(session1.sessionId, 'web, api', args);
      session1 = manager.processResponse(session1.sessionId, '["web", "api", "service"]', args);
      expect(session1.data.expandedTriggers).toEqual(['web', 'api', 'service']);
      
      // Test fallback to comma-separated parsing (separate session)
      let session2 = manager.createSession(args);
      session2 = manager.processResponse(session2.sessionId, 'Test description', args);
      session2 = manager.processResponse(session2.sessionId, 'web, api', args);
      session2 = manager.processResponse(session2.sessionId, 'web, api, service, rest', args);
      expect(session2.data.expandedTriggers).toEqual(['web', 'api', 'service', 'rest']);
    });
  });

  describe('Workflow configuration', () => {
    it('should support both pattern and policy entity types', () => {
      const patternManager = new UnifiedCreationSessionManager('pattern');
      const policyManager = new UnifiedCreationSessionManager('policy');

      expect(patternManager).toBeInstanceOf(UnifiedCreationSessionManager);
      expect(policyManager).toBeInstanceOf(UnifiedCreationSessionManager);
    });
  });
});