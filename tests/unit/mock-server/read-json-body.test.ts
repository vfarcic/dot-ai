/**
 * Unit Tests: mock-server readJsonBody body-size cap (PRD #581 F4)
 *
 * The mock-server's JSON body reader accepts arbitrary-size payloads by
 * default; uncapped buffering trivially DOSes the process. F4 added a 1 MB
 * cap enforced two ways:
 *   - upfront via Content-Length header
 *   - defense-in-depth via accumulated chunk size during read
 *
 * Both paths must throw BodyTooLargeError so the HTTP handler can return 413
 * instead of crashing to 500.
 */

import { describe, test, expect } from 'vitest';
import { Readable } from 'node:stream';
import type { IncomingMessage } from 'node:http';
import {
  MAX_BODY_BYTES,
  BodyTooLargeError,
  readJsonBody,
} from '../../../mock-server/read-json-body';

// readJsonBody only touches req.headers and the data/end/error events that
// Readable streams already implement. Tag the stream as IncomingMessage for
// the type cast — we're not exercising any HTTP-specific behavior.
function makeRequest(
  body: Buffer,
  headers: Record<string, string> = {}
): IncomingMessage {
  const stream = Readable.from([body]) as unknown as IncomingMessage & {
    headers: Record<string, string>;
    destroy: () => void;
  };
  stream.headers = headers;
  stream.destroy = () => {
    /* noop for test */
  };
  return stream;
}

describe('readJsonBody body-size cap (PRD #581 F4)', () => {
  test('parses a small JSON body', async () => {
    const body = Buffer.from(JSON.stringify({ repo: 'https://x.test' }));
    const req = makeRequest(body, { 'content-length': String(body.length) });
    await expect(readJsonBody(req)).resolves.toEqual({
      repo: 'https://x.test',
    });
  });

  test('returns undefined for empty body', async () => {
    const req = makeRequest(Buffer.from(''), { 'content-length': '0' });
    await expect(readJsonBody(req)).resolves.toBe(undefined);
  });

  test('returns undefined for malformed JSON', async () => {
    const body = Buffer.from('not-json{');
    const req = makeRequest(body, { 'content-length': String(body.length) });
    await expect(readJsonBody(req)).resolves.toBe(undefined);
  });

  test('rejects upfront via Content-Length when declared length exceeds the cap', async () => {
    // Body is empty, but the declared header lies about size.
    const req = makeRequest(Buffer.from(''), {
      'content-length': String(MAX_BODY_BYTES + 1),
    });
    await expect(readJsonBody(req)).rejects.toBeInstanceOf(BodyTooLargeError);
  });

  test('rejects during read when accumulated bytes exceed the cap (Content-Length absent)', async () => {
    // No Content-Length header, but the stream emits more than the cap.
    // Use a single chunk slightly over MAX_BODY_BYTES.
    const oversize = Buffer.alloc(MAX_BODY_BYTES + 16, 'a');
    const req = makeRequest(oversize, {}); // no content-length header
    await expect(readJsonBody(req)).rejects.toBeInstanceOf(BodyTooLargeError);
  });

  test('BodyTooLargeError carries the configured limit', async () => {
    const req = makeRequest(Buffer.from(''), {
      'content-length': String(MAX_BODY_BYTES + 1),
    });
    try {
      await readJsonBody(req);
      throw new Error('expected to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(BodyTooLargeError);
      expect((err as BodyTooLargeError).limit).toBe(MAX_BODY_BYTES);
    }
  });
});
