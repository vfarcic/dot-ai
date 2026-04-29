import { describe, it, expect } from 'vitest';
import { validateAnswer } from '../../../src/tools/answer-question';
import type { Question } from '../../../src/core/schema';

describe('validateAnswer', () => {
  describe('Issue #474: select questions with explicit empty-string option', () => {
    it("accepts answer='' when type='select', required=true, and '' is in options", () => {
      const question: Question = {
        id: 'pod-anti-affinity',
        question: 'Pod anti-affinity strategy for Prometheus replicas',
        type: 'select',
        options: ['', 'soft', 'hard'],
        validation: { required: true },
      } as Question;

      expect(validateAnswer('', question)).toBeNull();
    });

    it("rejects answer='' when type='select', required=true, but '' is NOT in options", () => {
      const question: Question = {
        id: 'service-type',
        question: 'What type of Kubernetes Service should Prometheus use?',
        type: 'select',
        options: ['ClusterIP', 'NodePort', 'LoadBalancer'],
        validation: { required: true },
      } as Question;

      expect(validateAnswer('', question)).toContain('required');
    });

    it("rejects answer='' for required text questions (empty option exception only applies to select)", () => {
      const question: Question = {
        id: 'name',
        question: 'What is the name?',
        type: 'text',
        validation: { required: true },
      } as Question;

      expect(validateAnswer('', question)).toContain('required');
    });

    it('still validates that select answer is in options list', () => {
      const question: Question = {
        id: 'pod-anti-affinity',
        question: 'Pod anti-affinity strategy',
        type: 'select',
        options: ['', 'soft', 'hard'],
        validation: { required: true },
      } as Question;

      expect(validateAnswer('invalid-choice', question)).toContain(
        'must be one of'
      );
    });
  });
});
