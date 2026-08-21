/**
 * Published response contract for `manageOrgData` capabilities operations (PRD #714, M3).
 *
 * This test is the single source of truth for the wire shape that machine consumers
 * (notably dot-ai-controller) rely on. It generates the committed golden fixtures under
 * `contracts/capabilities/` directly from the REAL handlers, then — on every normal run —
 * asserts the committed fixtures still match. Changing a response shape here fails this
 * build unless the fixtures are regenerated, which is the point: nobody hand-writes or
 * silently drifts this contract again (settles PRD #714 open question 1).
 *
 * The fixtures capture the three invariants the controller depends on:
 *   1. Envelope nesting        — the real payload lives at `data.result.data.*`, because the
 *                                REST layer wraps every tool result in a ToolExecutionResponse.
 *   2. `resourceName` vs `id`  — `id` is the deterministic capability UUID; `resourceName`
 *                                carries the `Kind.group` identity used for diffing.
 *   3. Inner-success rule      — the outer envelope `success` only means the handler did not
 *                                throw. The real operation result is `data.result.success`;
 *                                when the backend (Qdrant) is unreachable it is `false`.
 *
 * Regenerate with: `npm run generate:contracts` (or `UPDATE_CONTRACTS=1 npm run test:unit`).
 */

import { describe, it, expect, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

import {
  handleCapabilityList,
  handleCapabilityDelete,
  handleCapabilityProgress,
  handleCapabilityCRUD,
} from '../../../src/core/capability-operations';
import {
  CapabilityInferenceEngine,
  ResourceCapability,
} from '../../../src/core/capabilities';
import { Logger } from '../../../src/core/error-handling';
import { buildToolExecutionResponse } from '../../../src/interfaces/rest-api';

// handleCapabilityCRUD constructs its own CapabilityVectorService; mock it so the empty /
// backend-unavailable paths can be exercised without a live Qdrant.
import { CapabilityVectorService } from '../../../src/core/capability-vector-service';
vi.mock('../../../src/core/capability-vector-service', () => ({
  CapabilityVectorService: vi.fn(),
}));

const UPDATE = process.env.UPDATE_CONTRACTS === '1';
const CONTRACT_DIR = path.resolve('contracts/capabilities');

// Fixed values so fixtures are deterministic (real handlers, stable metadata).
const FIXED_TIMESTAMP = '2024-01-01T00:00:00.000Z';
const FIXED_REQUEST_ID = 'contract-fixture';
const FIXED_VERSION = '0.0.0-contract';

const logger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
} as unknown as Logger;

// Two representative capabilities. No `id` field is set, so the handler derives the
// deterministic UUID from `resourceName` — exactly as production does.
const SAMPLE_CAPABILITIES: ResourceCapability[] = [
  {
    resourceName: 'sqls.devopstoolkit.live',
    apiVersion: 'devopstoolkit.live/v1beta1',
    version: 'v1beta1',
    group: 'devopstoolkit.live',
    capabilities: ['postgresql', 'mysql', 'database'],
    providers: ['aws', 'azure', 'gcp'],
    abstractions: ['high-availability', 'backup'],
    complexity: 'low',
    description:
      'Managed SQL database supporting multiple engines and cloud providers with high availability',
    useCase: 'Simple database deployment without infrastructure complexity',
    analyzedAt: FIXED_TIMESTAMP,
    confidence: 0.95,
  },
  {
    resourceName: 'resourcegroups.azure.upbound.io',
    apiVersion: 'azure.upbound.io/v1beta1',
    version: 'v1beta1',
    group: 'azure.upbound.io',
    capabilities: ['resource-group', 'organization'],
    providers: ['azure'],
    abstractions: ['grouping'],
    complexity: 'low',
    description: 'Azure resource group for organizing related resources',
    useCase: 'Group and manage related Azure resources together',
    analyzedAt: FIXED_TIMESTAMP,
    confidence: 0.9,
  },
];

