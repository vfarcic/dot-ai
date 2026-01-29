/**
 * Visualization Response Schemas
 *
 * Schemas for the /api/v1/visualize/:sessionId endpoint.
 * PRD #354: REST API Route Registry with Auto-Generated OpenAPI and Test Fixtures
 */

import { z } from 'zod';
import { createSuccessResponseSchema, NotFoundErrorSchema, ServiceUnavailableErrorSchema, InternalServerErrorSchema } from './common';

/**
 * Visualization types supported by the API
 * PRD #320: Added 'diff' type for before/after comparisons
 * PRD #328: Added 'bar-chart' type for metrics visualization
 */
export const VisualizationTypeSchema = z.enum([
  'mermaid',
  'cards',
  'code',
  'table',
  'diff',
  'bar-chart',
]);

export type VisualizationType = z.infer<typeof VisualizationTypeSchema>;

/**
 * Code visualization content
 */
export const CodeContentSchema = z.object({
  language: z.string().describe('Programming language for syntax highlighting'),
  code: z.string().describe('Code content'),
});

export type CodeContent = z.infer<typeof CodeContentSchema>;

/**
 * Table visualization content
 */
export const TableContentSchema = z.object({
  headers: z.array(z.string()).describe('Column headers'),
  rows: z.array(z.array(z.string())).describe('Table rows'),
});

export type TableContent = z.infer<typeof TableContentSchema>;

/**
 * Card item in cards visualization
 */
export const CardItemSchema = z.object({
  id: z.string().describe('Unique card identifier'),
  title: z.string().describe('Card title'),
  description: z.string().optional().describe('Card description'),
  tags: z.array(z.string()).optional().describe('Tags/labels for the card'),
});

export type CardItem = z.infer<typeof CardItemSchema>;

/**
 * Cards visualization content
 */
export const CardsContentSchema = z.array(CardItemSchema);

export type CardsContent = z.infer<typeof CardsContentSchema>;

/**
 * Diff visualization content (PRD #320)
 */
export const DiffContentSchema = z.object({
  before: CodeContentSchema.describe('Code before changes'),
  after: CodeContentSchema.describe('Code after changes'),
});

export type DiffContent = z.infer<typeof DiffContentSchema>;

/**
 * Bar chart data item (PRD #328)
 */
export const BarChartDataItemSchema = z.object({
  label: z.string().describe('Data point label (e.g., "node-1", "kube-system")'),
  value: z.number().describe('Numeric value'),
  max: z.number().optional().describe('Maximum value for percentage calculation'),
  status: z.enum(['error', 'warning', 'ok']).optional().describe('Status for color-coding'),
});

export type BarChartDataItem = z.infer<typeof BarChartDataItemSchema>;

/**
 * Bar chart visualization content (PRD #328)
 */
export const BarChartContentSchema = z.object({
  data: z.array(BarChartDataItemSchema).describe('Chart data points'),
  unit: z.string().optional().describe('Unit label (e.g., "Gi", "cores", "%")'),
  orientation: z.enum(['horizontal', 'vertical']).optional().describe('Chart orientation'),
});

export type BarChartContent = z.infer<typeof BarChartContentSchema>;

/**
 * Visualization content union type
 * Content varies based on visualization type
 */
export const VisualizationContentSchema = z.union([
  z.string(), // mermaid diagram code
  CodeContentSchema, // code block
  TableContentSchema, // table
  CardsContentSchema, // array of cards
  DiffContentSchema, // diff view
  BarChartContentSchema, // bar chart
]);

export type VisualizationContent = z.infer<typeof VisualizationContentSchema>;

/**
 * Individual visualization item
 */
export const VisualizationSchema = z.object({
  id: z.string().describe('Unique visualization identifier'),
  label: z.string().describe('Display label'),
  type: VisualizationTypeSchema.describe('Visualization type'),
  content: VisualizationContentSchema.describe('Visualization content (varies by type)'),
});

export type Visualization = z.infer<typeof VisualizationSchema>;

/**
 * Visualization endpoint response data
 * PRD #320: Added toolsUsed for test validation
 */
export const VisualizationResponseDataSchema = z.object({
  title: z.string().describe('Title of the visualization'),
  visualizations: z.array(VisualizationSchema).describe('Array of visualizations'),
  insights: z.array(z.string()).describe('AI-generated insights about the data'),
  toolsUsed: z.array(z.string()).optional().describe('Tools called during visualization generation'),
});

export type VisualizationResponseData = z.infer<typeof VisualizationResponseDataSchema>;

/**
 * Full visualization endpoint response
 */
export const VisualizationResponseSchema = createSuccessResponseSchema(VisualizationResponseDataSchema);

export type VisualizationResponse = z.infer<typeof VisualizationResponseSchema>;

/**
 * Visualization endpoint error responses
 */
export const VisualizationNotFoundErrorSchema = NotFoundErrorSchema.extend({
  error: z.object({
    code: z.literal('SESSION_NOT_FOUND'),
    message: z.string(),
    details: z.any().optional(),
  }),
});

export const VisualizationServiceUnavailableErrorSchema = ServiceUnavailableErrorSchema.extend({
  error: z.object({
    code: z.literal('AI_NOT_CONFIGURED'),
    message: z.string(),
    details: z.any().optional(),
  }),
});

export const VisualizationInternalErrorSchema = InternalServerErrorSchema.extend({
  error: z.object({
    code: z.literal('VISUALIZATION_ERROR'),
    message: z.string(),
    details: z.any().optional(),
  }),
});
