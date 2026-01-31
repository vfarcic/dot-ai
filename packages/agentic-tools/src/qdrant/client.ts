/**
 * Qdrant Client
 *
 * Singleton Qdrant client with lazy initialization.
 * Reads configuration from environment variables:
 * - QDRANT_URL (required): Qdrant server URL
 * - QDRANT_API_KEY (optional): Authentication key for external Qdrant
 */

import { QdrantClient } from '@qdrant/js-client-rest';

let client: QdrantClient | null = null;

/**
 * Get or create the singleton Qdrant client
 *
 * @throws Error if QDRANT_URL environment variable is not set
 */
export function getQdrantClient(): QdrantClient {
  if (!client) {
    const url = process.env.QDRANT_URL;
    if (!url) {
      throw new Error('QDRANT_URL environment variable is required');
    }

    client = new QdrantClient({
      url,
      apiKey: process.env.QDRANT_API_KEY,
      maxConnections: 100, // HTTP keep-alive pool for connection reuse
    });
  }
  return client;
}

/**
 * Check if client is initialized
 */
export function isClientInitialized(): boolean {
  return client !== null;
}

/**
 * Reset the client (for testing)
 */
export function resetQdrantClient(): void {
  client = null;
}

/**
 * Get Qdrant configuration (for debugging)
 */
export function getQdrantConfig(): { url: string | undefined; hasApiKey: boolean } {
  return {
    url: process.env.QDRANT_URL,
    hasApiKey: !!process.env.QDRANT_API_KEY,
  };
}