/**
 * Wrap a tool result in the exact REST ToolExecutionResponse envelope a consumer sees.
 * Built through the real `buildToolExecutionResponse` so an envelope change in the REST
 * layer is caught by this contract.
 *
 * The handler result is first round-tripped through the same JSON serialization the wire
 * performs (manageOrgData does `JSON.stringify(result)` into `content[0].text`; the REST
 * layer `JSON.parse`s it back), so a value that isn't JSON-safe (a Date, undefined, a
 * function) drifts the fixture and fails the test. The manageOrgData routing wrapper adds
 * no transform of its own; the true nesting (`data.result.data.capabilities`) is guarded
 * by the integration test.
 */
function envelope(result: unknown): unknown {
  const wire = JSON.parse(JSON.stringify(result));
  return buildToolExecutionResponse({
    result: wire,
    tool: 'manageOrgData',
    executionTime: 0,
    requestId: FIXED_REQUEST_ID,
    version: FIXED_VERSION,
    timestamp: FIXED_TIMESTAMP,
  });
}

function fakeService(
  overrides: Partial<CapabilityVectorService>
): CapabilityVectorService {
  return {
    healthCheck: async () => true,
    collectionExists: async () => true,
    initialize: async () => {},
    getAllCapabilities: async () => [],
    getCapabilitiesCount: async () => 0,
    getCapability: async () => null,
    deleteCapabilityById: async () => {},
    ...overrides,
  } as unknown as CapabilityVectorService;
}

/**
 * Golden-file assertion: write in UPDATE mode, otherwise require an exact match so any
 * shape change fails the build until the contract is deliberately regenerated.
 */
function assertContract(name: string, actual: unknown): void {
  const file = path.join(CONTRACT_DIR, `${name}.json`);
  const serialized = JSON.stringify(actual, null, 2) + '\n';

  if (UPDATE) {
    fs.mkdirSync(CONTRACT_DIR, { recursive: true });
    fs.writeFileSync(file, serialized, 'utf8');
    return;
  }

  expect(
    fs.existsSync(file),
    `Missing contract fixture ${file}. Run: npm run generate:contracts`
  ).toBe(true);
  const committed = JSON.parse(fs.readFileSync(file, 'utf8'));
  expect(actual).toEqual(committed);
}

