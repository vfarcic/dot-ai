import { describe, test, expect } from 'vitest';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import * as fs from 'node:fs';
import * as net from 'node:net';
import * as path from 'node:path';
import { HttpRestApiClient } from '../helpers/http-client.js';

async function reservePort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    throw new Error('Failed to reserve a readiness test port');
  }
  await new Promise<void>((resolve, reject) =>
    server.close(error => (error ? reject(error) : resolve()))
  );
  return address.port;
}

async function waitForHealth(client: HttpRestApiClient): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const response = await client.get('/healthz');
      if (response.success) return;
    } catch {
      // The isolated process may still be starting.
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('Isolated readiness server did not start');
}

describe.concurrent('Readiness HTTP Integration', () => {
  test('returns HTTP 503 when the capability plugin is unavailable', async () => {
    const port = await reservePort();
    fs.mkdirSync(path.resolve('tmp'), { recursive: true });
    const sessionDir = fs.mkdtempSync(path.resolve('tmp/readiness-http-'));
    const authToken = 'readiness-integration-token';
    const child = spawn(
      process.execPath,
      [path.resolve('dist/mcp/server.js')],
      {
        cwd: path.resolve('.'),
        env: {
          ...process.env,
          HOST: '127.0.0.1',
          PORT: String(port),
          TRANSPORT_TYPE: 'http',
          DOT_AI_AUTH_TOKEN: authToken,
          DOT_AI_JWT_SECRET: '',
          DOT_AI_SESSION_DIR: sessionDir,
          DOT_AI_TELEMETRY: 'false',
        },
        stdio: ['ignore', 'ignore', 'pipe'],
      }
    );
    let stderr = '';
    child.stderr?.on('data', chunk => {
      stderr = (stderr + chunk.toString()).slice(-4000);
    });

    const client = new HttpRestApiClient({
      baseUrl: `http://127.0.0.1:${port}`,
      timeout: 2000,
      headers: { Authorization: `Bearer ${authToken}` },
    });

    try {
      await waitForHealth(client).catch(error => {
        throw new Error(
          `${error instanceof Error ? error.message : String(error)}\n${stderr}`
        );
      });

      const response = await client.get('/readyz');

      expect(response).toMatchObject({
        success: false,
        data: {
          ready: false,
          vectorDBHealthy: false,
          collectionAccessible: false,
          embeddingsRequired: true,
          embeddingHealthy: false,
        },
        error: {
          code: 'HTTP_ERROR',
          message: 'HTTP 503',
        },
      });
    } finally {
      if (child.exitCode === null) {
        const exit = once(child, 'exit');
        child.kill('SIGTERM');
        const exited = await Promise.race([
          exit.then(() => true),
          new Promise<false>(resolve => setTimeout(() => resolve(false), 5000)),
        ]);
        if (!exited && child.exitCode === null) {
          child.kill('SIGKILL');
          await exit;
        }
      }
      fs.rmSync(sessionDir, { recursive: true, force: true });
    }
  }, 30000);
});
