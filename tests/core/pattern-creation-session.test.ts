/**
 * Tests for Pattern Creation Session Manager
 */

import { PatternCreationSessionManager } from '../../src/core/pattern-creation-session';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('PatternCreationSessionManager', () => {
  let testSessionDir: string;
  let sessionManager: PatternCreationSessionManager;

  beforeEach(() => {
    // Create a unique test directory for each test
    testSessionDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dot-ai-pattern-test-'));
    process.env.DOT_AI_SESSION_DIR = testSessionDir;
    sessionManager = new PatternCreationSessionManager();
  });

  afterEach(() => {
    // Clean up test directory
    if (fs.existsSync(testSessionDir)) {
      fs.rmSync(testSessionDir, { recursive: true, force: true });
    }
    delete process.env.DOT_AI_SESSION_DIR;
  });

  describe('Session Creation', () => {
    it('should create a new pattern creation session', () => {
      const session = sessionManager.createSession({});
      
      expect(session.sessionId).toBeDefined();
      expect(session.currentStep).toBe('description');
      expect(session.data).toEqual({});
      expect(session.createdAt).toBeDefined();
      expect(session.updatedAt).toBeDefined();
    });

    it('should get first workflow step after session creation', () => {
      const session = sessionManager.createSession({});
      const firstStep = sessionManager.getNextStep(session.sessionId, {});
      
      expect(firstStep).toBeDefined();
      expect(firstStep!.step).toBe('description');
      expect(firstStep!.prompt).toContain('What deployment capability does this pattern provide');
      expect(firstStep!.nextStep).toBe('triggers');
    });
  });

  describe('Workflow Progression', () => {
    it('should progress through workflow steps with user responses', () => {
      const session = sessionManager.createSession({});
      
      // Step 1: Description
      let step = sessionManager.processResponse(session.sessionId, 'Horizontal scaling', {});
      expect(step!.step).toBe('triggers');
      expect(step!.prompt).toContain('What keywords or phrases should trigger this pattern');
      
      // Step 2: Triggers  
      step = sessionManager.processResponse(session.sessionId, 'scaling, autoscaling, scale', {});
      expect(step!.step).toBe('trigger-expansion');
      expect(step!.prompt).toContain('additional related terms');
      
      // Step 3: Trigger expansion (user confirms)
      step = sessionManager.processResponse(session.sessionId, 'include: HPA, horizontal pod autoscaler', {});
      expect(step!.step).toBe('resources');
      expect(step!.prompt).toContain('Kubernetes resources should be suggested');
    });
  });

  describe('Session Persistence', () => {
    it('should save and load sessions from disk', () => {
      const session = sessionManager.createSession({});
      
      // Process a response to change session state
      sessionManager.processResponse(session.sessionId, 'Database persistence', {});
      
      // Load session and verify state
      const loadedSession = sessionManager.loadSession(session.sessionId, {});
      expect(loadedSession).toBeDefined();
      expect(loadedSession!.currentStep).toBe('triggers');
      expect(loadedSession!.data.description).toBe('Database persistence');
    });

    it('should return null for non-existent sessions', () => {
      const loadedSession = sessionManager.loadSession('non-existent', {});
      expect(loadedSession).toBeNull();
    });
  });
});