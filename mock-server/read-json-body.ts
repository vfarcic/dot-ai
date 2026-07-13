/**
 * Mock-server JSON body reader with a hard size cap (PRD #581 F4).
 *
 * The mock-server is a developer tool, but it's still new code we ship.
 * Uncapped buffering of the request body trivially DOSes the process with a
 * multi-GB POST. This helper enforces a 1 MB cap two ways:
 *   - upfront via the Content-Length header (so we never start buffering)
 *   - defense-in-depth via accumulated chunk size during read (in case the
 *     header lies or is omitted)
 *
 * Extracted from server.ts so it can be unit-tested without starting the
 * HTTP listener.
 */

import type { IncomingMessage } from 'node:http';

export const MAX_BODY_BYTES = 1 * 1024 * 1024; // 1 MB

export class BodyTooLargeError extends Error {
  public readonly limit: number;
  constructor(limit: number) {
    super(`Request body exceeds ${limit} bytes`);
    this.name = 'BodyTooLargeError';
    this.limit = limit;
  }
}

/**
 * Buffer the entire request body and parse as JSON.
 * Returns undefined when the body is empty or not valid JSON, so callers can
 * treat the no-body case the same as the empty-object case.
 * Throws BodyTooLargeError when the body would exceed MAX_BODY_BYTES.
 */
export async function readJsonBody(
  req: IncomingMessage
): Promise<Record<string, unknown> | undefined> {
  const declaredLen = req.headers
    ? parseInt((req.headers['content-length'] as string | undefined) || '0', 10)
    : 0;
  if (!Number.isNaN(declaredLen) && declaredLen > MAX_BODY_BYTES) {
    throw new BodyTooLargeError(MAX_BODY_BYTES);
  }

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let received = 0;
    let aborted = false;
    req.on('data', chunk => {
      if (aborted) return;
      received += chunk.length;
      if (received > MAX_BODY_BYTES) {
        aborted = true;
        // Stop receiving; the caller will respond with 413 and the connection
        // is no longer interesting for this request.
        req.destroy();
        reject(new BodyTooLargeError(MAX_BODY_BYTES));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (aborted) return;
      const raw = Buffer.concat(chunks).toString('utf-8').trim();
      if (!raw) {
        resolve(undefined);
        return;
      }
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          resolve(parsed as Record<string, unknown>);
        } else {
          resolve(undefined);
        }
      } catch {
        resolve(undefined);
      }
    });
    req.on('error', () => {
      if (!aborted) resolve(undefined);
    });
  });
}
