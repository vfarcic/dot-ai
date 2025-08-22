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

    it('should generate correct workflow steps for patterns', () => {
      const args = { sessionDir: tempSessionDir };
      const session = manager.createSession(args);

      // Test description step
      const descStep = manager.getNextWorkflowStep(session);
      expect(descStep).toMatchObject({
        sessionId: session.sessionId,
        entityType: 'pattern',
        step: 'description',
        prompt: expect.stringContaining('Mock pattern-description prompt'),
        nextStep: 'triggers'
      });

      // Progress to triggers and test
      const updatedSession = manager.processResponse(session.sessionId, 'Test description', args);
      const triggersStep = manager.getNextWorkflowStep(updatedSession);
      expect(triggersStep).toMatchObject({
        step: 'triggers',
        prompt: expect.stringContaining('Mock pattern-triggers prompt'),
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

    it('should generate correct workflow steps for policies', () => {
      const args = { sessionDir: tempSessionDir };
      const session = manager.createSession(args);

      // Test description step
      const descStep = manager.getNextWorkflowStep(session);
      expect(descStep).toMatchObject({
        sessionId: session.sessionId,
        entityType: 'policy',
        step: 'description',
        prompt: expect.stringContaining('Mock policy-description prompt'),
        nextStep: 'triggers'
      });
    });

    it('should complete policy creation successfully', () => {
      const args = { sessionDir: tempSessionDir };
      let session = manager.createSession(args);

      // Progress through all steps
      session = manager.processResponse(session.sessionId, 'Security policy', args);
      session = manager.processResponse(session.sessionId, 'security, compliance', args);
      session = manager.processResponse(session.sessionId, 'security, compliance, audit', args);
      session = manager.processResponse(session.sessionId, 'Ensures security compliance', args);
      session = manager.processResponse(session.sessionId, 'security-team', args);
      session = manager.processResponse(session.sessionId, 'confirmed', args);

      // Test completion
      const completionStep = manager.getNextWorkflowStep(session);
      expect(completionStep).toMatchObject({
        sessionId: session.sessionId,
        entityType: 'policy',
        instruction: expect.stringContaining('Mock policy-complete-success prompt')
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