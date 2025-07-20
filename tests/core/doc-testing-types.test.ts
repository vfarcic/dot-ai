/**
 * Tests for Doc Testing Types
 * 
 * Tests the TypeScript interfaces and types used in documentation testing
 */

import { 
  ValidationSession, 
  WorkflowStep, 
  ValidationPhase,
  SessionStatus,
  SessionMetadata,
  PhaseResult,
  PhaseStatus,
  SectionStatus,
  SectionTestResult,
  DocumentSection
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
  });

  describe('SectionStatus Enum', () => {
    test('should have correct enum values', () => {
      expect(SectionStatus.PENDING).toBe('pending');
      expect(SectionStatus.SCANNING).toBe('scanning');
      expect(SectionStatus.TESTING).toBe('testing');
      expect(SectionStatus.ANALYZING).toBe('analyzing');
      expect(SectionStatus.FIXING).toBe('fixing');
      expect(SectionStatus.COMPLETED).toBe('completed');
      expect(SectionStatus.FAILED).toBe('failed');
    });
  });

  describe('DocumentSection Interface', () => {
    test('should accept valid DocumentSection object', () => {
      const section: DocumentSection = {
        id: 'installation',
        title: 'Installation'
      };

      expect(section.id).toBe('installation');
      expect(section.title).toBe('Installation');
    });
  });

  describe('ValidationSession Interface', () => {
    test('should accept valid ValidationSession object', () => {
      const metadata: SessionMetadata = {
        totalSections: 0,
        completedSections: 0,
        sectionStatus: {},
        sessionDir: '/tmp/sessions',
        lastUpdated: '2025-07-18T10:30:00Z',
        nextItemId: 1
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
      expect(session.metadata.totalSections).toBe(0);
      expect(session.metadata.sessionDir).toBe('/tmp/sessions');
    });

    test('should accept ValidationSession with sections and results', () => {
      const metadata: SessionMetadata = {
        totalSections: 1,
        completedSections: 0,
        sectionStatus: {'main': SectionStatus.PENDING},
        sessionDir: '/tmp/sessions',
        lastUpdated: '2025-07-18T10:30:00Z',
        nextItemId: 1
      };

      const session: ValidationSession = {
        sessionId: '2025-07-18T10-30-00-abc12345',
        filePath: 'README.md',
        startTime: '2025-07-18T10:30:00Z',
        currentPhase: ValidationPhase.TEST,
        status: SessionStatus.ACTIVE,
        reportFile: 'doc-test-report-2025-07-18T10-30-00-abc12345.md',
        metadata,
        sections: [{
          id: 'main',
          title: 'Main Section',
        }],
        sectionResults: {
          'main': {
            whatWasDone: 'Test results for main section...',
            issues: [],
            recommendations: []
          }
        }
      };

      expect(session.metadata.totalSections).toBe(1);
      expect(session.metadata.completedSections).toBe(0);
      expect(session.sections).toHaveLength(1);
      expect(session.sectionResults?.['main']).toEqual({
        whatWasDone: 'Test results for main section...',
        issues: [],
        recommendations: []
      });
    });
  });

  describe('SectionTestResult Interface', () => {
    test('should accept valid SectionTestResult object', () => {
      const result: SectionTestResult = {
        whatWasDone: 'Tested 3 installation commands and verified outputs',
        issues: [
          {
            id: 1,
            text: 'npm install command requires --global flag',
            status: 'pending'
          },
          {
            id: 2,
            text: 'Missing verification step in documentation',
            status: 'pending'
          }
        ],
        recommendations: [
          {
            id: 3,
            text: 'Add --global flag to npm install command',
            status: 'pending'
          },
          {
            id: 4,
            text: 'Include verification command example',
            status: 'pending'
          }
        ]
      };

      expect(result.whatWasDone).toBe('Tested 3 installation commands and verified outputs');
      expect(result.issues).toHaveLength(2);
      expect(result.recommendations).toHaveLength(2);
      expect(Array.isArray(result.issues)).toBe(true);
      expect(Array.isArray(result.recommendations)).toBe(true);
    });

    test('should accept empty arrays', () => {
      const result: SectionTestResult = {
        whatWasDone: 'All tests passed without issues',
        issues: [],
        recommendations: []
      };

      expect(result.issues).toHaveLength(0);
      expect(result.recommendations).toHaveLength(0);
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
      expect(workflowStep.prompt).toContain('Scan this document');
      expect(workflowStep.workflow.current).toBe(ValidationPhase.SCAN);
      expect(workflowStep.workflow.remaining).toHaveLength(3);
    });
  });

  describe('PhaseResult Interface', () => {
    test('should accept valid PhaseResult object', () => {
      const result: PhaseResult = {
        phase: ValidationPhase.SCAN,
        startTime: '2025-07-18T10:30:00Z',
        endTime: '2025-07-18T10:30:15Z',
        status: PhaseStatus.COMPLETED,
        summary: 'Scan phase completed successfully - found 3 sections',
        nextPhase: ValidationPhase.TEST,
        aiInsights: 'Document has clear section structure with installation, usage, and troubleshooting'
      };

      expect(result.phase).toBe(ValidationPhase.SCAN);
      expect(result.status).toBe(PhaseStatus.COMPLETED);
      expect(result.nextPhase).toBe(ValidationPhase.TEST);
      expect(result.summary).toContain('3 sections');
    });
  });
});