describe('capabilities list/progress/delete response contract (PRD #714)', () => {
  it('list — full projection', async () => {
    const result = await handleCapabilityList(
      { limit: 100 },
      logger,
      FIXED_REQUEST_ID,
      fakeService({
        getAllCapabilities: async () => SAMPLE_CAPABILITIES,
        getCapabilitiesCount: async () => SAMPLE_CAPABILITIES.length,
      })
    );
    assertContract('list-full', envelope(result));
  });

  it('list — identity-only projection (id + resourceName only)', async () => {
    const result = await handleCapabilityList(
      { limit: 100, identityOnly: true },
      logger,
      FIXED_REQUEST_ID,
      fakeService({
        getAllCapabilities: async () => SAMPLE_CAPABILITIES,
        getCapabilitiesCount: async () => SAMPLE_CAPABILITIES.length,
      })
    );
    assertContract('list-identity-only', envelope(result));
  });

  it('list — truncated (returnedCount < totalCount)', async () => {
    const result = await handleCapabilityList(
      { limit: 1, identityOnly: true },
      logger,
      FIXED_REQUEST_ID,
      fakeService({
        // Honor the requested count so the fetch-limit+1 truncation probe sees "more".
        getAllCapabilities: async (n: number) => SAMPLE_CAPABILITIES.slice(0, n),
        getCapabilitiesCount: async () => SAMPLE_CAPABILITIES.length,
      })
    );
    assertContract('list-truncated', envelope(result));
  });

  it('list — caps returnedCount at the 10000 ceiling and flags truncated (> ceiling)', async () => {
    // The >10000 case can't be provoked against a live cluster, so it is pinned here (Tier 3)
    // where a mocked count makes it deterministic; integration covers the concurrent path.
    const OVER_CEILING = 10001;
    const result = await handleCapabilityList(
      { limit: 10000, identityOnly: true },
      logger,
      FIXED_REQUEST_ID,
      fakeService({
        // Honor the requested n (limit + 1) so the truncation probe sees one past the ceiling.
        getAllCapabilities: async (n: number) =>
          Array.from(
            { length: n },
            (_, i) => ({ resourceName: `Resource${i}.example.com` })
          ) as unknown as ResourceCapability[],
        getCapabilitiesCount: async () => OVER_CEILING,
      })
    );
    const data = result.data as {
      returnedCount: number;
      totalCount: number;
      truncated: boolean;
      limit: number;
    };
    expect(data.limit).toBe(10000);
    expect(data.returnedCount).toBe(10000);
    expect(data.truncated).toBe(true);
    expect(data.totalCount).toBe(OVER_CEILING);
  });

  it('list — empty collection (not yet initialized)', async () => {
    vi.mocked(CapabilityVectorService).mockImplementation(function () {
      return fakeService({
        healthCheck: async () => true,
        collectionExists: async () => false,
      });
    } as unknown as () => CapabilityVectorService);
    const result = await handleCapabilityCRUD(
      'list',
      {},
      logger,
      FIXED_REQUEST_ID
    );
    assertContract('list-empty', envelope(result));
  });

  it('list — backend unavailable (inner success:false)', async () => {
    vi.mocked(CapabilityVectorService).mockImplementation(function () {
      return fakeService({
        healthCheck: async () => false,
      });
    } as unknown as () => CapabilityVectorService);
    const result = await handleCapabilityCRUD(
      'list',
      {},
      logger,
      FIXED_REQUEST_ID
    );
    assertContract('list-backend-unavailable', envelope(result));
  });

  it('delete — success', async () => {
    const target = SAMPLE_CAPABILITIES[0];
    const id = CapabilityInferenceEngine.generateCapabilityId(
      target.resourceName
    );
    const result = await handleCapabilityDelete(
      { id },
      logger,
      FIXED_REQUEST_ID,
      fakeService({
        getCapability: async () => target,
        deleteCapabilityById: async () => {},
      })
    );
    assertContract('delete', envelope(result));
  });

  it('progress — completed scan', async () => {
    const tempRoot = path.resolve('tmp');
    fs.mkdirSync(tempRoot, { recursive: true });
    const sessionDir = fs.mkdtempSync(path.join(tempRoot, 'cap-contract-'));
    const previous = process.env.DOT_AI_SESSION_DIR;
    process.env.DOT_AI_SESSION_DIR = sessionDir;
    try {
      const sessionId = 'cap-scan-contract';
      const sessionSubDir = path.join(sessionDir, 'capability-sessions');
      fs.mkdirSync(sessionSubDir, { recursive: true });
      fs.writeFileSync(
        path.join(sessionSubDir, `${sessionId}.json`),
        JSON.stringify({
          sessionId,
          currentStep: 'complete',
          selectedResources: 'all',
          processingMode: 'auto',
          startedAt: FIXED_TIMESTAMP,
          lastActivity: FIXED_TIMESTAMP,
          progress: {
            status: 'completed',
            current: 2,
            total: 2,
            percentage: 100,
            currentResource: 'resourcegroups.azure.upbound.io',
            startedAt: FIXED_TIMESTAMP,
            lastUpdated: FIXED_TIMESTAMP,
            completedAt: FIXED_TIMESTAMP,
            totalProcessingTime: '3s',
            successfulResources: 2,
            failedResources: 0,
            errors: [],
          },
        }),
        'utf8'
      );

      const result = await handleCapabilityProgress(
        { sessionId },
        logger,
        FIXED_REQUEST_ID
      );
      assertContract('progress-completed', envelope(result));
    } finally {
      if (previous === undefined) delete process.env.DOT_AI_SESSION_DIR;
      else process.env.DOT_AI_SESSION_DIR = previous;
      fs.rmSync(sessionDir, { recursive: true, force: true });
    }
  });
});
