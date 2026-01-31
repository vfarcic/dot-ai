/**
 * Unit tests for Qdrant base utilities
 *
 * Tests validation, result helpers, and error handling.
 */

import { describe, it, expect } from 'vitest';
import {
  QdrantValidationError,
  requireQdrantParam,
  requireEmbeddingParam,
  optionalQdrantParam,
  qdrantSuccessResult,
  qdrantErrorResult,
  withQdrantValidation,
} from '../../src/tools/qdrant-base';

describe('Qdrant Base Utilities', () => {
  describe('QdrantValidationError', () => {
    it('should create error with param and tool name', () => {
      const error = new QdrantValidationError('embedding', 'store_capability');

      expect(error.param).toBe('embedding');
      expect(error.toolName).toBe('store_capability');
      expect(error.message).toBe('store_capability requires parameter: embedding');
      expect(error.name).toBe('QdrantValidationError');
    });
  });

  describe('requireQdrantParam', () => {
    it('should return value when present', () => {
      const args = { id: 'doc-1', collection: 'capabilities' };

      const result = requireQdrantParam<string>(args, 'id', 'get_capability');

      expect(result).toBe('doc-1');
    });

    it('should throw QdrantValidationError when missing', () => {
      const args = { collection: 'capabilities' };

      expect(() => requireQdrantParam(args, 'id', 'get_capability')).toThrow(QdrantValidationError);
    });

    it('should throw for null values', () => {
      const args = { id: null };

      expect(() => requireQdrantParam(args, 'id', 'get_capability')).toThrow(QdrantValidationError);
    });

    it('should throw for empty string', () => {
      const args = { id: '' };

      expect(() => requireQdrantParam(args, 'id', 'get_capability')).toThrow(QdrantValidationError);
    });
  });

  describe('requireEmbeddingParam', () => {
    it('should return embedding array when valid', () => {
      const args = { embedding: [0.1, 0.2, 0.3] };

      const result = requireEmbeddingParam(args, 'embedding', 'store_capability');

      expect(result).toEqual([0.1, 0.2, 0.3]);
    });

    it('should throw for non-array', () => {
      const args = { embedding: 'not an array' };

      expect(() => requireEmbeddingParam(args, 'embedding', 'store_capability')).toThrow(
        QdrantValidationError
      );
    });

    it('should throw for empty array', () => {
      const args = { embedding: [] };

      expect(() => requireEmbeddingParam(args, 'embedding', 'store_capability')).toThrow(
        QdrantValidationError
      );
    });

    it('should throw for array with non-numbers', () => {
      const args = { embedding: [0.1, 'string', 0.3] };

      expect(() => requireEmbeddingParam(args, 'embedding', 'store_capability')).toThrow(
        QdrantValidationError
      );
    });
  });

  describe('optionalQdrantParam', () => {
    it('should return value when present', () => {
      const args = { limit: 20 };

      const result = optionalQdrantParam(args, 'limit', 10);

      expect(result).toBe(20);
    });

    it('should return default when undefined', () => {
      const args = {};

      const result = optionalQdrantParam(args, 'limit', 10);

      expect(result).toBe(10);
    });

    it('should return default when null', () => {
      const args = { limit: null };

      const result = optionalQdrantParam(args, 'limit', 10);

      expect(result).toBe(10);
    });

    it('should not use default for falsy but valid values', () => {
      const args = { limit: 0 };

      const result = optionalQdrantParam(args, 'limit', 10);

      expect(result).toBe(0);
    });
  });

  describe('qdrantSuccessResult', () => {
    it('should create success result with data and message', () => {
      const result = qdrantSuccessResult({ id: 'doc-1' }, 'Document retrieved successfully');

      expect(result).toEqual({
        success: true,
        data: { id: 'doc-1' },
        message: 'Document retrieved successfully',
      });
    });
  });

  describe('qdrantErrorResult', () => {
    it('should create error result with error and message', () => {
      const result = qdrantErrorResult('Document not found', 'Failed to retrieve document');

      expect(result).toEqual({
        success: false,
        error: 'Document not found',
        message: 'Failed to retrieve document',
      });
    });
  });

  describe('withQdrantValidation', () => {
    it('should pass through successful results', async () => {
      const handler = async () => qdrantSuccessResult({ id: 'doc-1' }, 'Success');
      const wrapped = withQdrantValidation(handler);

      const result = await wrapped({});

      expect(result.success).toBe(true);
    });

    it('should convert QdrantValidationError to error result', async () => {
      const handler = async (args: Record<string, unknown>) => {
        requireQdrantParam(args, 'id', 'get_capability');
        return qdrantSuccessResult(null, 'Never reached');
      };
      const wrapped = withQdrantValidation(handler);

      const result = await wrapped({});

      expect(result).toEqual({
        success: false,
        error: 'Missing required parameter: id',
        message: 'get_capability requires parameter: id',
      });
    });

    it('should re-throw non-validation errors', async () => {
      const handler = async () => {
        throw new Error('Connection failed');
      };
      const wrapped = withQdrantValidation(handler);

      await expect(wrapped({})).rejects.toThrow('Connection failed');
    });
  });
});
