/**
 * Tests for Pattern Operations
 */

import { validatePattern, createPattern, serializePattern, deserializePattern } from '../../src/core/pattern-operations';
import { CreatePatternRequest } from '../../src/core/pattern-types';

describe('Pattern Operations', () => {
  const validPatternRequest: CreatePatternRequest = {
    name: 'Stateless Application',
    description: 'Standard pattern for stateless web applications and APIs',
    triggers: ['stateless app', 'web application', 'API service'],
    suggestedResources: ['Deployment', 'Service', 'HorizontalPodAutoscaler'],
    rationale: 'Provides scalability and reliability for stateless workloads',
    createdBy: 'platform-team'
  };

  describe('validatePattern', () => {
    it('should return no errors for valid pattern', () => {
      const errors = validatePattern(validPatternRequest);
      expect(errors).toEqual([]);
    });

    it('should require pattern name', () => {
      const request = { ...validPatternRequest, name: '' };
      const errors = validatePattern(request);
      expect(errors).toContain('Pattern name is required');
    });

    it('should limit pattern name length', () => {
      const request = { ...validPatternRequest, name: 'a'.repeat(101) };
      const errors = validatePattern(request);
      expect(errors).toContain('Pattern name must be 100 characters or less');
    });

    it('should require pattern description', () => {
      const request = { ...validPatternRequest, description: '' };
      const errors = validatePattern(request);
      expect(errors).toContain('Pattern description is required');
    });

    it('should require at least one trigger', () => {
      const request = { ...validPatternRequest, triggers: [] };
      const errors = validatePattern(request);
      expect(errors).toContain('At least one trigger is required');
    });

    it('should reject empty triggers', () => {
      const request = { ...validPatternRequest, triggers: ['valid', '', 'also valid'] };
      const errors = validatePattern(request);
      expect(errors).toContain('All triggers must be non-empty');
    });

    it('should require at least one suggested resource', () => {
      const request = { ...validPatternRequest, suggestedResources: [] };
      const errors = validatePattern(request);
      expect(errors).toContain('At least one suggested resource is required');
    });

    it('should require rationale', () => {
      const request = { ...validPatternRequest, rationale: '' };
      const errors = validatePattern(request);
      expect(errors).toContain('Pattern rationale is required');
    });

    it('should require createdBy', () => {
      const request = { ...validPatternRequest, createdBy: '' };
      const errors = validatePattern(request);
      expect(errors).toContain('Pattern creator is required');
    });
  });

  describe('createPattern', () => {
    it('should create valid pattern with auto-generated fields', () => {
      const pattern = createPattern(validPatternRequest);
      
      expect(pattern.id).toBeDefined();
      expect(pattern.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      expect(pattern.createdAt).toBeDefined();
      expect(new Date(pattern.createdAt)).toBeInstanceOf(Date);
      
      expect(pattern.name).toBe(validPatternRequest.name);
      expect(pattern.description).toBe(validPatternRequest.description);
      expect(pattern.triggers).toEqual(validPatternRequest.triggers);
      expect(pattern.suggestedResources).toEqual(validPatternRequest.suggestedResources);
      expect(pattern.rationale).toBe(validPatternRequest.rationale);
      expect(pattern.createdBy).toBe(validPatternRequest.createdBy);
    });

    it('should trim whitespace from string fields', () => {
      const request = {
        ...validPatternRequest,
        name: '  Trimmed Name  ',
        description: '  Trimmed Description  ',
        rationale: '  Trimmed Rationale  ',
        createdBy: '  trimmed-user  '
      };
      
      const pattern = createPattern(request);
      
      expect(pattern.name).toBe('Trimmed Name');
      expect(pattern.description).toBe('Trimmed Description');
      expect(pattern.rationale).toBe('Trimmed Rationale');
      expect(pattern.createdBy).toBe('trimmed-user');
    });

    it('should filter empty triggers after trimming', () => {
      const request = {
        ...validPatternRequest,
        triggers: ['valid', '  ', 'also valid', '']
      };
      
      const pattern = createPattern(request);
      expect(pattern.triggers).toEqual(['valid', 'also valid']);
    });

    it('should throw error for invalid pattern', () => {
      const request = { ...validPatternRequest, name: '' };
      
      expect(() => createPattern(request)).toThrow('Pattern validation failed');
    });
  });

  describe('serializePattern', () => {
    it('should serialize pattern to JSON', () => {
      const pattern = createPattern(validPatternRequest);
      const json = serializePattern(pattern);
      
      expect(() => JSON.parse(json)).not.toThrow();
      const parsed = JSON.parse(json);
      expect(parsed.name).toBe(pattern.name);
      expect(parsed.id).toBe(pattern.id);
    });
  });

  describe('deserializePattern', () => {
    it('should deserialize valid pattern JSON', () => {
      const originalPattern = createPattern(validPatternRequest);
      const json = serializePattern(originalPattern);
      const deserializedPattern = deserializePattern(json);
      
      expect(deserializedPattern).toEqual(originalPattern);
    });

    it('should throw error for invalid JSON structure', () => {
      const invalidJson = JSON.stringify({ name: 'incomplete' });
      
      expect(() => deserializePattern(invalidJson)).toThrow('Invalid pattern JSON structure');
    });

    it('should throw error for malformed JSON', () => {
      const malformedJson = '{ "name": "test"';
      
      expect(() => deserializePattern(malformedJson)).toThrow();
    });
  });
});