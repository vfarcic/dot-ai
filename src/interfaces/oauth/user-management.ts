/**
 * Dex static user management for PRD #380 Task 2.5.
 *
 * CRUD operations on Dex static passwords via the Dex gRPC API.
 * Changes take effect immediately in Dex's storage — no Secret
 * editing or pod restarts needed.
 *
 * RBAC enforcement is deferred to Milestone 3 — any authenticated
 * user can currently manage users.
 */

import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import bcrypt from 'bcryptjs';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result of a user management operation. */
export interface UserResult {
  email: string;
  message: string;
}

/** A user entry returned by listUsers (no password hash). */
export interface UserEntry {
  email: string;
}

/** Dex gRPC Password message shape. */
interface DexPassword {
  email: string;
  hash: Buffer;
  username: string;
  user_id: string;
}

// ---------------------------------------------------------------------------
// gRPC client (lazy-initialized singleton)
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let dexClient: any;

function getDexClient(): unknown {
  if (!dexClient) {
    const protoPath = resolve(__dirname, 'dex-api.proto');
    const packageDef = protoLoader.loadSync(protoPath, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });
    const proto = grpc.loadPackageDefinition(packageDef) as Record<string, unknown>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const DexService = (proto.api as any).Dex;

    const endpoint = getDexGrpcEndpoint();
    dexClient = new DexService(
      endpoint,
      grpc.credentials.createInsecure()
    );
  }
  return dexClient;
}

/** Reset the cached gRPC client — for testing only. */
export function _resetDexClient(): void {
  dexClient = undefined;
}

// ---------------------------------------------------------------------------
// Config helpers
// ---------------------------------------------------------------------------

function getDexGrpcEndpoint(): string {
  return process.env.DEX_GRPC_ENDPOINT || 'localhost:5557';
}

const BCRYPT_ROUNDS = 10;

// ---------------------------------------------------------------------------
// Internal: promisified gRPC calls
// ---------------------------------------------------------------------------

function grpcCall<TReq, TResp>(method: string, request: TReq): Promise<TResp> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = getDexClient() as Record<string, (...args: any[]) => void>;
  return new Promise((resolve, reject) => {
    client[method](request, (err: grpc.ServiceError | null, response: TResp) => {
      if (err) {
        reject(err);
      } else {
        resolve(response);
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a new Dex static user.
 * Rejects with a descriptive error if the email already exists.
 */
export async function createUser(
  email: string,
  password: string
): Promise<UserResult> {
  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const username = email.split('@')[0];

  const resp = await grpcCall<unknown, { already_exists: boolean }>(
    'CreatePassword',
    {
      password: {
        email,
        hash: Buffer.from(hash, 'utf8'),
        username,
        user_id: randomUUID(),
      },
    }
  );

  if (resp.already_exists) {
    const err = new Error(`User "${email}" already exists`);
    (err as Error & { statusCode: number }).statusCode = 409;
    throw err;
  }

  return { email, message: 'User created' };
}

/**
 * List all Dex static users (emails only — no password hashes).
 */
export async function listUsers(): Promise<UserEntry[]> {
  const resp = await grpcCall<unknown, { passwords: DexPassword[] }>(
    'ListPasswords',
    {}
  );

  return (resp.passwords ?? []).map((p) => ({ email: p.email }));
}

/**
 * Delete a Dex static user by email.
 * Rejects if the email is not found.
 */
export async function deleteUser(email: string): Promise<UserResult> {
  const resp = await grpcCall<unknown, { not_found: boolean }>(
    'DeletePassword',
    { email }
  );

  if (resp.not_found) {
    const err = new Error(`User "${email}" not found`);
    (err as Error & { statusCode: number }).statusCode = 404;
    throw err;
  }

  return { email, message: 'User deleted' };
}
