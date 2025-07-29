/**
 * Core Pattern Operations
 * 
 * Basic operations for creating, validating, and managing organizational patterns
 */

import { OrganizationalPattern, CreatePatternRequest } from './pattern-types';
import { randomUUID } from 'crypto';

// Simple validation function
export function validatePattern(request: CreatePatternRequest): string[] {
  const errors: string[] = [];

  if (!request.name || request.name.trim().length === 0) {
    errors.push('Pattern name is required');
  }
  if (request.name && request.name.length > 100) {
    errors.push('Pattern name must be 100 characters or less');
  }

  if (!request.description || request.description.trim().length === 0) {
    errors.push('Pattern description is required');
  }

  if (!request.triggers || request.triggers.length === 0) {
    errors.push('At least one trigger is required');
  }
  if (request.triggers && request.triggers.some(t => !t || t.trim().length === 0)) {
    errors.push('All triggers must be non-empty');
  }

  if (!request.suggestedResources || request.suggestedResources.length === 0) {
    errors.push('At least one suggested resource is required');
  }

  if (!request.rationale || request.rationale.trim().length === 0) {
    errors.push('Pattern rationale is required');
  }

  if (!request.createdBy || request.createdBy.trim().length === 0) {
    errors.push('Pattern creator is required');
  }

  return errors;
}

// Create a new pattern from request
export function createPattern(request: CreatePatternRequest): OrganizationalPattern {
  // Pre-process request to clean up data before validation
  const cleanRequest = {
    ...request,
    name: request.name?.trim() || '',
    description: request.description?.trim() || '',
    triggers: request.triggers?.map(t => t?.trim()).filter(t => t && t.length > 0) || [],
    rationale: request.rationale?.trim() || '',
    createdBy: request.createdBy?.trim() || ''
  };

  const errors = validatePattern(cleanRequest);
  if (errors.length > 0) {
    throw new Error(`Pattern validation failed: ${errors.join(', ')}`);
  }

  return {
    id: randomUUID(),
    name: cleanRequest.name,
    description: cleanRequest.description,
    triggers: cleanRequest.triggers,
    suggestedResources: cleanRequest.suggestedResources,
    rationale: cleanRequest.rationale,
    createdAt: new Date().toISOString(),
    createdBy: cleanRequest.createdBy
  };
}

// Serialize pattern to JSON
export function serializePattern(pattern: OrganizationalPattern): string {
  return JSON.stringify(pattern, null, 2);
}

// Deserialize pattern from JSON
export function deserializePattern(json: string): OrganizationalPattern {
  const parsed = JSON.parse(json);
  
  // Basic structure validation
  if (!parsed.id || !parsed.name || !parsed.description || 
      !Array.isArray(parsed.triggers) || !Array.isArray(parsed.suggestedResources) ||
      !parsed.rationale || !parsed.createdAt || !parsed.createdBy) {
    throw new Error('Invalid pattern JSON structure');
  }

  return parsed as OrganizationalPattern;
}