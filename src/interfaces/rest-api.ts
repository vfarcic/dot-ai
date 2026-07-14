/**
 * REST API Router for MCP Tools
 *
 * Provides HTTP REST endpoints for all registered MCP tools.
 * Handles routing, validation, execution, and response formatting.
 */

import { IncomingMessage, ServerResponse } from 'node:http';
import { URL } from 'node:url';
import { RestToolRegistry, ToolInfo } from './rest-registry';
import { OpenApiGenerator } from './openapi-generator';
import { RestRouteRegistry, RouteMatch } from './rest-route-registry';
import { registerAllRoutes } from './routes';
import { Logger } from '../core/error-handling';
import { DotAI } from '../core/index';
import { handleResourceSync } from './resource-sync-handler';
import { handleEmbeddingMigration } from './embedding-migration-handler';
import {
  handlePromptsListRequest,
  handlePromptsGetRequest,
  loadAllPrompts,
} from '../tools/prompts';
import {
  computePromptsSource,
  getUserPromptsConfigFromOverride,
  ingestPromptsSource,
  PromptsSourceValidationError,
  scrubSourceUrl,
  UserPromptsOverride,
  UserPromptsOverrideError,
} from '../core/user-prompts-loader';
import { scrubCredentials } from '../core/git-utils';
import {
  GIT_TOKEN_HEADER_LC,
  REST_CORS_ALLOW_HEADERS,
} from './cors-headers';
import { GenericSessionManager } from '../core/generic-session-manager';
import {
  getSessionEventBus,
  type SessionEvent,
  type SessionEventHandler,
} from '../core/session-events';
import { QuerySessionData } from '../tools/query';
import { loadPrompt } from '../core/shared-prompt-loader';
import {
  extractPrefixFromSessionId,
  getPromptForTool,
  BaseVisualizationData,
  parseVisualizationResponse,
} from '../core/visualization';
import { createAIProvider } from '../core/ai-provider-factory';
import {
  CAPABILITY_TOOLS,
  executeCapabilityTools,
} from '../core/capability-tools';
import {
  RESOURCE_TOOLS,
  executeResourceTools,
  getResourceKinds,
  listResources,
  getNamespaces,
  type SearchResourcesInput,
  type QueryResourcesInput,
} from '../core/resource-tools';
import {
  MERMAID_TOOLS,
  executeMermaidTools,
  type MermaidToolInput,
} from '../core/mermaid-tools';
import { PluginManager } from '../core/plugin-manager';
import { invokePluginTool, isPluginInitialized } from '../core/plugin-registry';
import {
  searchKnowledgeBase,
  type SearchKnowledgeBaseResult,
} from '../core/knowledge-service';
import type { AITool } from '../core/ai-provider.interface';
import { createUser, listUsers, deleteUser } from './oauth/user-management';
import { getCurrentIdentity } from './request-context';
import {
  checkToolAccess,
  filterAuthorizedTools,
  logUserManagementOperation,
} from '../core/rbac';

/**
 * Constant placeholder used when the request URL fails to parse and the
 * caller would otherwise have to choose between logging a potentially
 * credential-bearing query string or dropping the request log entirely. A
 * stable string keeps log-grepping useful.
 */
export const UNPARSEABLE_QUERY_PLACEHOLDER = '?<redacted-unparseable>';

/**
 * F3: req.url is logged on every request; with PRD #581 the query string may
 * carry `?repo=<user-supplied-url>` whose value can include credentials, and
 * PRD #647 adds `?source=<identifier>` which is equally credential-bearing (it
 * may be a `https://user:tok@host` git URL). This helper rewrites BOTH values
 * to their credential-scrubbed form so the raw token doesn't reach the log.
 * Everything else is preserved verbatim.
 *
 * CodeRabbit Major B: on parse failure, we no longer return the input
 * verbatim — an unparseable URL is more likely than a parseable one to hide
 * a credential (a stray character may have broken the parse). Instead, keep
 * the pathname (so the log still tells you which endpoint was hit) but
 * REDACT the entire query string with a fixed placeholder. URLs without a
 * '?' are pass-through (no risk).
 */
export function sanitizeRequestUrlForLogging(
  url: string | undefined
): string | undefined {
  if (!url) return url;
  // Fast path: only walk the URL when it carries a credential-bearing param
  // we know how to scrub (PRD #581 `repo=`, PRD #647 `source=`).
  //
  // CodeRabbit C3: a percent-encoded param NAME (e.g. `r%65po=`, `s%6Frce=`)
  // decodes to `repo`/`source` once parsed, so the literal-substring fast path
  // would early-return WITHOUT scrubbing and leak the credential into the log.
  // Any `%` means a name could be encoded, so fall through to the full
  // parse-and-scrub below (URLSearchParams decodes the name, catching it).
  if (
    !url.includes('repo=') &&
    !url.includes('source=') &&
    !url.includes('%')
  ) {
    return url;
  }
  try {
    // req.url is path-relative; provide a dummy base for URL parsing.
    const parsed = new URL(url, 'http://internal.invalid');
    // Both `?repo=` and `?source=` are scrubbed with the deep helper (userinfo +
    // credential-bearing query params) so a token embedded anywhere in the URL —
    // e.g. `?repo=https://user:tok@host` or `?source=...?token=...` — never
    // appears unscrubbed in the log.
    const repo = parsed.searchParams.get('repo');
    if (repo) {
      parsed.searchParams.set('repo', scrubSourceUrl(repo));
    }
    const source = parsed.searchParams.get('source');
    if (source) {
      parsed.searchParams.set('source', scrubSourceUrl(source));
    }
    // Return path + search only (drop the dummy base).
    return parsed.pathname + parsed.search + parsed.hash;
  } catch {
    // F3/Major B: don't echo a potentially credential-bearing query string
    // we couldn't parse. Keep the path (useful for log triage) and replace
    // the rest with a constant marker.
    const qIdx = url.indexOf('?');
    if (qIdx === -1) return url;
    return url.slice(0, qIdx) + UNPARSEABLE_QUERY_PLACEHOLDER;
  }
}

/**
 * Coerce an optional override string param (path/branch) supplied via query
 * string or JSON body. Mirrors the `repo` guard in extractPromptsOverride:
 *   - non-string (array, number, object, boolean) → 400 (avoids a 500 from a
 *     malformed body reaching downstream code).
 *   - absent (null/undefined) or empty/whitespace-only → `undefined`, i.e.
 *     treated as not supplied so the downstream default (subPath '' / branch
 *     'main') is preserved and an empty-string branch never reaches
 *     isValidGitBranch (which would otherwise reject it).
 *   - otherwise → the trimmed value.
 */
function coerceOverrideStringParam(
  value: unknown,
  name: 'path' | 'branch'
):
  | { ok: true; value: string | undefined }
  | { ok: false; message: string } {
  if (value === undefined || value === null) {
    return { ok: true, value: undefined };
  }
  if (typeof value !== 'string') {
    return {
      ok: false,
      message: `${name} must be a string (got ${Array.isArray(value) ? 'array' : typeof value})`,
    };
  }
  const trimmed = value.trim();
  return { ok: true, value: trimmed.length > 0 ? trimmed : undefined };
}

/**
 * Read the per-request git credential from the X-Dot-AI-Git-Token header
 * (PRD #621 M2). Node lowercases incoming header names and may present a
 * repeated header as an array; normalize to a single non-empty string or
 * undefined. The value is a secret, so it is never logged here.
 */
