/**
 * Tests for Doc Testing Types
 * 
 * Tests the TypeScript interfaces and types used in documentation testing
 */

import { 
  ValidationSession, 
  ValidationItem, 
  WorkflowStep, 
  ValidationPhase,
  SessionStatus,
  ItemStatus,
  SessionMetadata,
  TestResult,
  PhaseResult,
  PhaseStatus
} from '../../src/core/doc-testing-types';

describe('Doc Testing Types', () => {
  describe('ValidationPhase Enum', () => {
    test('should have correct enum values', () => {
      expect(ValidationPhase.SCAN).toBe('scan');
      expect(ValidationPhase.TEST).toBe('test');
      expect(ValidationPhase.ANALYZE).toBe('analyze');
      expect(ValidationPhase.FIX).toBe('fix');
    });

    test('should have all expected phases', () => {
      const phases = Object.values(ValidationPhase);
      expect(phases).toHaveLength(4);
      expect(phases).toContain('scan');
      expect(phases).toContain('test');
      expect(phases).toContain('analyze');
      expect(phases).toContain('fix');
    });
  });

  describe('SessionStatus Enum', () => {
    test('should have correct enum values', () => {
      expect(SessionStatus.ACTIVE).toBe('active');
      expect(SessionStatus.COMPLETED).toBe('completed');
      expect(SessionStatus.FAILED).toBe('failed');
      expect(SessionStatus.PAUSED).toBe('paused');
    });

    test('should have all expected statuses', () => {
      const statuses = Object.values(SessionStatus);
      expect(statuses).toHaveLength(4);
      expect(statuses).toContain('active');
      expect(statuses).toContain('completed');
      expect(statuses).toContain('failed');
      expect(statuses).toContain('paused');
    });
  });

  describe('ItemStatus Enum', () => {
    test('should have correct enum values', () => {
      expect(ItemStatus.PENDING).toBe('pending');
      expect(ItemStatus.TESTING).toBe('testing');
      expect(ItemStatus.PASSED).toBe('passed');
      expect(ItemStatus.FAILED).toBe('failed');
      expect(ItemStatus.SKIPPED).toBe('skipped');
      expect(ItemStatus.BLOCKED).toBe('blocked');
    });

    test('should have all expected statuses', () => {
      const statuses = Object.values(ItemStatus);
      expect(statuses).toHaveLength(6);
      expect(statuses).toContain('pending');
      expect(statuses).toContain('testing');
      expect(statuses).toContain('passed');
      expect(statuses).toContain('failed');
      expect(statuses).toContain('skipped');
      expect(statuses).toContain('blocked');
    });
  });

  describe('ValidationItem Interface', () => {
    test('should accept valid ValidationItem object', () => {
      const validationItem: ValidationItem = {
        id: 'test-item-1',
        type: 'bash-command',
        category: 'command',
        content: 'npm install',
        context: 'Installation instructions',
        lineNumber: 42,
        status: ItemStatus.PENDING,
        dependencies: ['test-item-0'],
        metadata: {
          language: 'bash',
          executable: true,
          requiresSetup: false
        }
      };

      expect(validationItem.id).toBe('test-item-1');
      expect(validationItem.type).toBe('bash-command');
      expect(validationItem.category).toBe('command');
      expect(validationItem.content).toBe('npm install');
      expect(validationItem.context).toBe('Installation instructions');
      expect(validationItem.lineNumber).toBe(42);
      expect(validationItem.dependencies).toEqual(['test-item-0']);
      expect(validationItem.metadata).toEqual({
        language: 'bash',
        executable: true,
        requiresSetup: false
      });
    });

    test('should accept ValidationItem with minimal required fields', () => {
      const minimalItem: ValidationItem = {
        id: 'minimal-item',
        type: 'text-check',
        content: 'Some text content',
        status: ItemStatus.PENDING,
        dependencies: [],
        metadata: {}
      };

      expect(minimalItem.id).toBe('minimal-item');
      expect(minimalItem.type).toBe('text-check');
      expect(minimalItem.content).toBe('Some text content');
      expect(minimalItem.status).toBe(ItemStatus.PENDING);
      expect(minimalItem.dependencies).toEqual([]);
      expect(minimalItem.metadata).toEqual({});
    });

    test('should accept ValidationItem with optional fields', () => {
      const itemWithOptionals: ValidationItem = {
        id: 'optional-item',
        type: 'curl-request',
        content: 'curl -X GET https://api.example.com',
        category: 'api-call',
        context: 'API testing section',
        lineNumber: 15,
        status: ItemStatus.PENDING,
        dependencies: [],
        metadata: {
          url: 'https://api.example.com',
          method: 'GET'
        }
      };

      expect(itemWithOptionals.category).toBe('api-call');
      expect(itemWithOptionals.context).toBe('API testing section');
      expect(itemWithOptionals.lineNumber).toBe(15);
      expect(itemWithOptionals.dependencies).toEqual([]);
      expect(itemWithOptionals.metadata).toEqual({
        url: 'https://api.example.com',
        method: 'GET'
      });
    });
  });

  describe('ValidationSession Interface', () => {
    test('should accept valid ValidationSession object', () => {
      const metadata: SessionMetadata = {
        totalItems: 0,
        completedItems: 0,
        skippedItems: 0,
        blockedItems: 0,
        pendingItems: 0,
        sessionDir: '/tmp/sessions',
        lastUpdated: '2025-07-18T10:30:00Z'
      };

      const session: ValidationSession = {
        sessionId: '2025-07-18T10-30-00-abc12345',
        filePath: 'README.md',
        startTime: '2025-07-18T10:30:00Z',
        currentPhase: ValidationPhase.SCAN,
        status: SessionStatus.ACTIVE,
        reportFile: 'doc-test-report-2025-07-18T10-30-00-abc12345.md',
        metadata
      };

      expect(session.sessionId).toBe('2025-07-18T10-30-00-abc12345');
      expect(session.filePath).toBe('README.md');
      expect(session.startTime).toBe('2025-07-18T10:30:00Z');
      expect(session.currentPhase).toBe(ValidationPhase.SCAN);
      expect(session.status).toBe(SessionStatus.ACTIVE);
      expect(session.reportFile).toBe('doc-test-report-2025-07-18T10-30-00-abc12345.md');
      expect(session.metadata.totalItems).toBe(0);
      expect(session.metadata.sessionDir).toBe('/tmp/sessions');
    });

    test('should accept ValidationSession with proper metadata', () => {
      const metadata: SessionMetadata = {
        totalItems: 2,
        completedItems: 0,
        skippedItems: 0,
        blockedItems: 0,
        pendingItems: 2,
        sessionDir: '/tmp/sessions',
        lastUpdated: '2025-07-18T10:30:00Z'
      };

      const session: ValidationSession = {
        sessionId: '2025-07-18T10-30-00-abc12345',
        filePath: 'README.md',
        startTime: '2025-07-18T10:30:00Z',
        currentPhase: ValidationPhase.TEST,
        status: SessionStatus.ACTIVE,
        reportFile: 'doc-test-report-2025-07-18T10-30-00-abc12345.md',
        metadata
      };

      expect(session.metadata.totalItems).toBe(2);
      expect(session.metadata.completedItems).toBe(0);
      expect(session.metadata.pendingItems).toBe(2);
      expect(session.metadata.sessionDir).toBe('/tmp/sessions');
    });

    test('should accept ValidationSession with completed status', () => {
      const metadata: SessionMetadata = {
        totalItems: 5,
        completedItems: 5,
        skippedItems: 0,
        blockedItems: 0,
        pendingItems: 0,
        sessionDir: '/tmp/sessions',
        lastUpdated: '2025-07-18T10:35:00Z'
      };

      const session: ValidationSession = {
        sessionId: '2025-07-18T10-30-00-abc12345',
        filePath: 'README.md',
        startTime: '2025-07-18T10:30:00Z',
        currentPhase: ValidationPhase.FIX,
        status: SessionStatus.COMPLETED,
        reportFile: 'doc-test-report-2025-07-18T10-30-00-abc12345.md',
        metadata
      };

      expect(session.status).toBe(SessionStatus.COMPLETED);
      expect(session.metadata.completedItems).toBe(5);
      expect(session.metadata.pendingItems).toBe(0);
    });
  });

  describe('WorkflowStep Interface', () => {
    test('should accept valid WorkflowStep object', () => {
      const workflowStep: WorkflowStep = {
        sessionId: '2025-07-18T10-30-00-abc12345',
        phase: ValidationPhase.SCAN,
        nextPhase: ValidationPhase.TEST,
        prompt: 'Scan this document for testable items...',
        workflow: {
          completed: [],
          current: ValidationPhase.SCAN,
          remaining: [ValidationPhase.TEST, ValidationPhase.ANALYZE, ValidationPhase.FIX]
        }
      };

      expect(workflowStep.sessionId).toBe('2025-07-18T10-30-00-abc12345');
      expect(workflowStep.phase).toBe(ValidationPhase.SCAN);
      expect(workflowStep.nextPhase).toBe(ValidationPhase.TEST);
      expect(workflowStep.prompt).toBe('Scan this document for testable items...');
      expect(workflowStep.workflow.completed).toEqual([]);
      expect(workflowStep.workflow.current).toBe(ValidationPhase.SCAN);
      expect(workflowStep.workflow.remaining).toEqual([ValidationPhase.TEST, ValidationPhase.ANALYZE, ValidationPhase.FIX]);
    });

    test('should accept WorkflowStep with completed phases', () => {
      const workflowStep: WorkflowStep = {
        sessionId: '2025-07-18T10-30-00-abc12345',
        phase: ValidationPhase.ANALYZE,
        nextPhase: ValidationPhase.FIX,
        prompt: 'Analyze the test results...',
        workflow: {
          completed: [ValidationPhase.SCAN, ValidationPhase.TEST],
          current: ValidationPhase.ANALYZE,
          remaining: [ValidationPhase.FIX]
        }
      };

      expect(workflowStep.workflow.completed).toEqual([ValidationPhase.SCAN, ValidationPhase.TEST]);
      expect(workflowStep.workflow.current).toBe(ValidationPhase.ANALYZE);
      expect(workflowStep.workflow.remaining).toEqual([ValidationPhase.FIX]);
    });

    test('should accept WorkflowStep with optional fields', () => {
      const workflowStep: WorkflowStep = {
        sessionId: '2025-07-18T10-30-00-abc12345',
        phase: ValidationPhase.FIX,
        nextPhase: ValidationPhase.SCAN,
        prompt: 'Fix the issues found...',
        workflow: {
          completed: [ValidationPhase.SCAN, ValidationPhase.TEST, ValidationPhase.ANALYZE],
          current: ValidationPhase.FIX,
          remaining: []
        },
        data: {
          issuesFound: 3,
          autoFixable: 1
        }
      };

      expect(workflowStep.data).toEqual({
        issuesFound: 3,
        autoFixable: 1
      });
    });
  });

  describe('Type Flexibility', () => {
    test('should allow string types for validation item type', () => {
      const item: ValidationItem = {
        id: 'flexible-item',
        type: 'custom-validation-type',
        content: 'custom content',
        status: ItemStatus.PENDING,
        dependencies: [],
        metadata: {}
      };

      expect(item.type).toBe('custom-validation-type');
    });

    test('should allow string types for validation item category', () => {
      const item: ValidationItem = {
        id: 'flexible-item',
        type: 'test-type',
        content: 'test content',
        category: 'custom-category',
        status: ItemStatus.PENDING,
        dependencies: [],
        metadata: {}
      };

      expect(item.category).toBe('custom-category');
    });

    test('should allow flexible metadata objects', () => {
      const item: ValidationItem = {
        id: 'flexible-item',
        type: 'test-type',
        content: 'test content',
        status: ItemStatus.PENDING,
        dependencies: [],
        metadata: {
          customField: 'custom value',
          numericField: 42,
          booleanField: true,
          arrayField: [1, 2, 3]
        }
      };

      expect(item.metadata.customField).toBe('custom value');
      expect(item.metadata.numericField).toBe(42);
      expect(item.metadata.booleanField).toBe(true);
      expect(item.metadata.arrayField).toEqual([1, 2, 3]);
    });
  });

  describe('Type Completeness', () => {
    test('should cover all essential fields for documentation testing', () => {
      // Test that our types cover the essential fields mentioned in the PRD
      const metadata: SessionMetadata = {
        totalItems: 0,
        completedItems: 0,
        skippedItems: 0,
        blockedItems: 0,
        pendingItems: 0,
        sessionDir: '/tmp/sessions',
        lastUpdated: '2025-07-18T10:30:00Z'
      };

      const session: ValidationSession = {
        sessionId: '2025-07-18T10-30-00-abc12345',
        filePath: 'README.md',
        startTime: '2025-07-18T10:30:00Z',
        currentPhase: ValidationPhase.SCAN,
        status: SessionStatus.ACTIVE,
        reportFile: 'doc-test-report-2025-07-18T10-30-00-abc12345.md',
        metadata
      };

      // Verify all PRD-required fields are present
      expect(session).toHaveProperty('sessionId');
      expect(session).toHaveProperty('filePath');
      expect(session).toHaveProperty('startTime');
      expect(session).toHaveProperty('currentPhase');
      expect(session).toHaveProperty('status');
      expect(session).toHaveProperty('reportFile');
      expect(session).toHaveProperty('metadata');
    });

    test('should support all documented validation phases', () => {
      const phases = [
        ValidationPhase.SCAN,
        ValidationPhase.TEST,
        ValidationPhase.ANALYZE,
        ValidationPhase.FIX
      ];

      phases.forEach(phase => {
        const workflowStep: WorkflowStep = {
          sessionId: '2025-07-18T10-30-00-abc12345',
          phase,
          nextPhase: ValidationPhase.SCAN,
          prompt: `Prompt for ${phase}`,
          workflow: {
            completed: [],
            current: phase,
            remaining: []
          }
        };

        expect(workflowStep.phase).toBe(phase);
      });
    });
  });
});