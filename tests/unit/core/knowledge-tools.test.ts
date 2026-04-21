import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSearchKnowledgeBase } = vi.hoisted(() => ({
  mockSearchKnowledgeBase: vi.fn(),
}));

vi.mock('../../../src/tools/manage-knowledge', () => ({
  searchKnowledgeBase: mockSearchKnowledgeBase,
}));

import {
  KNOWLEDGE_TOOLS,
  SEARCH_KNOWLEDGE_TOOL,
  executeKnowledgeTools,
} from '../../../src/core/knowledge-tools';

describe('knowledge-tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('tool definitions', () => {
    it('exposes exactly one tool: search_knowledge', () => {
      expect(KNOWLEDGE_TOOLS).toHaveLength(1);
      expect(KNOWLEDGE_TOOLS[0]).toBe(SEARCH_KNOWLEDGE_TOOL);
      expect(SEARCH_KNOWLEDGE_TOOL.name).toBe('search_knowledge');
    });

    it('declares query as a required parameter', () => {
      expect(SEARCH_KNOWLEDGE_TOOL.inputSchema.required).toEqual(['query']);
      expect(SEARCH_KNOWLEDGE_TOOL.inputSchema.properties).toHaveProperty('query');
      expect(SEARCH_KNOWLEDGE_TOOL.inputSchema.properties).toHaveProperty('limit');
      expect(SEARCH_KNOWLEDGE_TOOL.inputSchema.properties).toHaveProperty('uriFilter');
    });
  });

  describe('executeKnowledgeTools', () => {
    it('rejects unknown tool names', async () => {
      const result = await executeKnowledgeTools('search_mystery' as string, {
        query: 'anything',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('search_mystery');
      expect(mockSearchKnowledgeBase).not.toHaveBeenCalled();
    });

    it('returns a validation error when query is missing', async () => {
      const result = await executeKnowledgeTools('search_knowledge', {});

      expect(result.success).toBe(false);
      expect(result.message).toContain('query');
      expect(mockSearchKnowledgeBase).not.toHaveBeenCalled();
    });

    it('dispatches to searchKnowledgeBase with clamped limit (default 10)', async () => {
      mockSearchKnowledgeBase.mockResolvedValue({
        success: true,
        chunks: [],
        totalMatches: 0,
      });

      await executeKnowledgeTools('search_knowledge', { query: 'yarn npmrc' });

      expect(mockSearchKnowledgeBase).toHaveBeenCalledWith({
        query: 'yarn npmrc',
        limit: 10,
        uriFilter: undefined,
      });
    });

    it('clamps limit to the max (50) when the agent asks for more', async () => {
      mockSearchKnowledgeBase.mockResolvedValue({
        success: true,
        chunks: [],
        totalMatches: 0,
      });

      await executeKnowledgeTools('search_knowledge', {
        query: 'anything',
        limit: 10_000,
      });

      expect(mockSearchKnowledgeBase).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 50 })
      );
    });

    it('clamps limit to 1 when the agent asks for 0 or negative', async () => {
      mockSearchKnowledgeBase.mockResolvedValue({
        success: true,
        chunks: [],
        totalMatches: 0,
      });

      await executeKnowledgeTools('search_knowledge', {
        query: 'anything',
        limit: 0,
      });

      expect(mockSearchKnowledgeBase).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 1 })
      );
    });

    it('forwards uriFilter verbatim', async () => {
      mockSearchKnowledgeBase.mockResolvedValue({
        success: true,
        chunks: [],
        totalMatches: 0,
      });

      await executeKnowledgeTools('search_knowledge', {
        query: 'npm auth token',
        uriFilter: 'https://git.example.com/org/platform-guidelines',
      });

      expect(mockSearchKnowledgeBase).toHaveBeenCalledWith(
        expect.objectContaining({
          uriFilter: 'https://git.example.com/org/platform-guidelines',
        })
      );
    });

    it('reshapes chunks for AI consumption (drops id/checksum, keeps citeable fields)', async () => {
      mockSearchKnowledgeBase.mockResolvedValue({
        success: true,
        chunks: [
          {
            id: 'uuid-1',
            content: 'Always set npmAuthToken in .npmrc',
            score: 0.9,
            matchType: 'semantic',
            uri: 'https://example.com/doc.md',
            metadata: { source: 'platform-guidelines' },
            chunkIndex: 0,
            totalChunks: 3,
          },
        ],
        totalMatches: 1,
      });

      const result = await executeKnowledgeTools('search_knowledge', {
        query: 'npmAuthToken',
      });

      expect(result.success).toBe(true);
      expect(result.count).toBe(1);
      expect(result.totalMatches).toBe(1);
      expect(result.agentInstructions).toContain('Sources:');

      const chunks = result.data as Array<Record<string, unknown>>;
      expect(chunks[0]).toMatchObject({
        content: 'Always set npmAuthToken in .npmrc',
        uri: 'https://example.com/doc.md',
        score: 0.9,
        matchType: 'semantic',
        chunkIndex: 0,
        totalChunks: 3,
        metadata: { source: 'platform-guidelines' },
      });
      // id/checksum are internals and should not leak to the agent context
      expect(chunks[0]).not.toHaveProperty('id');
      expect(chunks[0]).not.toHaveProperty('checksum');
    });

    it('returns a structured error when searchKnowledgeBase fails', async () => {
      mockSearchKnowledgeBase.mockResolvedValue({
        success: false,
        chunks: [],
        totalMatches: 0,
        error: 'Plugin system not available',
      });

      const result = await executeKnowledgeTools('search_knowledge', {
        query: 'yarn',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Plugin system not available');
      expect(result.message).toContain('Plugin system not available');
    });

    it('catches thrown errors from the search pipeline', async () => {
      mockSearchKnowledgeBase.mockRejectedValue(new Error('Qdrant unreachable'));

      const result = await executeKnowledgeTools('search_knowledge', {
        query: 'yarn',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Qdrant unreachable');
    });

    it('omits agentInstructions when no chunks match', async () => {
      mockSearchKnowledgeBase.mockResolvedValue({
        success: true,
        chunks: [],
        totalMatches: 0,
      });

      const result = await executeKnowledgeTools('search_knowledge', {
        query: 'non-existent topic',
      });

      expect(result.success).toBe(true);
      expect(result.count).toBe(0);
      expect(result.agentInstructions).toBeUndefined();
      expect(result.message).toContain('No matching documents found');
    });
  });
});
