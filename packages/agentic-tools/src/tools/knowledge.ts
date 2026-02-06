/**
 * Knowledge Base Tools
 *
 * Utility tools for knowledge base document processing.
 * These tools handle text chunking and ID generation - no AI/embeddings involved.
 *
 * PRD #356: Knowledge Base System - Milestone 1
 */

import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { v5 as uuidv5 } from 'uuid';
import { createHash } from 'crypto';
import { ToolDefinition } from '../types';

/**
 * Result returned by knowledge tool handlers
 */
export interface KnowledgeToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  message: string;
}

/**
 * Self-contained knowledge tool definition
 */
export interface KnowledgeTool {
  definition: ToolDefinition;
  handler: (args: Record<string, unknown>) => Promise<KnowledgeToolResult>;
}

/**
 * UUID v5 namespace for knowledge chunk IDs
 * Using the URL namespace as base for URI-based IDs
 */
const KNOWLEDGE_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

/**
 * Chunk result returned by the chunking tool
 */
interface ChunkResult {
  id: string;
  content: string;
  checksum: string;
  chunkIndex: number;
  totalChunks: number;
}

/**
 * Create a successful tool result
 */
function successResult(data: unknown, message: string): KnowledgeToolResult {
  return { success: true, data, message };
}

/**
 * Create an error tool result
 */
function errorResult(error: string, message: string): KnowledgeToolResult {
  return { success: false, error, message };
}

/**
 * Generate a deterministic chunk ID using UUID v5
 * Same URI + chunkIndex always produces the same ID
 */
function generateChunkId(uri: string, chunkIndex: number): string {
  return uuidv5(`${uri}#${chunkIndex}`, KNOWLEDGE_NAMESPACE);
}

/**
 * Generate SHA-256 checksum of content
 */
function generateChecksum(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

/**
 * knowledge_chunk - Split document into semantic chunks with deterministic IDs
 *
 * Uses RecursiveCharacterTextSplitter to split text at natural boundaries
 * (paragraphs, sentences, words) while respecting size limits and overlap.
 */
export const knowledgeChunk: KnowledgeTool = {
  definition: {
    name: 'knowledge_chunk',
    type: 'agentic',
    description:
      'Split a document into semantic chunks with deterministic IDs. ' +
      'Chunks are split at natural boundaries (paragraphs, sentences, words) ' +
      'with configurable size and overlap. Each chunk gets a deterministic UUID v5 ' +
      'based on the source URI and chunk index.',
    inputSchema: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'Document content to split into chunks',
        },
        uri: {
          type: 'string',
          description: 'Document URI for deterministic ID generation (e.g., https://github.com/org/repo/blob/main/docs/guide.md)',
        },
        maxChunkSize: {
          type: 'number',
          description: 'Maximum chunk size in characters (default: 1000)',
        },
        chunkOverlap: {
          type: 'number',
          description: 'Number of overlapping characters between chunks (default: 200)',
        },
      },
      required: ['content', 'uri'],
    },
  },
  handler: async (args: Record<string, unknown>): Promise<KnowledgeToolResult> => {
    const content = args.content as string | undefined;
    const uri = args.uri as string | undefined;
    const maxChunkSize = (args.maxChunkSize as number) ?? 1000;
    const chunkOverlap = (args.chunkOverlap as number) ?? 200;

    // Validate required parameters
    if (!uri) {
      return errorResult('Missing required parameter: uri', 'knowledge_chunk requires uri parameter');
    }

    // Validate chunk parameters
    if (!Number.isInteger(maxChunkSize) || maxChunkSize < 1) {
      return errorResult('Invalid maxChunkSize', 'maxChunkSize must be a positive integer');
    }
    if (!Number.isInteger(chunkOverlap) || chunkOverlap < 0 || chunkOverlap >= maxChunkSize) {
      return errorResult('Invalid chunkOverlap', 'chunkOverlap must be >= 0 and < maxChunkSize');
    }

    // Handle empty or missing content
    if (!content || !content.trim()) {
      return successResult(
        { chunks: [], totalChunks: 0, uri },
        'Empty content - no chunks created'
      );
    }

    try {
      // Create text splitter with semantic-aware separators
      const splitter = new RecursiveCharacterTextSplitter({
        chunkSize: maxChunkSize,
        chunkOverlap: chunkOverlap,
        separators: ['\n\n', '\n', '. ', '! ', '? ', '; ', ', ', ' ', ''],
      });

      // Split the text
      const textChunks = await splitter.splitText(content);

      // Generate chunk objects with deterministic IDs
      const chunks: ChunkResult[] = textChunks.map((text, index) => ({
        id: generateChunkId(uri, index),
        content: text,
        checksum: generateChecksum(text),
        chunkIndex: index,
        totalChunks: textChunks.length,
      }));

      return successResult(
        { chunks, totalChunks: chunks.length, uri },
        `Split document into ${chunks.length} chunks`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return errorResult(message, `Failed to chunk document: ${message}`);
    }
  },
};

/**
 * All knowledge tools for registration
 */
export const KNOWLEDGE_TOOLS: KnowledgeTool[] = [knowledgeChunk];
