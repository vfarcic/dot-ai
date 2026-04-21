/**
 * Knowledge Tools for AI-Powered Documentation Search
 *
 * Shared tool definitions and executor for knowledge-base (ingested docs)
 * semantic search. Used by the `query` tool so agent loops can cite
 * organisational documentation alongside cluster state.
 *
 * Re-uses the existing knowledge-base search pipeline from manage-knowledge.ts
 * (PRD #356) rather than duplicating vector logic. Only search is exposed
 * here — ingest/delete remain on manageKnowledge behind explicit RBAC.
 */

import { AITool } from './ai-provider.interface';
import { searchKnowledgeBase } from '../tools/manage-knowledge';
import { VALIDATION_MESSAGES } from './constants/validation';

/**
 * Maximum chunks per tool call. Mirrors manageKnowledge's soft cap.
 */
const KNOWLEDGE_SEARCH_MAX_LIMIT = 50;
const KNOWLEDGE_SEARCH_DEFAULT_LIMIT = 10;

/**
 * Tool: search_knowledge
 * Semantic search over ingested documentation
 */
export const SEARCH_KNOWLEDGE_TOOL: AITool = {
  name: 'search_knowledge',
  description: `Semantic search over ingested documentation (Git-sourced docs, runbooks, platform guidelines, standards, migration notes).

Use this tool when the user asks about internal documentation, organisational standards, "what do our docs say about X", or needs content from GitKnowledgeSource-ingested sources. Returns ranked document chunks with the source URI and a similarity score.

TIPS:
- For complex questions, call search_knowledge multiple times with different phrasings to gather comprehensive context before synthesising an answer.
- Cite the source URIs in your final answer under a "Sources:" section as clickable markdown links.
- Combine with search_resources / search_capabilities for hybrid questions (e.g. "does any deployment violate our yarn4 standards?").`,
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Natural-language search query (e.g. "yarn npmrc configuration", "how to bootstrap a new microservice")'
      },
      limit: {
        type: 'number',
        description: `Maximum chunks to return (default: ${KNOWLEDGE_SEARCH_DEFAULT_LIMIT}, max: ${KNOWLEDGE_SEARCH_MAX_LIMIT})`
      },
      uriFilter: {
        type: 'string',
        description: 'Optional: restrict results to chunks whose source URI exactly matches this value. Leave empty to search all sources.'
      }
    },
    required: ['query']
  }
};

/**
 * All knowledge tools available to agent loops.
 * Convenient array for passing to toolLoop().
 */
export const KNOWLEDGE_TOOLS: AITool[] = [SEARCH_KNOWLEDGE_TOOL];

/**
 * Input shape for search_knowledge
 */
export interface SearchKnowledgeInput {
  query?: string;
  limit?: number;
  uriFilter?: string;
}

/**
 * Tool executor for knowledge-base tools.
 *
 * @param toolName - Name of the tool to execute (only 'search_knowledge' supported)
 * @param input - Tool input parameters
 * @returns Tool execution result with a `data` payload or structured error
 */
export async function executeKnowledgeTools(
  toolName: string,
  input: SearchKnowledgeInput
): Promise<Record<string, unknown>> {
  if (toolName !== 'search_knowledge') {
    return {
      success: false,
      error: `Unknown knowledge tool: ${toolName}`,
      message: `Tool '${toolName}' is not implemented in knowledge tools`
    };
  }

  try {
    const { query, limit, uriFilter } = input ?? {};

    if (!query || typeof query !== 'string') {
      return {
        success: false,
        error: VALIDATION_MESSAGES.MISSING_PARAMETER('query'),
        message: 'search_knowledge requires a query parameter'
      };
    }

    const effectiveLimit = Math.min(
      Math.max(1, typeof limit === 'number' ? limit : KNOWLEDGE_SEARCH_DEFAULT_LIMIT),
      KNOWLEDGE_SEARCH_MAX_LIMIT
    );

    const result = await searchKnowledgeBase({
      query,
      limit: effectiveLimit,
      uriFilter
    });

    if (!result.success) {
      return {
        success: false,
        error: result.error ?? 'Knowledge search failed',
        message: `search_knowledge failed: ${result.error ?? 'unknown error'}`
      };
    }

    // Shape results for AI consumption — include enough to cite but drop
    // vector internals (id, checksum) that add noise to the agent context.
    const chunks = result.chunks.map(chunk => ({
      content: chunk.content,
      uri: chunk.uri,
      score: chunk.score,
      matchType: chunk.matchType,
      chunkIndex: chunk.chunkIndex,
      totalChunks: chunk.totalChunks,
      metadata: chunk.metadata,
      ...(chunk.extractedPolicies ? { extractedPolicies: chunk.extractedPolicies } : {})
    }));

    return {
      success: true,
      data: chunks,
      count: chunks.length,
      totalMatches: result.totalMatches,
      message: chunks.length > 0
        ? `Found ${chunks.length} matching chunks for "${query}"`
        : `No matching documents found for "${query}"`,
      agentInstructions: chunks.length > 0
        ? 'Synthesise an answer from the chunks. Discard irrelevant content. Append a "Sources:" section with the unique source URIs as clickable markdown links. Do NOT surface raw chunks, scores, or metadata.'
        : undefined
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: errorMessage,
      message: `Failed to execute ${toolName}: ${errorMessage}`
    };
  }
}
