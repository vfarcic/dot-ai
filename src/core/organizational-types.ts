/**
 * Shared Organizational Entity Types
 * 
 * Base interfaces and types for organizational entities (patterns and policies)
 * that enhance AI recommendations with institutional knowledge via RAG.
 */

/**
 * Base interface for all organizational entities stored in Vector DB
 * Contains shared fields used by both patterns and policies
 */
export interface BaseOrganizationalEntity {
  id: string;                   // Auto-generated UUID
  description: string;          // Detailed description for Vector DB embedding
  triggers: string[];           // User intent keywords that match this entity
  rationale: string;            // Why this entity is recommended/required
  createdAt: string;            // Auto-generated ISO 8601 timestamp
  createdBy: string;            // Author/platform engineer identifier
}

/**
 * Organizational Pattern - guides resource selection
 * Extends base entity with pattern-specific fields
 */
export interface OrganizationalPattern extends BaseOrganizationalEntity {
  suggestedResources: string[]; // Kubernetes resource types to suggest
}

/**
 * Policy Intent - guides resource configuration
 * Extends base entity with policy-specific fields
 */
export interface PolicyIntent extends BaseOrganizationalEntity {
  deployedPolicies?: DeployedPolicyReference[]; // Track applied Kyverno policies
}

/**
 * Reference to a deployed Kyverno policy
 * Stored in PolicyIntent to track lifecycle without duplicating YAML
 */
export interface DeployedPolicyReference {
  name: string;                 // Kyverno ClusterPolicy name
  appliedAt: string;           // ISO 8601 timestamp when applied to cluster
}

// For creating new patterns (omits auto-generated fields)
export type CreatePatternRequest = Omit<OrganizationalPattern, 'id' | 'createdAt'>;

// For creating new policy intents (omits auto-generated fields)
export type CreatePolicyIntentRequest = Omit<PolicyIntent, 'id' | 'createdAt' | 'deployedPolicies'>;