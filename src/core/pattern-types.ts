/**
 * Organizational Pattern Management Types
 * 
 * Simple TypeScript interfaces for organizational deployment patterns
 * that enhance AI recommendations with institutional knowledge via RAG.
 */

export interface OrganizationalPattern {
  id: string;                   // Auto-generated UUID
  name: string;                 // Human-readable pattern name
  description: string;          // Detailed description for Vector DB embedding
  triggers: string[];           // User intent keywords that match this pattern
  suggestedResources: string[]; // Kubernetes resource types to suggest
  rationale: string;            // Why this pattern is recommended
  createdAt: string;            // Auto-generated ISO 8601 timestamp
  createdBy: string;            // Author/platform engineer identifier
}

// For creating new patterns (omits auto-generated fields)
export type CreatePatternRequest = Omit<OrganizationalPattern, 'id' | 'createdAt'>;