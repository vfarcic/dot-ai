/**
 * Policy Vector Service
 * 
 * Handles policy intent-specific Vector DB operations
 * Extends BaseVectorService for policy intents
 */

import { PolicyIntent, DeployedPolicyReference } from './organizational-types';
import { EmbeddingService } from './embedding-service';
import { BaseVectorService, BaseSearchOptions, BaseSearchResult } from './base-vector-service';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface PolicySearchOptions extends BaseSearchOptions {}
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface PolicySearchResult extends BaseSearchResult<PolicyIntent> {}

export class PolicyVectorService extends BaseVectorService<PolicyIntent> {
  constructor(embeddingService?: EmbeddingService) {
    super('policies', embeddingService);
  }

  // Implement abstract methods from BaseVectorService
  protected createSearchText(policyIntent: PolicyIntent): string {
    const triggerText = policyIntent.triggers.join(' ');
    
    return `${policyIntent.description} ${triggerText} ${policyIntent.rationale}`.toLowerCase();
  }

  protected extractId(policyIntent: PolicyIntent): string {
    return policyIntent.id;
  }

  protected createPayload(policyIntent: PolicyIntent): Record<string, unknown> {
    return {
      description: policyIntent.description,
      triggers: policyIntent.triggers.map(t => t.toLowerCase()),
      rationale: policyIntent.rationale,  
      createdAt: policyIntent.createdAt,
      createdBy: policyIntent.createdBy,
      deployedPolicies: policyIntent.deployedPolicies || []
    };
  }

  protected payloadToData(payload: Record<string, unknown>): PolicyIntent {
    return {
      id: '', // Will be set from document ID in base class
      description: payload.description as string,
      triggers: payload.triggers as string[],
      rationale: payload.rationale as string,
      createdAt: payload.createdAt as string,
      createdBy: payload.createdBy as string,
      deployedPolicies: (payload.deployedPolicies as DeployedPolicyReference[]) || []
    };
  }

  // Public API methods - delegate to base class with appropriate names
  async storePolicyIntent(policyIntent: PolicyIntent): Promise<void> {
    await this.storeData(policyIntent);
  }

  async searchPolicyIntents(query: string, options: PolicySearchOptions = {}): Promise<PolicySearchResult[]> {
    return await this.searchData(query, options);
  }

  async getPolicyIntent(id: string): Promise<PolicyIntent | null> {
    return await this.getData(id);
  }

  async getAllPolicyIntents(): Promise<PolicyIntent[]> {
    return await this.getAllData();
  }

  async deletePolicyIntent(id: string): Promise<void> {
    await this.deleteData(id);
  }

  async getPolicyIntentsCount(): Promise<number> {
    return await this.getDataCount();
  }
}