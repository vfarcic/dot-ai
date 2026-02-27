/**
 * Tool Registry
 *
 * Aggregates all kubectl, helm, vector, and knowledge tools and exports them for the describe and invoke hooks.
 */

import { ToolDefinition } from '../types';
import { KubectlTool } from './base';
import { QdrantTool } from './qdrant-base';

// Import all kubectl tools
import { kubectlApiResources } from './kubectl-api-resources';
import { kubectlGet } from './kubectl-get';
import { kubectlDescribe } from './kubectl-describe';
import { kubectlLogs } from './kubectl-logs';
import { kubectlEvents } from './kubectl-events';
import { kubectlPatchDryrun } from './kubectl-patch-dryrun';
import { kubectlApplyDryrun } from './kubectl-apply-dryrun';
import { kubectlDeleteDryrun } from './kubectl-delete-dryrun';
import { kubectlGetCrdSchema } from './kubectl-get-crd-schema';
import { kubectlGetResourceJson } from './kubectl-get-resource-json';
import { kubectlGetPrinterColumns } from './kubectl-get-printer-columns';
import { kubectlVersion } from './kubectl-version';
// PRD #343: Actual execution tools (not dry-run) for remediation actions
import { kubectlApply } from './kubectl-apply';
import { kubectlDelete } from './kubectl-delete';
import { kubectlPatch } from './kubectl-patch';
import { kubectlExec } from './kubectl-exec';
import { shellExec } from './shell-exec';

// PRD #343: Helm tools via plugin system
import { helmRepoAdd } from './helm-repo-add';
import { helmInstall, helmInstallDryrun } from './helm-install';
import { helmTemplate } from './helm-template';
import { helmUninstall } from './helm-uninstall';

// PRD #251: Helm Day-2 investigation tools
import { helmList } from './helm-list';
import { helmStatus } from './helm-status';
import { helmHistory } from './helm-history';
import { helmGetValues } from './helm-get-values';
// PRD #251: Helm Day-2 operation tools
import { helmRollback } from './helm-rollback';

// PRD #388: Documentation validation pod lifecycle tools
import {
  docsValidateCreatePod,
  docsValidateDeletePod,
  docsValidatePodStatus,
  docsValidateTtlSweep,
  docsValidateExec,
} from './docs-validate-pod';

// PRD #359: Vector database tools (Qdrant operations)
import { VECTOR_TOOLS } from './vector';

// PRD #356: Knowledge base tools (document chunking)
import { KNOWLEDGE_TOOLS, KnowledgeTool } from './knowledge';

/**
 * All kubectl and helm tools in a single array
 * Add new tools here to register them automatically
 */
const ALL_KUBECTL_HELM_TOOLS: KubectlTool[] = [
  kubectlApiResources,
  kubectlGet,
  kubectlDescribe,
  kubectlLogs,
  kubectlEvents,
  kubectlPatchDryrun,
  kubectlApplyDryrun,
  kubectlDeleteDryrun,
  kubectlGetCrdSchema,
  kubectlGetResourceJson,
  kubectlGetPrinterColumns,
  kubectlVersion,
  // PRD #343: Actual execution tools for remediation actions
  kubectlApply,
  kubectlDelete,
  kubectlPatch,
  kubectlExec,
  shellExec,
  // PRD #343: Helm tools
  helmRepoAdd,
  helmInstall,
  helmTemplate,
  helmUninstall,
  // PRD #251: Helm Day-2 investigation tools
  helmList,
  helmStatus,
  helmHistory,
  helmGetValues,
  helmInstallDryrun,
  // PRD #251: Helm Day-2 operation tools
  helmRollback,
  // PRD #388: Documentation validation pod lifecycle
  docsValidateCreatePod,
  docsValidateDeletePod,
  docsValidatePodStatus,
  docsValidateTtlSweep,
  docsValidateExec,
];

/**
 * Union type for all tool types
 */
type AnyTool = KubectlTool | QdrantTool | KnowledgeTool;

/**
 * Combined list of all tools
 */
const ALL_TOOLS: AnyTool[] = [
  ...ALL_KUBECTL_HELM_TOOLS,
  ...VECTOR_TOOLS,
  ...KNOWLEDGE_TOOLS,
];

/**
 * Tool definitions for the describe hook
 * Extracted from each tool's definition property
 */
export const TOOLS: ToolDefinition[] = ALL_TOOLS.map(tool => tool.definition);

/**
 * Tool handler function type
 */
export type ToolHandler = (args: Record<string, unknown>) => Promise<unknown>;

/**
 * Map of tool names to their handlers for the invoke hook
 * Built automatically from the ALL_TOOLS array
 */
export const TOOL_HANDLERS: Record<string, ToolHandler> = Object.fromEntries(
  ALL_TOOLS.map(tool => [tool.definition.name, tool.handler])
);