function readGitTokenHeader(req: IncomingMessage): string | undefined {
  const raw = req.headers[GIT_TOKEN_HEADER_LC];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Extract and validate the per-request prompts override.
 *
 * Threads three optional, additive inputs from the request into a
 * UserPromptsOverride (PRD #581 introduced `repo`; PRD #621 M1 adds `path`
 * and `branch`):
 *   - repoParam   → override.repoUrl   (GET ?repo=  / POST body `repo`)
 *   - pathParam   → override.subPath   (GET ?path=  / POST body `path`)
 *   - branchParam → override.branch    (GET ?branch= / POST body `branch`)
 *   - gitToken    → override.gitToken  (X-Dot-AI-Git-Token request header; M2)
 *
 * Returns:
 *   - { ok: true, override }  when no `repo` is supplied (override undefined;
 *     any path/branch/token are ignored, since they only qualify an override —
 *     this keeps the no-`repo` / env-var-configured path unchanged).
 *   - { ok: true, override }  when a syntactically valid override is supplied.
 *   - { ok: false, message }  when the override fails validation (HTTP 400).
 *
 * The validation message is run through scrubCredentials so embedded tokens
 * never reach the wire response.
 *
 * Backward compatibility (PRD #621, non-negotiable): when path/branch are
 * absent or empty, the override carries `repoUrl` only — byte-identical to
 * the PRD #581 behavior (same clone target: repo root, `main`). subPath and
 * branch are populated ONLY for a non-empty value, so downstream defaults are
 * untouched. The credential header is INERT unless a `?repo=` override is
 * present: without a repo this returns `override: undefined` before the token
 * is ever read, so the env-var path is unaffected by a forwarded header.
 *
 * Validation is delegated to getUserPromptsConfigFromOverride (scheme,
 * sanitizeRelativePath for subPath, isValidGitBranch for branch) and happens
 * BEFORE any clone or shared-cache mutation, so a rejected override can never
 * corrupt the env-var-configured cache.
 */
export function extractPromptsOverride(
  repoParam: unknown,
  pathParam?: unknown,
  branchParam?: unknown,
  gitToken?: string,
  sourceParam?: unknown
):
  | {
      ok: true;
      override?: UserPromptsOverride;
    }
  | {
      ok: false;
      message: string;
    } {
  // PRD #647 D1: an explicit `?source=<identifier>` selects an already-ingested
  // (CLI-uploaded) source. It is the explicit ingested signal, so it takes
  // precedence over `?repo=` and the clone-qualifying params (path/branch/token)
  // do not apply — they only describe a git clone, which an ingested source is
  // not. Resolution against the in-memory ingested cache (and the "never clone"
  // guarantee) happens in loadUserPrompts via override.ingestedSource. The raw
  // identifier doubles as repoUrl ONLY so computePromptsSource echoes the
  // scrubbed source; it is never cloned or logged unscrubbed on this path.
  if (typeof sourceParam === 'string' && sourceParam.trim() !== '') {
    const identifier = sourceParam.trim();
    return {
      ok: true,
      override: { repoUrl: identifier, ingestedSource: identifier },
    };
  }

  // Treat absent (null/undefined) repo as no override. path/branch/token only
  // qualify an override, so without a repo they are ignored (the credential
  // header is inert on the env-var path).
  if (repoParam === undefined || repoParam === null) {
    return { ok: true, override: undefined };
  }
  // The wire contract says `repo` is a string. Anything else (array,
  // number, object, boolean) is a 400 — otherwise downstream code
  // would crash to a 500.
  if (typeof repoParam !== 'string') {
    return {
      ok: false,
      message: `repo must be a string (got ${Array.isArray(repoParam) ? 'array' : typeof repoParam})`,
    };
  }
  const trimmed = repoParam.trim();
  if (!trimmed) {
    return { ok: true, override: undefined };
  }
  const candidate: UserPromptsOverride = { repoUrl: trimmed };

  // PRD #621 M1: thread ?path= / body `path` into subPath (validated
  // downstream by sanitizeRelativePath).
  const pathResult = coerceOverrideStringParam(pathParam, 'path');
  if (!pathResult.ok) {
    return pathResult;
  }
  if (pathResult.value !== undefined) {
    candidate.subPath = pathResult.value;
  }

  // PRD #621 M1: thread ?branch= / body `branch` into branch (validated
  // downstream by isValidGitBranch).
  const branchResult = coerceOverrideStringParam(branchParam, 'branch');
  if (!branchResult.ok) {
    return branchResult;
  }
  if (branchResult.value !== undefined) {
    candidate.branch = branchResult.value;
  }

  // PRD #621 M2: the X-Dot-AI-Git-Token header (read by the handler and passed
  // in already-normalized to a non-empty string or undefined) authenticates
  // THIS override clone. It travels only as a header — never query/body — and
  // is never echoed (computePromptsSource uses repoUrl only).
  if (gitToken) {
    candidate.gitToken = gitToken;
  }

  try {
    // Throws on invalid scheme / subPath / branch.
    getUserPromptsConfigFromOverride(candidate);
    return { ok: true, override: candidate };
  } catch (error) {
    const raw = error instanceof Error ? error.message : 'Invalid override';
    return { ok: false, message: scrubCredentials(raw) };
  }
}

/**
 * HTTP status codes for REST responses
 */
export enum HttpStatus {
  OK = 200,
  BAD_REQUEST = 400,
  NOT_FOUND = 404,
  METHOD_NOT_ALLOWED = 405,
  INTERNAL_SERVER_ERROR = 500,
  BAD_GATEWAY = 502,
  SERVICE_UNAVAILABLE = 503,
}

/**
 * Standard REST API response format
 */
export interface RestApiResponse {
  success: boolean;
  data?: unknown;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    timestamp: string;
    requestId?: string;
    version: string;
  };
}

/**
 * Tool execution response format
 */
export interface ToolExecutionResponse extends RestApiResponse {
  data?: {
    result: unknown;
    tool: string;
    executionTime?: number;
  };
}

/**
 * Tool discovery response format
 */
export interface ToolDiscoveryResponse extends RestApiResponse {
  data?: {
    tools: ToolInfo[];
    total: number;
    categories?: string[];
    tags?: string[];
  };
}

/**
 * Visualization types supported by the API
 * PRD #320: Added 'diff' type for before/after comparisons
 * PRD #328: Added 'bar-chart' type for metrics visualization
 */
export type VisualizationType =
  | 'mermaid'
  | 'cards'
  | 'code'
  | 'table'
  | 'diff'
  | 'bar-chart';

/**
 * Diff visualization content (PRD #320)
 */
export interface DiffVisualizationContent {
  before: { language: string; code: string };
  after: { language: string; code: string };
}

/**
 * Bar chart data item (PRD #328)
 */
export interface BarChartDataItem {
  label: string; // e.g., "node-1", "kube-system"
  value: number; // e.g., 8.5
  max?: number; // e.g., 10 (for percentage calculation)
  status?: 'error' | 'warning' | 'ok'; // for color-coding
}

/**
 * Bar chart visualization content (PRD #328)
 */
export interface BarChartVisualizationContent {
  data: BarChartDataItem[];
  unit?: string; // e.g., "Gi", "cores", "%"
  orientation?: 'horizontal' | 'vertical'; // default: horizontal
}

/**
 * Individual visualization item
 */
export interface Visualization {
  id: string;
  label: string;
  type: VisualizationType;
  content:
    | string // mermaid
    | { language: string; code: string } // code
    | { headers: string[]; rows: string[][] } // table
    | Array<{
        id: string;
        title: string;
        description?: string;
        tags?: string[];
      }> // cards
    | DiffVisualizationContent // diff
    | BarChartVisualizationContent; // bar-chart
}

/**
 * Visualization endpoint response format
 * PRD #320: Added toolsUsed for test validation of mermaid validation
 */
export interface VisualizationResponse {
  title: string;
  visualizations: Visualization[];
  insights: string[];
  toolsUsed?: string[]; // Tools called during visualization generation
}

/**
 * REST API router configuration
 */
export interface RestApiConfig {
  basePath: string;
  version: string;
  enableCors: boolean;
  requestTimeout: number;
}

/**
 * REST API Router for MCP tools
 */
export class RestApiRouter {
  private registry: RestToolRegistry;
  private routeRegistry: RestRouteRegistry;
  private logger: Logger;
  private dotAI: DotAI;
  private config: RestApiConfig;
  private openApiGenerator: OpenApiGenerator;
  private requestCounter: number = 0;
  private pluginManager?: PluginManager;

  constructor(
    registry: RestToolRegistry,
    dotAI: DotAI,
    logger: Logger,
    pluginManager?: PluginManager,
    config: Partial<RestApiConfig> = {}
  ) {
    this.registry = registry;
    this.dotAI = dotAI;
    this.logger = logger;
    this.pluginManager = pluginManager;
    this.config = {
      basePath: '/api',
      version: 'v1',
      enableCors: true,
      requestTimeout: 1800000, // 30 minutes for long-running operations (capability scan with slower AI providers)
      ...config,
    };

    // Initialize route registry and register all routes (PRD #354)
    this.routeRegistry = new RestRouteRegistry(logger);
    registerAllRoutes(this.routeRegistry);
    this.logger.info('REST route registry initialized', {
      routeCount: this.routeRegistry.getRouteCount(),
      tags: this.routeRegistry.getTags(),
    });

    // Initialize OpenAPI generator with route registry (PRD #354)
    this.openApiGenerator = new OpenApiGenerator(
      registry,
      logger,
      {
        basePath: this.config.basePath,
        apiVersion: this.config.version,
      },
      this.routeRegistry
    );
  }

  /**
   * Handle incoming HTTP requests for REST API
   *
   * PRD #354: Uses route registry for matching, dispatches to handlers based on route path.
   */
  async handleRequest(
    req: IncomingMessage,
    res: ServerResponse,
    body?: unknown
  ): Promise<void> {
    const requestId = this.generateRequestId();
    const startTime = Date.now();

    try {
      this.logger.debug('REST API request received', {
        requestId,
        method: req.method,
        // F3: req.url may carry a `?repo=<user-supplied-url>` whose query
        // value includes credentials (PRD #581). Sanitize that single
        // value before logging.
        url: sanitizeRequestUrlForLogging(req.url),
        hasBody: !!body,
      });

      // Handle CORS preflight
      if (this.config.enableCors) {
        this.setCorsHeaders(res);
        if (req.method === 'OPTIONS') {
          res.writeHead(HttpStatus.OK);
          res.end();
          return;
        }
      }

      // Parse URL
      const url = new URL(req.url || '/', 'http://localhost');
      const method = req.method || 'GET';

      // PRD #354: Try route registry first
      const routeMatch = this.routeRegistry.findRoute(method, url.pathname);

      if (routeMatch) {
        this.logger.debug('Route matched via registry', {
          requestId,
          path: routeMatch.route.path,
          method: routeMatch.route.method,
          params: routeMatch.params,
        });

        // Dispatch to handler based on route path
        await this.dispatchRoute(
          req,
          res,
          requestId,
          routeMatch,
          url.searchParams,
          body,
          startTime
        );
        return;
      }

      // Check if path matches but method is wrong (HTTP 405 per RFC 7231)
      const allowedMethods = this.routeRegistry.findAllowedMethods(
        url.pathname
      );
      if (allowedMethods.length > 0) {
        res.setHeader('Allow', allowedMethods.join(', '));
        const methodList = allowedMethods.join(', ');
        const message =
          allowedMethods.length === 1
            ? `Only ${methodList} method allowed`
            : `Only ${methodList} methods allowed`;
        await this.sendErrorResponse(
          res,
          requestId,
          HttpStatus.METHOD_NOT_ALLOWED,
          'METHOD_NOT_ALLOWED',
          message
        );
        return;
      }

      // No match found
      await this.sendErrorResponse(
        res,
        requestId,
        HttpStatus.NOT_FOUND,
        'NOT_FOUND',
        'API endpoint not found'
      );
    } catch (error) {
      this.logger.error(
        'REST API request failed',
        error instanceof Error ? error : new Error(String(error)),
        {
          requestId,
          errorMessage: error instanceof Error ? error.message : String(error),
        }
      );

      await this.sendErrorResponse(
        res,
        requestId,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'INTERNAL_ERROR',
        'An internal server error occurred'
      );
    }
  }

  /**
   * Dispatch request to appropriate handler based on matched route
   * PRD #354: Central dispatch using handler map for registry-matched routes.
   */
  private async dispatchRoute(
    req: IncomingMessage,
    res: ServerResponse,
    requestId: string,
    routeMatch: RouteMatch,
    searchParams: URLSearchParams,
    body: unknown,
    startTime: number
  ): Promise<void> {
    const { route, params } = routeMatch;
    const routeKey = `${route.method}:${route.path}`;

    // Handler map: route key -> handler function
    const handlers: Record<string, () => Promise<void>> = {
      'GET:/api/v1/tools': () =>
        this.handleToolDiscovery(req, res, requestId, searchParams),
      'POST:/api/v1/tools/:toolName': () =>
        this.handleToolExecution(
          req,
          res,
          requestId,
          params.toolName,
          body,
          startTime
        ),
      'GET:/api/v1/openapi': () => this.handleOpenApiSpec(req, res, requestId),
      'GET:/api/v1/resources': () =>
        this.handleListResources(req, res, requestId, searchParams),
      'GET:/api/v1/resources/kinds': () =>
        this.handleGetResourceKinds(req, res, requestId, searchParams),
      'GET:/api/v1/resources/search': () =>
        this.handleSearchResources(req, res, requestId, searchParams),
      'POST:/api/v1/resources/sync': () =>
        this.handleResourceSyncRequest(req, res, requestId, body),
      'GET:/api/v1/resource': () =>
        this.handleGetResource(req, res, requestId, searchParams),
      'GET:/api/v1/namespaces': () =>
        this.handleGetNamespaces(req, res, requestId),
      'GET:/api/v1/events': () =>
        this.handleGetEvents(req, res, requestId, searchParams),
      'GET:/api/v1/logs': () =>
        this.handleGetLogs(req, res, requestId, searchParams),
      'GET:/api/v1/prompts': () =>
        this.handlePromptsListRequest(req, res, requestId, searchParams),
      'POST:/api/v1/prompts/refresh': () =>
        this.handlePromptsCacheRefresh(req, res, requestId, body),
      'POST:/api/v1/prompts/sources': () =>
        this.handlePromptsSourceIngest(req, res, requestId, body),
      'POST:/api/v1/prompts/:promptName': () =>
        this.handlePromptsGetRequest(
          req,
          res,
          requestId,
          params.promptName,
          body,
          searchParams
        ),
      'GET:/api/v1/visualize/:sessionId': () =>
        this.handleVisualize(
          req,
          res,
          requestId,
          params.sessionId,
          searchParams
        ),
      'GET:/api/v1/events/remediations': () =>
        this.handleRemediationSSE(req, res, requestId),
      'GET:/api/v1/sessions': () =>
        this.handleListSessions(req, res, requestId, searchParams),
      'GET:/api/v1/sessions/:sessionId': () =>
        this.handleSessionRetrieval(req, res, requestId, params.sessionId),
      'DELETE:/api/v1/knowledge/source/:sourceIdentifier': () =>
        this.handleDeleteKnowledgeSource(
          req,
          res,
          requestId,
          params.sourceIdentifier
        ),
      'POST:/api/v1/knowledge/ask': () =>
        this.handleKnowledgeAsk(req, res, requestId, body),
      'POST:/api/v1/embeddings/migrate': () =>
        this.handleEmbeddingMigrationRequest(req, res, requestId, body),
      // User management (PRD #380 Task 2.5)
      'POST:/api/v1/users': () =>
        this.handleCreateUser(req, res, requestId, body),
      'GET:/api/v1/users': () => this.handleListUsers(req, res, requestId),
      'DELETE:/api/v1/users/:email': () =>
        this.handleDeleteUser(req, res, requestId, params.email),
    };

    const handler = handlers[routeKey];
    if (handler) {
      await handler();
    } else {
      this.logger.warn('Route matched but no handler found', {
        requestId,
        routeKey,
      });
      await this.sendErrorResponse(
        res,
        requestId,
        HttpStatus.NOT_FOUND,
        'NOT_FOUND',
        'Handler not found for route'
      );
    }
  }

  /**
   * Handle tool discovery requests
   */
  private async handleToolDiscovery(
    req: IncomingMessage,
    res: ServerResponse,
    requestId: string,
    searchParams: URLSearchParams
  ): Promise<void> {
    try {
      const category = searchParams.get('category') || undefined;
      const tag = searchParams.get('tag') || undefined;
      const search = searchParams.get('search') || undefined;

      let tools = this.registry.getToolsFiltered({ category, tag, search });

      // RBAC-filtered tool discovery (PRD #392) — OAuth users only see authorized tools
      const discoveryIdentity = getCurrentIdentity();
      tools = await filterAuthorizedTools(discoveryIdentity, tools);

      // Check user management access and include as virtual "users" tool (PRD #392)
      const userAccessResult = await checkToolAccess(discoveryIdentity, {
        toolName: 'manageUsers',
        resource: 'users',
      });
      if (userAccessResult.allowed) {
        tools = [
          ...tools,
          {
            name: 'users',
            description: 'Manage users (create, list, delete)',
            schema: { type: 'object', properties: {} },
            category: 'Administration',
            tags: ['users', 'administration', 'management'],
          },
        ];
      }

      const categories = this.registry.getCategories();
      const tags = this.registry.getTags();

      const response: ToolDiscoveryResponse = {
        success: true,
        data: {
          tools,
          total: tools.length,
          categories,
          tags,
        },
        meta: {
          timestamp: new Date().toISOString(),
          requestId,
          version: this.config.version,
        },
      };

      await this.sendJsonResponse(res, HttpStatus.OK, response);

      this.logger.info('Tool discovery request completed', {
        requestId,
        totalTools: tools.length,
        filters: { category, tag, search },
      });
    } catch {
      await this.sendErrorResponse(
        res,
        requestId,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'DISCOVERY_ERROR',
        'Failed to retrieve tool information'
      );
    }
  }

  /**
   * Handle tool execution requests
   */
  private async handleToolExecution(
    req: IncomingMessage,
    res: ServerResponse,
    requestId: string,
    toolName: string,
    body: unknown,
    startTime: number
  ): Promise<void> {
    try {
      // Check if tool exists
      const toolMetadata = this.registry.getTool(toolName);
      if (!toolMetadata) {
        await this.sendErrorResponse(
          res,
          requestId,
          HttpStatus.NOT_FOUND,
          'TOOL_NOT_FOUND',
          `Tool '${toolName}' not found`
        );
        return;
      }

      // RBAC enforcement (PRD #392) — check tool-level authorization for OAuth users
      const identity = getCurrentIdentity();
      if (identity) {
        const rbacResult = await checkToolAccess(identity, { toolName });
        if (!rbacResult.allowed) {
          await this.sendErrorResponse(
            res,
            requestId,
            403 as HttpStatus,
            'FORBIDDEN',
            `Access denied: tool '${toolName}' not authorized for user '${identity.email}'`
          );
          return;
        }
      }

      // Validate request body
      if (!body || typeof body !== 'object') {
        await this.sendErrorResponse(
          res,
          requestId,
          HttpStatus.BAD_REQUEST,
          'INVALID_REQUEST',
          'Request body must be a JSON object'
        );
        return;
      }

      this.logger.info('Executing tool via REST API', {
        requestId,
        toolName,
        parameters: Object.keys(body),
      });

      // Execute the tool handler with timeout
      // Note: Tool handlers expect the same format as MCP calls
      // PRD #343: Pass pluginManager for kubectl operations via plugin system
      const timeoutMs = this.config.requestTimeout;
      const toolPromise = toolMetadata.handler(
        body,
        this.dotAI,
        this.logger,
        requestId,
        this.pluginManager
      );
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error('Request timeout exceeded')),
          timeoutMs
        )
      );
      // Prevent unhandled rejection if toolPromise resolves after timeout
      toolPromise.catch(() => {});
      const mcpResult = (await Promise.race([toolPromise, timeoutPromise])) as {
        content?: Array<{ type: string; text: string }>;
      };

      // Transform MCP format to proper REST JSON
      // All MCP tools return JSON.stringify() in content[0].text, so parse it back to proper JSON
      let transformedResult;
      if (mcpResult?.content?.[0]?.type === 'text') {
        try {
          transformedResult = JSON.parse(mcpResult.content[0].text);
        } catch (parseError) {
          this.logger.warn(
            'Failed to parse MCP tool result as JSON, returning as text',
            {
              requestId,
              toolName,
              error:
                parseError instanceof Error
                  ? parseError.message
                  : String(parseError),
            }
          );
          transformedResult = mcpResult.content[0].text;
        }
      } else {
        // Fallback for unexpected format
        transformedResult = mcpResult;
      }

      const executionTime = Date.now() - startTime;

      const response: ToolExecutionResponse = {
        success: true,
        data: {
          result: transformedResult,
          tool: toolName,
          executionTime,
        },
        meta: {
          timestamp: new Date().toISOString(),
          requestId,
          version: this.config.version,
        },
      };

      await this.sendJsonResponse(res, HttpStatus.OK, response);

      this.logger.info('Tool execution completed', {
        requestId,
        toolName,
        executionTime,
        success: true,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        'Tool execution failed',
        error instanceof Error ? error : new Error(String(error)),
        {
          requestId,
          toolName,
          errorMessage,
        }
      );

      await this.sendErrorResponse(
        res,
        requestId,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'EXECUTION_ERROR',
        errorMessage
      );
    }
  }

  /**
   * Handle OpenAPI specification requests
   */
  private async handleOpenApiSpec(
    req: IncomingMessage,
    res: ServerResponse,
    requestId: string
  ): Promise<void> {
    try {
      this.logger.debug('Generating OpenAPI specification', { requestId });

      const spec = this.openApiGenerator.generateSpec();

      await this.sendJsonResponse(res, HttpStatus.OK, spec);

      this.logger.info('OpenAPI specification served successfully', {
        requestId,
        pathCount: Object.keys(spec.paths).length,
        componentCount: Object.keys(spec.components?.schemas || {}).length,
      });
    } catch (error) {
      this.logger.error(
        'Failed to generate OpenAPI specification',
        error instanceof Error ? error : new Error(String(error)),
        {
          requestId,
          errorMessage: error instanceof Error ? error.message : String(error),
        }
      );

      await this.sendErrorResponse(
        res,
        requestId,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'OPENAPI_ERROR',
        'Failed to generate OpenAPI specification'
      );
    }
  }

  /**
   * Handle resource sync requests from controller
   */
  private async handleResourceSyncRequest(
    req: IncomingMessage,
    res: ServerResponse,
    requestId: string,
    body: unknown
  ): Promise<void> {
    try {
      this.logger.info('Processing resource sync request', { requestId });

      // Validate request body exists
      if (!body || typeof body !== 'object') {
        await this.sendErrorResponse(
          res,
          requestId,
          HttpStatus.BAD_REQUEST,
          'INVALID_REQUEST',
          'Request body must be a JSON object'
        );
        return;
      }

      // Delegate to the resource sync handler
      const response = await handleResourceSync(body, this.logger, requestId);

      // Determine HTTP status based on response and error type
      let httpStatus = HttpStatus.OK;
      if (!response.success) {
        const errorCode = response.error?.code;
        if (
          errorCode === 'VECTOR_DB_UNAVAILABLE' ||
          errorCode === 'HEALTH_CHECK_FAILED'
        ) {
          httpStatus = HttpStatus.SERVICE_UNAVAILABLE;
        } else if (
          errorCode === 'SERVICE_INIT_FAILED' ||
          errorCode === 'COLLECTION_INIT_FAILED' ||
          errorCode === 'RESYNC_FAILED'
        ) {
          httpStatus = HttpStatus.INTERNAL_SERVER_ERROR;
        } else {
          httpStatus = HttpStatus.BAD_REQUEST;
        }
      }

      await this.sendJsonResponse(res, httpStatus, response);

      this.logger.info('Resource sync request completed', {
        requestId,
        success: response.success,
        upserted: (response.data as Record<string, unknown>)?.upserted,
        deleted: (response.data as Record<string, unknown>)?.deleted,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        'Resource sync request failed',
        error instanceof Error ? error : new Error(String(error)),
        {
          requestId,
          errorMessage,
        }
      );

      await this.sendErrorResponse(
        res,
        requestId,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'SYNC_ERROR',
        'Resource sync failed',
        { error: errorMessage }
      );
    }
  }

  /**
   * Handle GET /api/v1/resources/kinds (PRD #328)
   * Returns all unique resource kinds with counts
   * Supports optional namespace query parameter for filtering
   */
  private async handleGetResourceKinds(
    req: IncomingMessage,
    res: ServerResponse,
    requestId: string,
    searchParams: URLSearchParams
  ): Promise<void> {
    try {
      const namespace = searchParams.get('namespace') || undefined;

      this.logger.info('Processing get resource kinds request', {
        requestId,
        namespace,
      });

      const kinds = await getResourceKinds(namespace);

      const response: RestApiResponse = {
        success: true,
        data: {
          kinds,
        },
        meta: {
          timestamp: new Date().toISOString(),
          requestId,
          version: this.config.version,
        },
      };

      await this.sendJsonResponse(res, HttpStatus.OK, response);

      this.logger.info('Get resource kinds request completed', {
        requestId,
        kindCount: kinds.length,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        'Get resource kinds request failed',
        error instanceof Error ? error : new Error(String(error)),
        {
          requestId,
          errorMessage,
        }
      );

      await this.sendErrorResponse(
        res,
        requestId,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'RESOURCE_KINDS_ERROR',
        'Failed to retrieve resource kinds',
        { error: errorMessage }
      );
    }
  }

  /**
   * Handle GET /api/v1/resources/search (PRD #328)
   * Semantic search for resources with optional exact filters
   */
  private async handleSearchResources(
    req: IncomingMessage,
    res: ServerResponse,
    requestId: string,
    searchParams: URLSearchParams
  ): Promise<void> {
    try {
      // Extract query parameters
      const q = searchParams.get('q');
      const namespace = searchParams.get('namespace') || undefined;
      const kind = searchParams.get('kind') || undefined;
      const apiVersion = searchParams.get('apiVersion') || undefined;
      const limitParam = searchParams.get('limit');
      const offsetParam = searchParams.get('offset');
      const minScoreParam = searchParams.get('minScore');

      // Validate required parameters
      if (!q) {
        await this.sendErrorResponse(
          res,
          requestId,
          HttpStatus.BAD_REQUEST,
          'MISSING_PARAMETER',
          'The "q" query parameter is required for search'
        );
        return;
      }

      const limit = limitParam ? parseInt(limitParam, 10) : 100;
      const offset = offsetParam ? parseInt(offsetParam, 10) : 0;
      const minScore = minScoreParam ? parseFloat(minScoreParam) : undefined;

      // Validate numeric parameters
      if (limitParam && (isNaN(limit) || limit < 1)) {
        await this.sendErrorResponse(
          res,
          requestId,
          HttpStatus.BAD_REQUEST,
          'INVALID_PARAMETER',
          'The "limit" parameter must be a positive integer'
        );
        return;
      }

      if (offsetParam && (isNaN(offset) || offset < 0)) {
        await this.sendErrorResponse(
          res,
          requestId,
          HttpStatus.BAD_REQUEST,
          'INVALID_PARAMETER',
          'The "offset" parameter must be a non-negative integer'
        );
        return;
      }

      if (
        minScoreParam &&
        (isNaN(minScore!) || minScore! < 0 || minScore! > 1)
      ) {
        await this.sendErrorResponse(
          res,
          requestId,
          HttpStatus.BAD_REQUEST,
          'INVALID_PARAMETER',
          'The "minScore" parameter must be a number between 0 and 1'
        );
        return;
      }

      this.logger.info('Processing search resources request', {
        requestId,
        query: q,
        namespace,
        kind,
        apiVersion,
        limit,
        offset,
        minScore,
      });

      // Build filters
      const filters: {
        namespace?: string;
        kind?: string;
        apiVersion?: string;
      } = {};
      if (namespace) filters.namespace = namespace;
      if (kind) filters.kind = kind;
      if (apiVersion) filters.apiVersion = apiVersion;

      // Perform search using ResourceVectorService singleton
      const { getResourceService } = await import('../core/resource-tools');
      const service = await getResourceService();

      // Request more results than needed for offset pagination
      const searchLimit = limit + offset;
      const results = await service.searchResources(
        q,
        Object.keys(filters).length > 0 ? filters : undefined,
        searchLimit,
        minScore
      );

      // Apply offset pagination
      const paginatedResults = results.slice(offset, offset + limit);

      // Transform results to include score for relevance ranking
      const resources = paginatedResults.map(r => ({
        name: r.resource.name,
        namespace: r.resource.namespace,
        kind: r.resource.kind,
        apiVersion: r.resource.apiVersion,
        labels: r.resource.labels || {},
        createdAt: r.resource.createdAt,
        score: r.score,
      }));

      const response: RestApiResponse = {
        success: true,
        data: {
          resources,
          total: results.length,
          limit,
          offset,
        },
        meta: {
          timestamp: new Date().toISOString(),
          requestId,
          version: this.config.version,
        },
      };

      await this.sendJsonResponse(res, HttpStatus.OK, response);

      this.logger.info('Search resources request completed', {
        requestId,
        query: q,
        resultCount: resources.length,
        totalMatches: results.length,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        'Search resources request failed',
        error instanceof Error ? error : new Error(String(error)),
        {
          requestId,
          errorMessage,
        }
      );

      await this.sendErrorResponse(
        res,
        requestId,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'SEARCH_ERROR',
        'Failed to search resources',
        { error: errorMessage }
      );
    }
  }

  /**
   * Handle GET /api/v1/resources (PRD #328)
   * Returns filtered and paginated list of resources
   * Supports optional live status enrichment from K8s API
   */
  private async handleListResources(
    req: IncomingMessage,
    res: ServerResponse,
    requestId: string,
    searchParams: URLSearchParams
  ): Promise<void> {
    try {
      // Extract query parameters
      const kind = searchParams.get('kind');
      const apiVersion = searchParams.get('apiVersion');
      const namespace = searchParams.get('namespace') || undefined;
      const includeStatusParam = searchParams.get('includeStatus');
      const limitParam = searchParams.get('limit');
      const offsetParam = searchParams.get('offset');

      // Validate required parameters
      if (!kind) {
        await this.sendErrorResponse(
          res,
          requestId,
          HttpStatus.BAD_REQUEST,
          'MISSING_PARAMETER',
          'The "kind" query parameter is required'
        );
        return;
      }

      if (!apiVersion) {
        await this.sendErrorResponse(
          res,
          requestId,
          HttpStatus.BAD_REQUEST,
          'MISSING_PARAMETER',
          'The "apiVersion" query parameter is required'
        );
        return;
      }

      const limit = limitParam ? parseInt(limitParam, 10) : undefined;
      const offset = offsetParam ? parseInt(offsetParam, 10) : undefined;
      const includeStatus = includeStatusParam === 'true';

      // Validate numeric parameters
      if (limitParam && (isNaN(limit!) || limit! < 1)) {
        await this.sendErrorResponse(
          res,
          requestId,
          HttpStatus.BAD_REQUEST,
          'INVALID_PARAMETER',
          'The "limit" parameter must be a positive integer'
        );
        return;
      }

      if (offsetParam && (isNaN(offset!) || offset! < 0)) {
        await this.sendErrorResponse(
          res,
          requestId,
          HttpStatus.BAD_REQUEST,
          'INVALID_PARAMETER',
          'The "offset" parameter must be a non-negative integer'
        );
        return;
      }

      this.logger.info('Processing list resources request', {
        requestId,
        kind,
        apiVersion,
        namespace,
        includeStatus,
        limit,
        offset,
      });

      // PRD #343: Never pass includeStatus to listResources (it uses direct kubectl)
      // Fetch status via plugin separately if requested
      const result = await listResources({
        kind,
        apiVersion,
        namespace,
        limit,
        offset,
      });

      // Enrich with live status via plugin if requested
      // PRD #359: Use unified plugin registry
      if (
        includeStatus &&
        result.resources.length > 0 &&
        isPluginInitialized()
      ) {
        // Process status fetches in batches to avoid overwhelming the
        // agentic-tools pod with concurrent kubectl processes
        const batchSize = 5;
        const enrichedResources = [];
        for (let i = 0; i < result.resources.length; i += batchSize) {
          const batch = result.resources.slice(i, i + batchSize);
          const batchResults = await Promise.all(
            batch.map(async resource => {
              const resourceType = resource.apiGroup
                ? `${resource.kind.toLowerCase()}.${resource.apiGroup}`
                : resource.kind.toLowerCase();
              const resourceId = `${resourceType}/${resource.name}`;

              const pluginResponse = await invokePluginTool(
                'agentic-tools',
                'kubectl_get_resource_json',
                {
                  resource: resourceId,
                  namespace: resource.namespace,
                  field: 'status',
                }
              );

              if (pluginResponse.success && pluginResponse.result) {
                const pluginResult = pluginResponse.result as {
                  success: boolean;
                  data: string;
                };
                if (pluginResult.success && pluginResult.data) {
                  try {
                    return {
                      ...resource,
                      status: JSON.parse(pluginResult.data),
                    };
                  } catch {
                    return resource;
                  }
                }
              }
              return resource;
            })
          );
          enrichedResources.push(...batchResults);
        }
        result.resources = enrichedResources;
      }

      const response: RestApiResponse = {
        success: true,
        data: result,
        meta: {
          timestamp: new Date().toISOString(),
          requestId,
          version: this.config.version,
        },
      };

      await this.sendJsonResponse(res, HttpStatus.OK, response);

      this.logger.info('List resources request completed', {
        requestId,
        resourceCount: result.resources.length,
        total: result.total,
        includeStatus,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        'List resources request failed',
        error instanceof Error ? error : new Error(String(error)),
        {
          requestId,
          errorMessage,
        }
      );

      await this.sendErrorResponse(
        res,
        requestId,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'LIST_RESOURCES_ERROR',
        'Failed to list resources',
        { error: errorMessage }
      );
    }
  }

  /**
   * Handle GET /api/v1/namespaces (PRD #328)
   * Returns all unique namespaces
   */
  private async handleGetNamespaces(
    req: IncomingMessage,
    res: ServerResponse,
    requestId: string
  ): Promise<void> {
    try {
      this.logger.info('Processing get namespaces request', { requestId });

      const namespaces = await getNamespaces();

      const response: RestApiResponse = {
        success: true,
        data: {
          namespaces,
        },
        meta: {
          timestamp: new Date().toISOString(),
          requestId,
          version: this.config.version,
        },
      };

      await this.sendJsonResponse(res, HttpStatus.OK, response);

      this.logger.info('Get namespaces request completed', {
        requestId,
        namespaceCount: namespaces.length,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        'Get namespaces request failed',
        error instanceof Error ? error : new Error(String(error)),
        {
          requestId,
          errorMessage,
        }
      );

      await this.sendErrorResponse(
        res,
        requestId,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'NAMESPACES_ERROR',
        'Failed to retrieve namespaces',
        { error: errorMessage }
      );
    }
  }

  /**
   * Handle GET /api/v1/resource (PRD #328)
   * Returns a single resource with full metadata, spec, and status
   */
  private async handleGetResource(
    req: IncomingMessage,
    res: ServerResponse,
    requestId: string,
    searchParams: URLSearchParams
  ): Promise<void> {
    try {
      const kind = searchParams.get('kind');
      const apiVersion = searchParams.get('apiVersion');
      const name = searchParams.get('name');
      const namespace = searchParams.get('namespace') || undefined;

      // Validate required parameters
      if (!kind) {
        await this.sendErrorResponse(
          res,
          requestId,
          HttpStatus.BAD_REQUEST,
          'BAD_REQUEST',
          'kind query parameter is required'
        );
        return;
      }
      if (!apiVersion) {
        await this.sendErrorResponse(
          res,
          requestId,
          HttpStatus.BAD_REQUEST,
          'BAD_REQUEST',
          'apiVersion query parameter is required'
        );
        return;
      }
      if (!name) {
        await this.sendErrorResponse(
          res,
          requestId,
          HttpStatus.BAD_REQUEST,
          'BAD_REQUEST',
          'name query parameter is required'
        );
        return;
      }

      this.logger.info('Processing get resource request', {
        requestId,
        kind,
        apiVersion,
        name,
        namespace,
      });

      // Extract apiGroup from apiVersion (e.g., "apps/v1" -> "apps", "v1" -> "")
      const apiGroup = apiVersion.includes('/') ? apiVersion.split('/')[0] : '';

      // PRD #359: Use unified plugin registry
      if (!isPluginInitialized()) {
        await this.sendErrorResponse(
          res,
          requestId,
          HttpStatus.SERVICE_UNAVAILABLE,
          'PLUGIN_UNAVAILABLE',
          'Plugin system not initialized'
        );
        return;
      }

      // Build resource identifier (kind.group/name or kind/name for core resources)
      const resourceType = apiGroup
        ? `${kind.toLowerCase()}.${apiGroup}`
        : kind.toLowerCase();
      const resourceId = `${resourceType}/${name}`;

      // PRD #359: Use unified plugin registry for kubectl operations
      const pluginResponse = await invokePluginTool(
        'agentic-tools',
        'kubectl_get_resource_json',
        {
          resource: resourceId,
          namespace: namespace,
        }
      );

      // Check for plugin-level failures first
      if (!pluginResponse.success) {
        const errorMsg =
          pluginResponse.error?.message || 'Plugin invocation failed';
        await this.sendErrorResponse(
          res,
          requestId,
          HttpStatus.BAD_GATEWAY,
          'PLUGIN_ERROR',
          `Kubernetes plugin error: ${errorMsg}`
        );
        return;
      }

      let resource: object | undefined;
      let pluginError: string | undefined;
      if (pluginResponse.result) {
        const result = pluginResponse.result as {
          success: boolean;
          data: string;
          error?: string;
        };
        if (result.success && result.data) {
          try {
            resource = JSON.parse(result.data);
          } catch (parseError) {
            pluginError = `Failed to parse resource JSON: ${parseError instanceof Error ? parseError.message : String(parseError)}`;
          }
        } else if (!result.success) {
          // kubectl command failed - check if it's a "not found" error
          pluginError = result.error || 'kubectl command failed';
        }
      }

      // Handle parse errors
      if (pluginError && !pluginError.toLowerCase().includes('not found')) {
        await this.sendErrorResponse(
          res,
          requestId,
          HttpStatus.BAD_GATEWAY,
          'KUBECTL_ERROR',
          pluginError
        );
        return;
      }

      if (!resource) {
        await this.sendErrorResponse(
          res,
          requestId,
          HttpStatus.NOT_FOUND,
          'NOT_FOUND',
          `Resource ${kind}/${name} not found${namespace ? ` in namespace ${namespace}` : ''}`
        );
        return;
      }

      const response: RestApiResponse = {
        success: true,
        data: {
          resource,
        },
        meta: {
          timestamp: new Date().toISOString(),
          requestId,
          version: this.config.version,
        },
      };

      await this.sendJsonResponse(res, HttpStatus.OK, response);

      this.logger.info('Get resource request completed', {
        requestId,
        kind,
        name,
        namespace,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        'Get resource request failed',
        error instanceof Error ? error : new Error(String(error)),
        {
          requestId,
          errorMessage,
        }
      );

      await this.sendErrorResponse(
        res,
        requestId,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'RESOURCE_ERROR',
        'Failed to retrieve resource',
        { error: errorMessage }
      );
    }
  }

  /**
   * Handle GET /api/v1/events (PRD #328)
   * Returns Kubernetes events for a specific resource
   */
  private async handleGetEvents(
    req: IncomingMessage,
    res: ServerResponse,
    requestId: string,
    searchParams: URLSearchParams
  ): Promise<void> {
    try {
      const name = searchParams.get('name');
      const kind = searchParams.get('kind');
      const namespace = searchParams.get('namespace') || undefined;
      const uid = searchParams.get('uid') || undefined;

      // Validate required parameters
      if (!name) {
        await this.sendErrorResponse(
          res,
          requestId,
          HttpStatus.BAD_REQUEST,
          'BAD_REQUEST',
          'name query parameter is required'
        );
        return;
      }
      if (!kind) {
        await this.sendErrorResponse(
          res,
          requestId,
          HttpStatus.BAD_REQUEST,
          'BAD_REQUEST',
          'kind query parameter is required'
        );
        return;
      }

      this.logger.info('Processing get events request', {
        requestId,
        name,
        kind,
        namespace,
        uid,
      });

      // PRD #359: Use unified plugin registry
      if (!isPluginInitialized()) {
        await this.sendErrorResponse(
          res,
          requestId,
          HttpStatus.SERVICE_UNAVAILABLE,
          'PLUGIN_UNAVAILABLE',
          'Plugin system not initialized'
        );
        return;
      }

      // Build field selector for involvedObject filtering
      const fieldSelectors: string[] = [
        `involvedObject.name=${name}`,
        `involvedObject.kind=${kind}`,
      ];
      if (uid) {
        fieldSelectors.push(`involvedObject.uid=${uid}`);
      }

      // PRD #359: Use unified plugin registry for kubectl operations
      const pluginResponse = await invokePluginTool(
        'agentic-tools',
        'kubectl_events',
        {
          namespace: namespace,
          args: [`--field-selector=${fieldSelectors.join(',')}`],
        }
      );

      const events: Array<{
        lastTimestamp: string;
        type: string;
        reason: string;
        involvedObject: { kind: string; name: string };
        message: string;
      }> = [];
      if (pluginResponse.success && pluginResponse.result) {
        const pluginResult = pluginResponse.result as {
          success: boolean;
          data: string;
        };
        if (pluginResult.success && pluginResult.data) {
          // Parse the table output or handle JSON if available
          // Events output is typically table format, so we need to parse it
          const lines = pluginResult.data
            .split('\n')
            .filter(line => line.trim());
          if (lines.length > 1) {
            // Skip header line, parse remaining lines
            for (let i = 1; i < lines.length; i++) {
              const parts = lines[i].split(/\s{2,}/);
              if (parts.length >= 5) {
                events.push({
                  lastTimestamp: parts[0],
                  type: parts[1],
                  reason: parts[2],
                  involvedObject: { kind, name },
                  message: parts.slice(4).join(' '),
                });
              }
            }
          }
        }
      }

      const response: RestApiResponse = {
        success: true,
        data: {
          events,
          count: events.length,
        },
        meta: {
          timestamp: new Date().toISOString(),
          requestId,
          version: this.config.version,
        },
      };

      await this.sendJsonResponse(res, HttpStatus.OK, response);

      this.logger.info('Get events request completed', {
        requestId,
        name,
        kind,
        namespace,
        eventCount: events.length,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        'Get events request failed',
        error instanceof Error ? error : new Error(String(error)),
        {
          requestId,
          errorMessage,
        }
      );

      await this.sendErrorResponse(
        res,
        requestId,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'EVENTS_ERROR',
        'Failed to retrieve events',
        { error: errorMessage }
      );
    }
  }

  /**
   * Handle GET /api/v1/logs (PRD #328)
   * Returns container logs for a pod
   */
  private async handleGetLogs(
    req: IncomingMessage,
    res: ServerResponse,
    requestId: string,
    searchParams: URLSearchParams
  ): Promise<void> {
    try {
      const name = searchParams.get('name');
      const namespace = searchParams.get('namespace');
      const container = searchParams.get('container') || undefined;
      const tailLinesParam = searchParams.get('tailLines');

      // Validate required parameters
      if (!name) {
        await this.sendErrorResponse(
          res,
          requestId,
          HttpStatus.BAD_REQUEST,
          'BAD_REQUEST',
          'name query parameter is required'
        );
        return;
      }
      if (!namespace) {
        await this.sendErrorResponse(
          res,
          requestId,
          HttpStatus.BAD_REQUEST,
          'BAD_REQUEST',
          'namespace query parameter is required'
        );
        return;
      }

      // Parse tailLines with validation
      let tailLines: number | undefined;
      if (tailLinesParam) {
        tailLines = parseInt(tailLinesParam, 10);
        if (isNaN(tailLines) || tailLines < 1) {
          await this.sendErrorResponse(
            res,
            requestId,
            HttpStatus.BAD_REQUEST,
            'INVALID_PARAMETER',
            'tailLines must be a positive integer'
          );
          return;
        }
      }

      this.logger.info('Processing get logs request', {
        requestId,
        name,
        namespace,
        container,
        tailLines,
      });

      // PRD #359: Use unified plugin registry
      if (!isPluginInitialized()) {
        await this.sendErrorResponse(
          res,
          requestId,
          HttpStatus.SERVICE_UNAVAILABLE,
          'PLUGIN_UNAVAILABLE',
          'Plugin system not initialized'
        );
        return;
      }

      // Build args for kubectl_logs
      const args: string[] = [];
      if (tailLines) {
        args.push(`--tail=${tailLines}`);
      }
      if (container) {
        args.push('-c', container);
      }

      // PRD #359: Use unified plugin registry for kubectl operations
      const pluginResponse = await invokePluginTool(
        'agentic-tools',
        'kubectl_logs',
        {
          resource: name,
          namespace: namespace,
          args: args.length > 0 ? args : undefined,
        }
      );

      if (!pluginResponse.success) {
        const errorMsg =
          pluginResponse.error?.message || 'Failed to retrieve logs';
        await this.sendErrorResponse(
          res,
          requestId,
          HttpStatus.INTERNAL_SERVER_ERROR,
          'LOGS_ERROR',
          'Failed to retrieve logs',
          { error: errorMsg }
        );
        return;
      }

      const result = pluginResponse.result as {
        success: boolean;
        data: string;
        message: string;
      };
      if (!result.success) {
        await this.sendErrorResponse(
          res,
          requestId,
          HttpStatus.INTERNAL_SERVER_ERROR,
          'LOGS_ERROR',
          'Failed to retrieve logs',
          { error: result.message || 'Unknown error' }
        );
        return;
      }

      const response: RestApiResponse = {
        success: true,
        data: {
          logs: result.data,
          container: container || 'default',
          containerCount: 1,
        },
        meta: {
          timestamp: new Date().toISOString(),
          requestId,
          version: this.config.version,
        },
      };

      await this.sendJsonResponse(res, HttpStatus.OK, response);

      this.logger.info('Get logs request completed', {
        requestId,
        name,
        namespace,
        container: container || 'default',
        logLength: result.data.length,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        'Get logs request failed',
        error instanceof Error ? error : new Error(String(error)),
        {
          requestId,
          errorMessage,
        }
      );

      await this.sendErrorResponse(
        res,
        requestId,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'LOGS_ERROR',
        'Failed to retrieve logs',
        { error: errorMessage }
      );
    }
  }

  /**
   * Handle prompts list requests
   */
  private async handlePromptsListRequest(
    req: IncomingMessage,
    res: ServerResponse,
    requestId: string,
    searchParams: URLSearchParams
  ): Promise<void> {
    try {
      this.logger.info('Processing prompts list request', { requestId });

      // PRD #581: ?repo= override. PRD #621 M1: ?path= / ?branch= thread into
      // candidate.subPath / candidate.branch (absent → unchanged behavior).
      // PRD #621 M2: X-Dot-AI-Git-Token header authenticates the override clone
      // (inert when no ?repo= override is present).
      // PRD #647 list-by-source: ?source= selects an already-ingested source,
      // resolved from the in-memory upload cache with no git operation (same
      // signal as the render path). Absent → byte-identical to today (env-var /
      // built-in set), so the no-?source= behavior is unchanged.
      const overrideResult = extractPromptsOverride(
        searchParams.get('repo'),
        searchParams.get('path'),
        searchParams.get('branch'),
        readGitTokenHeader(req),
        searchParams.get('source')
      );
      if (!overrideResult.ok) {
        await this.sendErrorResponse(
          res,
          requestId,
          HttpStatus.BAD_REQUEST,
          'VALIDATION_ERROR',
          overrideResult.message
        );
        return;
      }

      const result = await handlePromptsListRequest(
        {},
        this.logger,
        requestId,
        overrideResult.override
      );

      const response: RestApiResponse = {
        success: true,
        data: result,
        meta: {
          timestamp: new Date().toISOString(),
          requestId,
          version: this.config.version,
        },
      };

      await this.sendJsonResponse(res, HttpStatus.OK, response);

      this.logger.info('Prompts list request completed', {
        requestId,
        promptCount: result.prompts?.length || 0,
      });
    } catch (error) {
      // A per-request override (?repo=) whose source can't be loaded is a
      // bad-gateway condition, not a server fault: surface it (issue #575)
      // instead of silently serving built-in prompts with HTTP 200. The
      // message is already credential-scrubbed by the loader.
      if (error instanceof UserPromptsOverrideError) {
        await this.sendErrorResponse(
          res,
          requestId,
          HttpStatus.BAD_GATEWAY,
          'PROMPTS_SOURCE_ERROR',
          error.message
        );
        return;
      }

      // PRD #647 list-by-source (D2): an unknown/evicted ?source= identifier is
      // a caller-actionable validation error — surface the re-upload guidance as
      // a 400 (same mapping the render handler uses), NOT a generic 500 or a
      // silent success-with-builtins. The message names POST
      // /api/v1/prompts/sources and carries no clone/git/scheme vocabulary.
      const listErrorMessage =
        error instanceof Error ? error.message : String(error);
      if (listErrorMessage.includes('Ingested source not found')) {
        await this.sendErrorResponse(
          res,
          requestId,
          HttpStatus.BAD_REQUEST,
          'VALIDATION_ERROR',
          listErrorMessage
        );
        return;
      }

      this.logger.error(
        'Prompts list request failed',
        error instanceof Error ? error : new Error(String(error)),
        {
          requestId,
        }
      );

      await this.sendErrorResponse(
        res,
        requestId,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'PROMPTS_LIST_ERROR',
        'Failed to list prompts'
      );
    }
  }

  /**
   * Handle prompt get requests
   */
  private async handlePromptsGetRequest(
    req: IncomingMessage,
    res: ServerResponse,
    requestId: string,
    promptName: string,
    body: unknown,
    searchParams: URLSearchParams
  ): Promise<void> {
    try {
      this.logger.info('Processing prompt get request', {
        requestId,
        promptName,
      });

      // PRD #581: ?repo= override. PRD #621 M1: ?path= / ?branch= thread into
      // candidate.subPath / candidate.branch (absent → unchanged behavior).
      // PRD #621 M2: X-Dot-AI-Git-Token header authenticates the override clone
      // (inert when no ?repo= override is present).
      // PRD #647 D1/M3: ?source= selects an already-ingested source, resolved
      // from the in-memory upload cache with no git operation (precedence over
      // ?repo=). Absent → unchanged behavior, so the env-var/clone paths are
      // byte-identical to today.
      const overrideResult = extractPromptsOverride(
        searchParams.get('repo'),
        searchParams.get('path'),
        searchParams.get('branch'),
        readGitTokenHeader(req),
        searchParams.get('source')
      );
      if (!overrideResult.ok) {
        await this.sendErrorResponse(
          res,
          requestId,
          HttpStatus.BAD_REQUEST,
          'VALIDATION_ERROR',
          overrideResult.message
        );
        return;
      }

      const bodyObj = body as
        | { arguments?: Record<string, string> }
        | undefined;
      const result = await handlePromptsGetRequest(
        { name: promptName, arguments: bodyObj?.arguments },
        this.logger,
        requestId,
        overrideResult.override
      );

      const response: RestApiResponse = {
        success: true,
        data: result,
        meta: {
          timestamp: new Date().toISOString(),
          requestId,
          version: this.config.version,
        },
      };

      await this.sendJsonResponse(res, HttpStatus.OK, response);

      this.logger.info('Prompt get request completed', {
        requestId,
        promptName,
      });
    } catch (error) {
      // A per-request override (?repo=) whose source can't be loaded is a
      // bad-gateway condition (issue #575); surface it before the generic
      // validation/500 mapping. The message is already credential-scrubbed.
      if (error instanceof UserPromptsOverrideError) {
        await this.sendErrorResponse(
          res,
          requestId,
          HttpStatus.BAD_GATEWAY,
          'PROMPTS_SOURCE_ERROR',
          error.message
        );
        return;
      }

      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        'Prompt get request failed',
        error instanceof Error ? error : new Error(String(error)),
        {
          requestId,
          promptName,
        }
      );

      // Check if it's a validation error (missing required arguments, prompt not
      // found, or a missing ingested ?source= identifier — PRD #647 D2, which
      // carries re-upload guidance and must be a 400, not a 500).
      const isValidationError =
        errorMessage.includes('Missing required arguments') ||
        errorMessage.includes('Prompt not found') ||
        errorMessage.includes('Ingested source not found');

      await this.sendErrorResponse(
        res,
        requestId,
        isValidationError
          ? HttpStatus.BAD_REQUEST
          : HttpStatus.INTERNAL_SERVER_ERROR,
        isValidationError ? 'VALIDATION_ERROR' : 'PROMPT_GET_ERROR',
        errorMessage
      );
    }
  }

  /**
   * Handle prompts cache refresh requests (PRD #386, extended PRD #581)
   */
  private async handlePromptsCacheRefresh(
    req: IncomingMessage,
    res: ServerResponse,
    requestId: string,
    body: unknown
  ): Promise<void> {
    try {
      this.logger.info('Processing prompts cache refresh request', {
        requestId,
      });

      // body.repo type is checked inside extractPromptsOverride (it accepts
      // unknown and rejects non-string values with 400 — see F2). PRD #621 M1:
      // body `path` / `branch` thread into candidate.subPath / candidate.branch
      // (absent → unchanged behavior); both are likewise type-checked.
      const bodyObj = body as
        | { repo?: unknown; path?: unknown; branch?: unknown }
        | undefined;
      // PRD #621 M2: the credential always travels as the X-Dot-AI-Git-Token
      // header — never the body — and is inert without a repo override.
      const overrideResult = extractPromptsOverride(
        bodyObj?.repo,
        bodyObj?.path,
        bodyObj?.branch,
        readGitTokenHeader(req)
      );
      if (!overrideResult.ok) {
        await this.sendErrorResponse(
          res,
          requestId,
          HttpStatus.BAD_REQUEST,
          'VALIDATION_ERROR',
          overrideResult.message
        );
        return;
      }

      const prompts = await loadAllPrompts(
        this.logger,
        undefined,
        true,
        overrideResult.override
      );

      const source = computePromptsSource(overrideResult.override);

      const response: RestApiResponse = {
        success: true,
        data: {
          refreshed: true,
          promptsLoaded: prompts.length,
          source,
        },
        meta: {
          timestamp: new Date().toISOString(),
          requestId,
          version: this.config.version,
        },
      };

      await this.sendJsonResponse(res, HttpStatus.OK, response);

      this.logger.info('Prompts cache refresh completed', {
        requestId,
        promptsLoaded: prompts.length,
        source,
      });
    } catch (error) {
      // A per-request override (body.repo) whose source can't be loaded is a
      // bad-gateway condition (issue #575); surface it instead of a generic
      // 500. The message is already credential-scrubbed by the loader.
      if (error instanceof UserPromptsOverrideError) {
        await this.sendErrorResponse(
          res,
          requestId,
          HttpStatus.BAD_GATEWAY,
          'PROMPTS_SOURCE_ERROR',
          error.message
        );
        return;
      }

      this.logger.error(
        'Prompts cache refresh failed',
        error instanceof Error ? error : new Error(String(error)),
        { requestId }
      );

      await this.sendErrorResponse(
        res,
        requestId,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'PROMPTS_CACHE_REFRESH_ERROR',
        'Failed to refresh prompts cache'
      );
    }
  }

  /**
   * Handle prompts source ingestion (PRD #647 M2).
   *
   * Accepts a JSON manifest { source, contentHash, files:[{path, content(base64),
   * mode}] }, base64-decodes and caches the uploaded skill source keyed by its
   * `source` identifier in the in-memory ingested cache. A later
   * POST /api/v1/prompts/:promptName?source=<identifier> renders it through the
   * existing render path with no git operation. The (scrubbed) source is echoed
   * back. Bearer-gated by the same checkBearerAuth path as every non-OpenAPI
   * request.
   */
  private async handlePromptsSourceIngest(
    req: IncomingMessage,
    res: ServerResponse,
    requestId: string,
    body: unknown
  ): Promise<void> {
    try {
      this.logger.info('Processing prompts source ingest request', {
        requestId,
      });

      // All fields are untrusted; ingestPromptsSource validates and decodes
      // them, throwing PromptsSourceValidationError (→ 400) on a malformed or
      // unsafe manifest before anything is cached.
      const manifest = body as
        | { source?: unknown; contentHash?: unknown; files?: unknown }
        | undefined;

      const result = ingestPromptsSource(
        {
          source: manifest?.source,
          contentHash: manifest?.contentHash,
          files: manifest?.files,
        },
        this.logger
      );

      const response: RestApiResponse = {
        success: true,
        data: result,
        meta: {
          timestamp: new Date().toISOString(),
          requestId,
          version: this.config.version,
        },
      };

      await this.sendJsonResponse(res, HttpStatus.OK, response);

      this.logger.info('Prompts source ingest completed', {
        requestId,
        source: result.source,
        fileCount: result.fileCount,
      });
    } catch (error) {
      const isValidationError = error instanceof PromptsSourceValidationError;
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.error(
        'Prompts source ingest failed',
        error instanceof Error ? error : new Error(String(error)),
        { requestId }
      );

      await this.sendErrorResponse(
        res,
        requestId,
        isValidationError
          ? HttpStatus.BAD_REQUEST
          : HttpStatus.INTERNAL_SERVER_ERROR,
        isValidationError ? 'VALIDATION_ERROR' : 'PROMPTS_SOURCE_INGEST_ERROR',
        isValidationError ? errorMessage : 'Failed to ingest prompts source'
      );
    }
  }

  /**
   * Handle visualization requests (PRD #317)
   * Returns structured visualization data for a query session
   * PRD #320: Supports ?reload=true to regenerate visualization from current session data
   */
  private async handleVisualize(
    req: IncomingMessage,
    res: ServerResponse,
    requestId: string,
    sessionIdParam: string,
    searchParams: URLSearchParams
  ): Promise<void> {
    try {
      // PRD #320: Support multiple session IDs separated by +
      const sessionIds = sessionIdParam.split('+').filter(id => id.length > 0);
      const isMultiSession = sessionIds.length > 1;

      // PRD #320: Support ?reload=true to regenerate visualization from current session data
      const reload = searchParams.get('reload') === 'true';

      this.logger.info('Processing visualization request', {
        requestId,
        sessionIds,
        isMultiSession,
        reload,
      });

      // Fetch all sessions
      const sessions: Array<{
        sessionId: string;
        data: QuerySessionData & BaseVisualizationData;
      }> = [];
      for (const sessionId of sessionIds) {
        const sessionPrefix = extractPrefixFromSessionId(sessionId);
        const sessionManager = new GenericSessionManager<
          QuerySessionData & BaseVisualizationData
        >(sessionPrefix);
        const session = sessionManager.getSession(sessionId);

        if (!session) {
          await this.sendErrorResponse(
            res,
            requestId,
            HttpStatus.NOT_FOUND,
            'SESSION_NOT_FOUND',
            `Session '${sessionId}' not found or has expired`
          );
          return;
        }
        sessions.push({ sessionId, data: session.data });
      }

      // For single session, check cache (multi-session doesn't use cache yet)
      // PRD #320: Skip cache if reload=true to regenerate from current session data
      const primarySession = sessions[0];
      if (
        !isMultiSession &&
        !reload &&
        primarySession.data.cachedVisualization
      ) {
        this.logger.info('Returning cached visualization', {
          requestId,
          sessionId: sessionIds[0],
          generatedAt: primarySession.data.cachedVisualization.generatedAt,
        });

        const cachedResponse: RestApiResponse = {
          success: true,
          data: {
            title: primarySession.data.cachedVisualization.title,
            visualizations:
              primarySession.data.cachedVisualization.visualizations,
            insights: primarySession.data.cachedVisualization.insights,
            toolsUsed: primarySession.data.cachedVisualization.toolsUsed, // PRD #320
          },
          meta: {
            timestamp: new Date().toISOString(),
            requestId,
            version: this.config.version,
          },
        };

        await this.sendJsonResponse(res, HttpStatus.OK, cachedResponse);
        return;
      }

      // Generate AI-powered visualization (PRD #317 Milestone 4)
      const aiProvider = createAIProvider();

      if (!aiProvider.isInitialized()) {
        await this.sendErrorResponse(
          res,
          requestId,
          HttpStatus.SERVICE_UNAVAILABLE,
          'AI_NOT_CONFIGURED',
          'AI provider is not configured. Set ANTHROPIC_API_KEY or other AI provider credentials.'
        );
        return;
      }

      // PRD #320: Select prompt based on tool name (defaults to 'query' for backwards compatibility)
      const toolName = (primarySession.data.toolName || 'query') as string;
      const promptName = getPromptForTool(toolName);

      this.logger.info('Loading visualization prompt', {
        requestId,
        sessionIds,
        toolName,
        promptName,
      });

      // Load system prompt with session context
      // PRD #320: Unified visualization prompt with tool-aware data selection
      let intent: string;
      let data: unknown;

      // Cast to allow access to tool-specific properties
      const sessionData = primarySession.data as unknown as Record<
        string,
        unknown
      >;
      switch (toolName) {
        case 'recommend':
          intent = (sessionData.intent as string) || '';
          data = isMultiSession
            ? sessions.map(s => s.data)
            : primarySession.data;
          break;
        case 'remediate':
          intent = (sessionData.issue as string) || '';
          data = sessionData.finalAnalysis || primarySession.data;
          break;
        case 'operate':
          intent = (sessionData.intent as string) || '';
          data = primarySession.data;
          break;
        case 'version':
          // PRD #320: Version tool provides system health status
          intent = `System health: ${(sessionData.summary as Record<string, unknown>)?.overall || 'unknown'}`;
          data = primarySession.data;
          break;
        default:
          // Query and other tools: use toolCallsExecuted or full data
          intent = primarySession.data.intent || '';
          data = primarySession.data.toolCallsExecuted || primarySession.data;
      }

      const promptData = {
        intent,
        data: JSON.stringify(data, null, 2),
        visualizationOutput: loadPrompt('partials/visualization-output'),
      };

      const systemPrompt = loadPrompt(promptName, promptData);

      // PRD #343: Local executor for non-plugin tools (capability, resource, mermaid)
      const localToolExecutor = async (
        toolName: string,
        input: unknown
      ): Promise<unknown> => {
        if (
          toolName.startsWith('search_capabilities') ||
          toolName.startsWith('query_capabilities')
        ) {
          return executeCapabilityTools(
            toolName,
            input as Record<string, unknown>
          );
        }
        if (
          toolName.startsWith('search_resources') ||
          toolName.startsWith('query_resources')
        ) {
          return executeResourceTools(
            toolName,
            input as SearchResourcesInput | QueryResourcesInput
          );
        }
        // PRD #320: Mermaid validation tools
        if (toolName === 'validate_mermaid') {
          return executeMermaidTools(toolName, input as MermaidToolInput);
        }
        return {
          success: false,
          error: `Unknown tool: ${toolName}`,
          message: `Tool '${toolName}' is not implemented in visualization`,
        };
      };

      // PRD #343: Use plugin executor for kubectl tools, local for others
      const executeVisualizationTools = this.pluginManager
        ? this.pluginManager.createToolExecutor(localToolExecutor)
        : localToolExecutor;

      // PRD #343: Get kubectl tools from plugin (read-only tools for visualization)
      const KUBECTL_READONLY_TOOL_NAMES = [
        'kubectl_api_resources',
        'kubectl_get',
        'kubectl_describe',
        'kubectl_logs',
        'kubectl_events',
        'kubectl_get_crd_schema',
      ];
      const pluginKubectlTools = this.pluginManager
        ? this.pluginManager
            .getDiscoveredTools()
            .filter(t => KUBECTL_READONLY_TOOL_NAMES.includes(t.name))
        : [];

      this.logger.info('Starting AI visualization generation with tools', {
        requestId,
        sessionIds,
        toolName,
      });

      // Execute tool loop - AI can gather additional data if needed
      const result = await aiProvider.toolLoop({
        systemPrompt,
        userMessage:
          'Generate visualizations based on the query results provided. Use tools if you need additional information about any resources.',
        // PRD #320: Include MERMAID_TOOLS for diagram validation
        // PRD #343: kubectl tools from plugin
        tools: [
          ...CAPABILITY_TOOLS,
          ...RESOURCE_TOOLS,
          ...pluginKubectlTools,
          ...MERMAID_TOOLS,
        ],
        toolExecutor: executeVisualizationTools,
        maxIterations: 10, // Allow enough iterations for tool calls + JSON generation
        operation: `visualize-${toolName}`, // PRD #320: Include tool name for debugging
      });

      this.logger.info('AI visualization generation completed', {
        requestId,
        sessionIds,
        toolName,
        iterations: result.iterations,
        toolsUsed: [...new Set(result.toolCallsExecuted.map(tc => tc.tool))],
      });

      // Parse AI response as JSON using shared function
      let visualizationResponse: VisualizationResponse;
      let isFallbackResponse = false;
      try {
        if (result.status && result.status !== 'success') {
          throw new Error(
            `AI visualization generation ${result.status}: ${result.finalMessage}`
          );
        }
        const toolsUsed = [
          ...new Set(result.toolCallsExecuted.map(tc => tc.tool)),
        ];
        visualizationResponse = parseVisualizationResponse(
          result.finalMessage,
          toolsUsed
        );
      } catch (parseError) {
        this.logger.error(
          'Failed to parse AI visualization response',
          parseError instanceof Error
            ? parseError
            : new Error(String(parseError)),
          {
            requestId,
            sessionIds,
            rawResponse: result.finalMessage.substring(0, 500),
          }
        );

        // Fallback to basic visualization on parse error
        // NOTE: isFallbackResponse flag prevents caching this response
        isFallbackResponse = true;
        visualizationResponse = {
          title: `Query: ${primarySession.data.intent}`,
          visualizations: [
            {
              id: 'raw-data',
              label: 'Raw Data',
              type: 'code',
              content: {
                language: 'json',
                code: JSON.stringify(
                  isMultiSession
                    ? sessions.map(s => s.data)
                    : primarySession.data,
                  null,
                  2
                ),
              },
            },
          ],
          insights: ['AI visualization generation failed - showing raw data'],
        };
      }

      // Cache the visualization in the session for subsequent requests (single session only)
      // Don't cache fallback responses - let subsequent requests retry AI generation
      if (!isMultiSession && !isFallbackResponse) {
        const sessionPrefix = extractPrefixFromSessionId(sessionIds[0]);
        const cacheManager = new GenericSessionManager<
          QuerySessionData & BaseVisualizationData
        >(sessionPrefix);
        cacheManager.updateSession(sessionIds[0], {
          cachedVisualization: {
            title: visualizationResponse.title,
            visualizations: visualizationResponse.visualizations,
            insights: visualizationResponse.insights,
            toolsUsed: visualizationResponse.toolsUsed, // PRD #320: Cache toolsUsed
            generatedAt: new Date().toISOString(),
          },
        });
        this.logger.info('Visualization cached in session', {
          requestId,
          sessionId: sessionIds[0],
        });
      } else if (isFallbackResponse) {
        this.logger.warn('Skipping cache for fallback visualization response', {
          requestId,
          sessionId: sessionIds[0],
        });
      }

      const response: RestApiResponse = {
        success: true,
        data: visualizationResponse,
        meta: {
          timestamp: new Date().toISOString(),
          requestId,
          version: this.config.version,
        },
      };

      await this.sendJsonResponse(res, HttpStatus.OK, response);

      this.logger.info('Visualization request completed', {
        requestId,
        sessionIds,
        visualizationCount: visualizationResponse.visualizations.length,
        cached: !isMultiSession && !isFallbackResponse,
        isFallback: isFallbackResponse,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        'Visualization request failed',
        error instanceof Error ? error : new Error(String(error)),
        {
          requestId,
          sessionIdParam,
        }
      );

      await this.sendErrorResponse(
        res,
        requestId,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'VISUALIZATION_ERROR',
        'Failed to generate visualization',
        { error: errorMessage }
      );
    }
  }

  /**
   * Handle GET /api/v1/sessions (PRD #425)
   * Lists sessions with optional status filtering and pagination.
   * Returns summary-only data (excludes finalAnalysis).
   */
  private async handleListSessions(
    _req: IncomingMessage,
    res: ServerResponse,
    requestId: string,
    searchParams: URLSearchParams
  ): Promise<void> {
    try {
      const status = searchParams.get('status') || undefined;
      const limit = Math.min(
        Math.max(parseInt(searchParams.get('limit') || '50', 10) || 50, 1),
        200
      );
      const offset = Math.max(
        parseInt(searchParams.get('offset') || '0', 10) || 0,
        0
      );

      this.logger.info('Listing sessions', {
        requestId,
        status,
        limit,
        offset,
      });

      const sessionManager = new GenericSessionManager<Record<string, unknown>>(
        'rem'
      );
      const sessionIds = sessionManager.listSessions();

      // Load all sessions and build summaries
      const allSessions: Array<{
        sessionId: string;
        status?: string;
        issue?: string;
        mode?: string;
        toolName?: string;
        createdAt: string;
        updatedAt: string;
      }> = [];

      for (const id of sessionIds) {
        const session = sessionManager.getSession(id);
        if (!session) continue;

        const data = session.data || {};
        const sessionStatus =
          typeof data.status === 'string' ? data.status : undefined;

        // Filter by status if provided
        if (status && sessionStatus !== status) continue;

        allSessions.push({
          sessionId: session.sessionId,
          status: sessionStatus,
          issue: typeof data.issue === 'string' ? data.issue : undefined,
          mode: typeof data.mode === 'string' ? data.mode : undefined,
          toolName:
            typeof data.toolName === 'string' ? data.toolName : undefined,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
        });
      }

      // Sort by updatedAt descending (newest first)
      allSessions.sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );

      const total = allSessions.length;
      const paginatedSessions = allSessions.slice(offset, offset + limit);

      const response: RestApiResponse = {
        success: true,
        data: {
          sessions: paginatedSessions,
          total,
          limit,
          offset,
        },
        meta: {
          timestamp: new Date().toISOString(),
          requestId,
          version: this.config.version,
        },
      };

      await this.sendJsonResponse(res, HttpStatus.OK, response);

      this.logger.info('Sessions listed successfully', {
        requestId,
        total,
        returned: paginatedSessions.length,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        'Session list failed',
        error instanceof Error ? error : new Error(String(error)),
        { requestId }
      );

      await this.sendErrorResponse(
        res,
        requestId,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'SESSION_LIST_ERROR',
        'Failed to list sessions',
        { error: errorMessage }
      );
    }
  }

  /**
   * Handle SSE streaming for remediation session events
   * PRD #425: Real-time event stream filtered to toolName='remediate'
   */
  private async handleRemediationSSE(
    req: IncomingMessage,
    res: ServerResponse,
    requestId: string
  ): Promise<void> {
    const headers: Record<string, string> = {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    };

    if (this.config.enableCors) {
      headers['Access-Control-Allow-Origin'] = '*';
      // R-2: use the shared allowlist (single source of truth in cors-headers.ts)
      // so the SSE preflight includes X-Dot-AI-Git-Token like every other route.
      headers['Access-Control-Allow-Headers'] = REST_CORS_ALLOW_HEADERS;
    }

    res.writeHead(HttpStatus.OK, headers);

    this.logger.info('SSE connection established', { requestId });

    const eventBus = getSessionEventBus();

    const createHandler =
      (eventType: string): SessionEventHandler =>
      (event: SessionEvent) => {
        if (event.toolName !== 'remediate') return;
        res.write(`event: ${eventType}\ndata: ${JSON.stringify(event)}\n\n`);
      };

    const onCreated = createHandler('session-created');
    const onUpdated = createHandler('session-updated');

    eventBus.subscribe('session-created', onCreated);
    eventBus.subscribe('session-updated', onUpdated);

    const heartbeat = setInterval(() => {
      res.write(': heartbeat\n\n');
    }, 30000);

    req.on('close', () => {
      clearInterval(heartbeat);
      eventBus.unsubscribe('session-created', onCreated);
      eventBus.unsubscribe('session-updated', onUpdated);
      this.logger.info('SSE connection closed', { requestId });
    });
  }

  /**
   * Handle generic session retrieval requests
   * Returns raw session data for any tool type (remediate, query, recommend, etc.)
   * Session type is determined by the session ID prefix (rem-, qry-, rec-, opr-, etc.)
   */
  private async handleSessionRetrieval(
    req: IncomingMessage,
    res: ServerResponse,
    requestId: string,
    sessionId: string
  ): Promise<void> {
    try {
      const sessionPrefix = extractPrefixFromSessionId(sessionId);

      this.logger.info('Processing session retrieval', {
        requestId,
        sessionId,
        sessionPrefix,
      });

      const sessionManager = new GenericSessionManager<Record<string, unknown>>(
        sessionPrefix
      );
      const session = sessionManager.getSession(sessionId);

      if (!session) {
        await this.sendErrorResponse(
          res,
          requestId,
          HttpStatus.NOT_FOUND,
          'SESSION_NOT_FOUND',
          `Session '${sessionId}' not found or has expired`
        );
        return;
      }

      const response: RestApiResponse = {
        success: true,
        data: session,
        meta: {
          timestamp: new Date().toISOString(),
          requestId,
          version: this.config.version,
        },
      };

      await this.sendJsonResponse(res, HttpStatus.OK, response);

      this.logger.info('Session retrieved successfully', {
        requestId,
        sessionId,
        toolName: session.data?.toolName || 'unknown',
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        'Session retrieval failed',
        error instanceof Error ? error : new Error(String(error)),
        {
          requestId,
          sessionId,
        }
      );

      await this.sendErrorResponse(
        res,
        requestId,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'SESSION_RETRIEVAL_ERROR',
        'Failed to retrieve session',
        { error: errorMessage }
      );
    }
  }

  /**
   * Handle DELETE /api/v1/knowledge/source/:sourceIdentifier (PRD #356)
   * Delete all knowledge base chunks for a source identifier
   * Used by controller for GitKnowledgeSource cleanup
   */
  private async handleDeleteKnowledgeSource(
    req: IncomingMessage,
    res: ServerResponse,
    requestId: string,
    sourceIdentifier: string
  ): Promise<void> {
    try {
      // URL-decode the sourceIdentifier (it may contain / encoded as %2F)
      const decodedSourceIdentifier = decodeURIComponent(sourceIdentifier);

      this.logger.info('Processing delete knowledge source request', {
        requestId,
        sourceIdentifier: decodedSourceIdentifier,
      });

      // Check plugin availability
      if (!isPluginInitialized()) {
        await this.sendErrorResponse(
          res,
          requestId,
          HttpStatus.SERVICE_UNAVAILABLE,
          'PLUGIN_UNAVAILABLE',
          'Plugin system not initialized'
        );
        return;
      }

      const KNOWLEDGE_COLLECTION = 'knowledge-base';
      const PLUGIN_NAME = 'agentic-tools';

      // Step 1: Query all chunks matching the sourceIdentifier in metadata
      const queryResponse = await invokePluginTool(
        PLUGIN_NAME,
        'vector_query',
        {
          collection: KNOWLEDGE_COLLECTION,
          filter: {
            must: [
              {
                key: 'metadata.sourceIdentifier',
                match: { value: decodedSourceIdentifier },
              },
            ],
          },
          limit: 10000, // High limit to get all chunks for a source
        }
      );

      if (!queryResponse.success) {
        const error = queryResponse.error as
          | { message?: string; error?: string }
          | undefined;
        const errorMessage = error?.message || error?.error || 'Query failed';

        // If collection doesn't exist (Not Found), return success with 0 deleted
        if (
          errorMessage.includes('Not Found') ||
          errorMessage.includes('not found')
        ) {
          this.logger.info(
            'Collection not found - returning success with 0 deleted',
            {
              requestId,
              sourceIdentifier: decodedSourceIdentifier,
            }
          );

          const response: RestApiResponse = {
            success: true,
            data: {
              sourceIdentifier: decodedSourceIdentifier,
              chunksDeleted: 0,
            },
            meta: {
              timestamp: new Date().toISOString(),
              requestId,
              version: this.config.version,
            },
          };

          await this.sendJsonResponse(res, HttpStatus.OK, response);
          return;
        }

        this.logger.error('Plugin query failed', new Error(errorMessage), {
          requestId,
          sourceIdentifier: decodedSourceIdentifier,
        });
        await this.sendErrorResponse(
          res,
          requestId,
          HttpStatus.INTERNAL_SERVER_ERROR,
          'DELETE_SOURCE_ERROR',
          'Failed to query chunks for deletion',
          { error: errorMessage }
        );
        return;
      }

      // Extract results from plugin response
      const queryResult = queryResponse.result as {
        success: boolean;
        data?: Array<{
          id: string;
          payload: Record<string, unknown>;
        }>;
        error?: string;
        message: string;
      };

      if (!queryResult.success) {
        const errorMessage = queryResult.error || queryResult.message;

        // If collection doesn't exist, return success with 0 deleted
        if (
          errorMessage.includes('Not Found') ||
          errorMessage.includes('not found')
        ) {
          this.logger.info(
            'Collection not found - returning success with 0 deleted',
            {
              requestId,
              sourceIdentifier: decodedSourceIdentifier,
            }
          );

          const response: RestApiResponse = {
            success: true,
            data: {
              sourceIdentifier: decodedSourceIdentifier,
              chunksDeleted: 0,
            },
            meta: {
              timestamp: new Date().toISOString(),
              requestId,
              version: this.config.version,
            },
          };

          await this.sendJsonResponse(res, HttpStatus.OK, response);
          return;
        }

        await this.sendErrorResponse(
          res,
          requestId,
          HttpStatus.INTERNAL_SERVER_ERROR,
          'DELETE_SOURCE_ERROR',
          'Failed to query chunks for deletion',
          { error: errorMessage }
        );
        return;
      }

      const chunksToDelete = queryResult.data || [];

      // If no chunks found, return success with 0 deleted
      if (chunksToDelete.length === 0) {
        this.logger.info('No chunks found for source identifier', {
          requestId,
          sourceIdentifier: decodedSourceIdentifier,
        });

        const response: RestApiResponse = {
          success: true,
          data: {
            sourceIdentifier: decodedSourceIdentifier,
            chunksDeleted: 0,
          },
          meta: {
            timestamp: new Date().toISOString(),
            requestId,
            version: this.config.version,
          },
        };

        await this.sendJsonResponse(res, HttpStatus.OK, response);
        return;
      }

      // Step 2: Delete each chunk by ID
      let deletedCount = 0;
      for (const chunk of chunksToDelete) {
        this.logger.debug('Deleting chunk', { requestId, chunkId: chunk.id });

        const deleteResponse = await invokePluginTool(
          PLUGIN_NAME,
          'vector_delete',
          {
            collection: KNOWLEDGE_COLLECTION,
            id: chunk.id,
          }
        );

        if (!deleteResponse.success) {
          const error = deleteResponse.error as
            | { message?: string }
            | undefined;
          const errorMessage = error?.message || 'Delete failed';
          this.logger.error('Failed to delete chunk', new Error(errorMessage), {
            requestId,
            chunkId: chunk.id,
            deletedSoFar: deletedCount,
          });
          await this.sendErrorResponse(
            res,
            requestId,
            HttpStatus.INTERNAL_SERVER_ERROR,
            'DELETE_SOURCE_ERROR',
            'Failed to delete chunk',
            {
              chunkId: chunk.id,
              error: errorMessage,
              chunksDeletedBeforeFailure: deletedCount,
            }
          );
          return;
        }

        deletedCount++;
      }

      this.logger.info('Delete knowledge source operation completed', {
        requestId,
        sourceIdentifier: decodedSourceIdentifier,
        chunksDeleted: deletedCount,
      });

      const response: RestApiResponse = {
        success: true,
        data: {
          sourceIdentifier: decodedSourceIdentifier,
          chunksDeleted: deletedCount,
        },
        meta: {
          timestamp: new Date().toISOString(),
          requestId,
          version: this.config.version,
        },
      };

      await this.sendJsonResponse(res, HttpStatus.OK, response);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        'Delete knowledge source request failed',
        error instanceof Error ? error : new Error(String(error)),
        {
          requestId,
          sourceIdentifier,
        }
      );

      await this.sendErrorResponse(
        res,
        requestId,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'DELETE_SOURCE_ERROR',
        'Failed to delete knowledge source',
        { error: errorMessage }
      );
    }
  }

  /**
   * Handle POST /api/v1/knowledge/ask (PRD #356)
   * Ask a question and receive an AI-synthesized answer from the knowledge base.
   * Uses an agentic approach with toolLoop to allow multiple searches if needed.
   */
  private async handleKnowledgeAsk(
    req: IncomingMessage,
    res: ServerResponse,
    requestId: string,
    body: unknown
  ): Promise<void> {
    try {
      // Validate request body
      if (!body || typeof body !== 'object') {
        await this.sendErrorResponse(
          res,
          requestId,
          HttpStatus.BAD_REQUEST,
          'BAD_REQUEST',
          'Request body must be a JSON object'
        );
        return;
      }

      const {
        query,
        limit = 20,
        uriFilter,
      } = body as {
        query?: string;
        limit?: number;
        uriFilter?: string;
      };

      // Validate limit parameter (must be positive integer)
      if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1) {
        await this.sendErrorResponse(
          res,
          requestId,
          HttpStatus.BAD_REQUEST,
          'INVALID_PARAMETER',
          'The "limit" parameter must be a positive integer'
        );
        return;
      }

      // Validate required query parameter
      if (!query || typeof query !== 'string' || query.trim().length === 0) {
        await this.sendErrorResponse(
          res,
          requestId,
          HttpStatus.BAD_REQUEST,
          'BAD_REQUEST',
          'Missing or empty required parameter: query'
        );
        return;
      }

      this.logger.info('Processing knowledge ask request', {
        requestId,
        queryLength: query.length,
        limit,
        hasUriFilter: !!uriFilter,
      });

      // Check plugin availability (needed for search)
      if (!isPluginInitialized()) {
        await this.sendErrorResponse(
          res,
          requestId,
          HttpStatus.SERVICE_UNAVAILABLE,
          'PLUGIN_UNAVAILABLE',
          'Plugin system not initialized'
        );
        return;
      }

      // Check AI provider availability
      const aiProvider = createAIProvider();
      if (!aiProvider.isInitialized()) {
        await this.sendErrorResponse(
          res,
          requestId,
          HttpStatus.SERVICE_UNAVAILABLE,
          'AI_NOT_CONFIGURED',
          'AI provider not configured. Set ANTHROPIC_API_KEY or another provider API key.'
        );
        return;
      }

      // Define the search tool for the AI
      const searchTool: AITool = {
        name: 'search_knowledge_base',
        description:
          'Search the knowledge base for relevant information. Returns chunks of text from documents that match the query semantically.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'The search query - can be a question or keywords',
            },
          },
          required: ['query'],
        },
      };

      // Collect all chunks from search results across iterations
      const allChunks: Array<{
        content: string;
        uri: string;
        score: number;
        chunkIndex: number;
      }> = [];

      // Tool executor that calls searchKnowledgeBase
      const toolExecutor = async (
        toolName: string,
        input: unknown
      ): Promise<unknown> => {
        if (toolName !== 'search_knowledge_base') {
          return {
            success: false,
            error: `Unknown tool: ${toolName}`,
          };
        }

        const searchInput = input as { query: string };
        const result: SearchKnowledgeBaseResult = await searchKnowledgeBase({
          query: searchInput.query,
          limit,
          uriFilter,
        });

        if (!result.success) {
          return {
            success: false,
            error: result.error,
            message: 'Search failed',
          };
        }

        // Collect chunks for the response
        for (const chunk of result.chunks) {
          // Avoid duplicates (same id)
          if (
            !allChunks.some(
              c => c.uri === chunk.uri && c.chunkIndex === chunk.chunkIndex
            )
          ) {
            allChunks.push({
              content: chunk.content,
              uri: chunk.uri,
              score: chunk.score,
              chunkIndex: chunk.chunkIndex,
            });
          }
        }

        // Return results to the AI
        if (result.chunks.length === 0) {
          return {
            success: true,
            message: 'No matching documents found in the knowledge base.',
            chunks: [],
          };
        }

        return {
          success: true,
          message: `Found ${result.chunks.length} relevant chunks.`,
          chunks: result.chunks.map(c => ({
            content: c.content,
            uri: c.uri,
            score: c.score,
          })),
        };
      };

      // Load system prompt
      const systemPrompt = loadPrompt('knowledge-ask');

      // Execute tool loop
      this.logger.info('Starting knowledge ask tool loop', { requestId });

      const result = await aiProvider.toolLoop({
        systemPrompt,
        userMessage: query,
        tools: [searchTool],
        toolExecutor,
        maxIterations: 5,
        operation: 'knowledge-ask',
        evaluationContext: {
          user_intent: query,
        },
      });

      this.logger.info('Knowledge ask tool loop completed', {
        requestId,
        iterations: result.iterations,
        chunksCollected: allChunks.length,
        toolCallsCount: result.toolCallsExecuted.length,
      });

      // Deduplicate sources from collected chunks
      const sourceMap = new Map<string, { uri: string; title?: string }>();
      for (const chunk of allChunks) {
        if (!sourceMap.has(chunk.uri)) {
          sourceMap.set(chunk.uri, { uri: chunk.uri });
        }
      }
      const sources = Array.from(sourceMap.values());

      // Build response
      const response: RestApiResponse = {
        success: true,
        data: {
          answer: result.finalMessage,
          sources,
          chunks: allChunks,
        },
        meta: {
          timestamp: new Date().toISOString(),
          requestId,
          version: this.config.version,
        },
      };

      await this.sendJsonResponse(res, HttpStatus.OK, response);

      this.logger.info('Knowledge ask completed', {
        requestId,
        sourcesFound: sources.length,
        chunksReturned: allChunks.length,
        answerLength: result.finalMessage.length,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        'Knowledge ask request failed',
        error instanceof Error ? error : new Error(String(error)),
        {
          requestId,
        }
      );

      await this.sendErrorResponse(
        res,
        requestId,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'SYNTHESIS_ERROR',
        'Failed to process knowledge ask request',
        { error: errorMessage }
      );
    }
  }

  /**
   * Handle embedding migration request (PRD #384)
   */
  private async handleEmbeddingMigrationRequest(
    req: IncomingMessage,
    res: ServerResponse,
    requestId: string,
    body: unknown
  ): Promise<void> {
    try {
      this.logger.info('Processing embedding migration request', { requestId });

      // Delegate to the embedding migration handler
      const response = await handleEmbeddingMigration(
        body,
        this.logger,
        requestId
      );

      // Determine HTTP status based on response
      let httpStatus = HttpStatus.OK;
      if (!response.success) {
        const errorCode = response.error?.code;
        if (
          errorCode === 'PLUGIN_UNAVAILABLE' ||
          errorCode === 'EMBEDDING_SERVICE_UNAVAILABLE'
        ) {
          httpStatus = HttpStatus.SERVICE_UNAVAILABLE;
        } else if (errorCode === 'MIGRATION_ERROR') {
          httpStatus = HttpStatus.INTERNAL_SERVER_ERROR;
        } else {
          httpStatus = HttpStatus.BAD_REQUEST;
        }
      }

      await this.sendJsonResponse(res, httpStatus, response);

      this.logger.info('Embedding migration request completed', {
        requestId,
        success: response.success,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        'Embedding migration request failed',
        error instanceof Error ? error : new Error(String(error)),
        { requestId }
      );

      await this.sendErrorResponse(
        res,
        requestId,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'MIGRATION_ERROR',
        'Failed to process embedding migration request',
        { error: errorMessage }
      );
    }
  }

  // ===========================================================================
  // User Management Handlers (PRD #380 Task 2.5)
  // ===========================================================================

  /**
   * Handle POST /api/v1/users — create a new Dex static user
   */
  private async handleCreateUser(
    _req: IncomingMessage,
    res: ServerResponse,
    requestId: string,
    body: unknown
  ): Promise<void> {
    try {
      // RBAC enforcement (PRD #392) — user management requires dotai-admin role
      const identity = getCurrentIdentity();
      if (identity) {
        const rbacResult = await checkToolAccess(identity, {
          toolName: 'users',
          resource: 'users',
        });
        if (!rbacResult.allowed) {
          await this.sendErrorResponse(
            res,
            requestId,
            403 as HttpStatus,
            'FORBIDDEN',
            'User management requires dotai-admin role'
          );
          return;
        }
      }

      if (
        !body ||
        typeof body !== 'object' ||
        !('email' in body) ||
        !('password' in body)
      ) {
        await this.sendErrorResponse(
          res,
          requestId,
          HttpStatus.BAD_REQUEST,
          'INVALID_REQUEST',
          'Request body must include email and password'
        );
        return;
      }

      const { email, password } = body as { email: string; password: string };

      if (!email || typeof email !== 'string' || !email.includes('@')) {
        await this.sendErrorResponse(
          res,
          requestId,
          HttpStatus.BAD_REQUEST,
          'INVALID_REQUEST',
          'A valid email address is required'
        );
        return;
      }

      if (!password || typeof password !== 'string' || password.length < 8) {
        await this.sendErrorResponse(
          res,
          requestId,
          HttpStatus.BAD_REQUEST,
          'INVALID_REQUEST',
          'password is required and must be at least 8 characters'
        );
        return;
      }

      const result = await createUser(email, password);

      logUserManagementOperation(identity, 'created', email);

      await this.sendJsonResponse(res, HttpStatus.OK, {
        success: true,
        data: result,
        meta: {
          timestamp: new Date().toISOString(),
          requestId,
          version: this.config.version,
        },
      });

      this.logger.info('User created', { requestId });
    } catch (error) {
      const err = error as Error & { statusCode?: number };
      if (err.statusCode === 409) {
        await this.sendErrorResponse(
          res,
          requestId,
          409 as HttpStatus,
          'USER_CONFLICT',
          err.message
        );
      } else {
        this.logger.error('Failed to create user', err, { requestId });
        await this.sendErrorResponse(
          res,
          requestId,
          HttpStatus.INTERNAL_SERVER_ERROR,
          'USER_MANAGEMENT_ERROR',
          'Failed to create user'
        );
      }
    }
  }

  /**
   * Handle GET /api/v1/users — list all Dex static users
   */
  private async handleListUsers(
    _req: IncomingMessage,
    res: ServerResponse,
    requestId: string
  ): Promise<void> {
    try {
      // RBAC enforcement (PRD #392) — user management requires dotai-admin role
      const identity = getCurrentIdentity();
      if (identity) {
        const rbacResult = await checkToolAccess(identity, {
          toolName: 'users',
          resource: 'users',
        });
        if (!rbacResult.allowed) {
          await this.sendErrorResponse(
            res,
            requestId,
            403 as HttpStatus,
            'FORBIDDEN',
            'User management requires dotai-admin role'
          );
          return;
        }
      }

      const users = await listUsers();

      await this.sendJsonResponse(res, HttpStatus.OK, {
        success: true,
        data: { users, total: users.length },
        meta: {
          timestamp: new Date().toISOString(),
          requestId,
          version: this.config.version,
        },
      });

      this.logger.info('Users listed', { requestId, total: users.length });
    } catch (error) {
      this.logger.error('Failed to list users', error as Error, { requestId });
      await this.sendErrorResponse(
        res,
        requestId,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'USER_MANAGEMENT_ERROR',
        'Failed to list users'
      );
    }
  }

  /**
   * Handle DELETE /api/v1/users/:email — delete a Dex static user
   */
  private async handleDeleteUser(
    _req: IncomingMessage,
    res: ServerResponse,
    requestId: string,
    email: string
  ): Promise<void> {
    try {
      // RBAC enforcement (PRD #392) — user management requires dotai-admin role
      const identity = getCurrentIdentity();
      if (identity) {
        const rbacResult = await checkToolAccess(identity, {
          toolName: 'users',
          resource: 'users',
        });
        if (!rbacResult.allowed) {
          await this.sendErrorResponse(
            res,
            requestId,
            403 as HttpStatus,
            'FORBIDDEN',
            'User management requires dotai-admin role'
          );
          return;
        }
      }

      let decodedEmail: string;
      try {
        decodedEmail = decodeURIComponent(email);
      } catch {
        await this.sendErrorResponse(
          res,
          requestId,
          HttpStatus.BAD_REQUEST,
          'INVALID_REQUEST',
          'Malformed URL-encoded email'
        );
        return;
      }
      const result = await deleteUser(decodedEmail);

      logUserManagementOperation(identity, 'deleted', decodedEmail);

      await this.sendJsonResponse(res, HttpStatus.OK, {
        success: true,
        data: result,
        meta: {
          timestamp: new Date().toISOString(),
          requestId,
          version: this.config.version,
        },
      });

      this.logger.info('User deleted', { requestId });
    } catch (error) {
      const err = error as Error & { statusCode?: number };
      if (err.statusCode === 404) {
        await this.sendErrorResponse(
          res,
          requestId,
          HttpStatus.NOT_FOUND,
          'USER_NOT_FOUND',
          err.message
        );
      } else {
        this.logger.error('Failed to delete user', err, { requestId });
        await this.sendErrorResponse(
          res,
          requestId,
          HttpStatus.INTERNAL_SERVER_ERROR,
          'USER_MANAGEMENT_ERROR',
          'Failed to delete user'
        );
      }
    }
  }

  /**
   * Set CORS headers
   */
  private setCorsHeaders(res: ServerResponse): void {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    // PRD #621 M2 / Decision 1: advertise the X-Dot-AI-Git-Token credential
    // header (shared with the mcp.ts allowlist via cors-headers.ts).
    res.setHeader('Access-Control-Allow-Headers', REST_CORS_ALLOW_HEADERS);
    res.setHeader('Access-Control-Max-Age', '86400');
  }

  /**
   * Send JSON response
   */
  private async sendJsonResponse(
    res: ServerResponse,
    status: HttpStatus,
    data: unknown
  ): Promise<void> {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data, null, 2));
  }

  /**
   * Send error response
   */
  private async sendErrorResponse(
    res: ServerResponse,
    requestId: string,
    status: HttpStatus,
    code: string,
    message: string,
    details?: unknown
  ): Promise<void> {
    const response: RestApiResponse = {
      success: false,
      error: {
        code,
        message,
        details,
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId,
        version: this.config.version,
      },
    };

    await this.sendJsonResponse(res, status, response);
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return `rest_${Date.now()}_${++this.requestCounter}`;
  }

  /**
   * Check if the given path matches the REST API pattern
   */
  isApiRequest(pathname: string): boolean {
    return pathname.startsWith(
      `${this.config.basePath}/${this.config.version}`
    );
  }

  /**
   * Get API configuration
   */
  getConfig(): RestApiConfig {
    return { ...this.config };
  }

  /**
   * Get the route registry for OpenAPI generation and fixture validation
   * PRD #354: Exposes route registry for downstream consumers
   */
  getRouteRegistry(): RestRouteRegistry {
    return this.routeRegistry;
  }
}
