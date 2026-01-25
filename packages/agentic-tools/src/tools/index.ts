/**
 * Tool Registry
 *
 * Exports all available tools and their handlers.
 * M1: Empty - tools will be added in M2.
 */

import { ToolDefinition } from '../types';

/**
 * All tool definitions for the describe hook
 */
export const TOOLS: ToolDefinition[] = [];

/**
 * Tool handler function type
 */
export type ToolHandler = (args: Record<string, unknown>) => Promise<unknown>;

/**
 * Map of tool names to their handlers
 */
export const TOOL_HANDLERS: Record<string, ToolHandler> = {};
