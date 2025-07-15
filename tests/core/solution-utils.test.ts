/**
 * Tests for Solution Utils
 */

import { extractUserAnswers, sanitizeIntentForLabel, generateDotAiLabels, addDotAiLabels } from '../../src/core/solution-utils';

describe('Solution Utils', () => {
  describe('extractUserAnswers', () => {
    it('should extract answers from all question categories', () => {
      const solution = {
        questions: {
          required: [
            { id: 'name', answer: 'my-app' },
            { id: 'namespace', answer: 'production' }
          ],
          basic: [
            { id: 'replicas', answer: 3 },
            { id: 'port', answer: 8080 }
          ],
          advanced: [
            { id: 'scaling', answer: true },
            { id: 'monitoring', answer: null } // null should be excluded
          ],
          open: {
            answer: 'add persistent storage'
          }
        }
      };

      const result = extractUserAnswers(solution);

      expect(result).toEqual({
        name: 'my-app',
        namespace: 'production',
        replicas: 3,
        port: 8080,
        scaling: true,
        open: 'add persistent storage'
      });
    });

    it('should handle missing question categories', () => {
      const solution = {
        questions: {
          required: [
            { id: 'name', answer: 'test-app' }
          ]
          // missing basic, advanced, open
        }
      };

      const result = extractUserAnswers(solution);

      expect(result).toEqual({
        name: 'test-app'
      });
    });

    it('should exclude undefined and null answers', () => {
      const solution = {
        questions: {
          required: [
            { id: 'name', answer: 'my-app' },
            { id: 'namespace', answer: undefined },
            { id: 'port', answer: null }
          ],
          basic: [],
          advanced: [],
          open: {
            answer: undefined
          }
        }
      };

      const result = extractUserAnswers(solution);

      expect(result).toEqual({
        name: 'my-app'
      });
    });

    it('should handle empty solution', () => {
      const solution = {
        questions: {
          required: [],
          basic: [],
          advanced: []
        }
      };

      const result = extractUserAnswers(solution);

      expect(result).toEqual({});
    });
  });

  describe('sanitizeIntentForLabel', () => {
    it('should sanitize intent for Kubernetes label format', () => {
      const intent = 'Deploy a Web Application with Redis Cache';
      const result = sanitizeIntentForLabel(intent);
      
      expect(result).toBe('deploy-a-web-application-with-redis-cache');
    });

    it('should handle special characters and spaces', () => {
      const intent = 'Deploy my-app (with database) & monitoring!';
      const result = sanitizeIntentForLabel(intent);
      
      expect(result).toBe('deploy-my-app--with-database----monitoring');
    });

    it('should truncate to 63 characters', () => {
      const intent = 'This is a very long intent that should be truncated to fit within the 63 character limit for Kubernetes labels';
      const result = sanitizeIntentForLabel(intent);
      
      expect(result).toHaveLength(63);
      expect(result).toBe('this-is-a-very-long-intent-that-should-be-truncated-to-fit-with');
    });

    it('should remove leading and trailing hyphens', () => {
      const intent = '!!!Deploy app!!!';
      const result = sanitizeIntentForLabel(intent);
      
      expect(result).toBe('deploy-app');
    });

    it('should handle empty string', () => {
      const intent = '';
      const result = sanitizeIntentForLabel(intent);
      
      expect(result).toBe('');
    });

    it('should handle only special characters', () => {
      const intent = '!@#$%^&*()';
      const result = sanitizeIntentForLabel(intent);
      
      expect(result).toBe('');
    });
  });

  describe('generateDotAiLabels', () => {
    it('should generate standard dot-ai labels', () => {
      const userAnswers = { name: 'my-app' };
      const solution = { intent: 'Deploy a web application' };
      
      const result = generateDotAiLabels(userAnswers, solution);
      
      expect(result).toEqual({
        'dot-ai.io/managed': 'true',
        'dot-ai.io/app-name': 'my-app',
        'dot-ai.io/intent': 'deploy-a-web-application'
      });
    });

    it('should throw error when app name is missing', () => {
      const userAnswers = {};
      const solution = { intent: 'Deploy a web application' };
      
      expect(() => generateDotAiLabels(userAnswers, solution)).toThrow(
        'Application name is required for dot-ai labels. This indicates a bug in the MCP workflow.'
      );
    });

    it('should throw error when intent is missing', () => {
      const userAnswers = { name: 'my-app' };
      const solution = {};
      
      expect(() => generateDotAiLabels(userAnswers, solution)).toThrow(
        'Application intent is required for dot-ai labels. This indicates a bug in the solution data.'
      );
    });

    it('should throw error when both are missing', () => {
      const userAnswers = {};
      const solution = {};
      
      expect(() => generateDotAiLabels(userAnswers, solution)).toThrow(
        'Application name is required for dot-ai labels. This indicates a bug in the MCP workflow.'
      );
    });
  });

  describe('addDotAiLabels', () => {
    it('should add dot-ai labels to existing labels', () => {
      const existingLabels = { 'app': 'my-app', 'version': 'v1.0' };
      const userAnswers = { name: 'my-app' };
      const solution = { intent: 'Deploy web app' };
      
      const result = addDotAiLabels(existingLabels, userAnswers, solution);
      
      expect(result).toEqual({
        'app': 'my-app',
        'version': 'v1.0',
        'dot-ai.io/managed': 'true',
        'dot-ai.io/app-name': 'my-app',
        'dot-ai.io/intent': 'deploy-web-app'
      });
    });

    it('should handle undefined existing labels', () => {
      const userAnswers = { name: 'my-app' };
      const solution = { intent: 'Deploy web app' };
      
      const result = addDotAiLabels(undefined, userAnswers, solution);
      
      expect(result).toEqual({
        'dot-ai.io/managed': 'true',
        'dot-ai.io/app-name': 'my-app',
        'dot-ai.io/intent': 'deploy-web-app'
      });
    });

    it('should override existing dot-ai labels', () => {
      const existingLabels = { 
        'app': 'my-app',
        'dot-ai.io/managed': 'false',
        'dot-ai.io/app-name': 'old-name'
      };
      const userAnswers = { name: 'new-app' };
      const solution = { intent: 'Deploy web app' };
      
      const result = addDotAiLabels(existingLabels, userAnswers, solution);
      
      expect(result).toEqual({
        'app': 'my-app',
        'dot-ai.io/managed': 'true',
        'dot-ai.io/app-name': 'new-app',
        'dot-ai.io/intent': 'deploy-web-app'
      });
    });

    it('should propagate errors from generateDotAiLabels', () => {
      const userAnswers = {};
      const solution = { intent: 'Deploy web app' };
      
      expect(() => addDotAiLabels(undefined, userAnswers, solution)).toThrow(
        'Application name is required for dot-ai labels. This indicates a bug in the MCP workflow.'
      );
    });
  });
});