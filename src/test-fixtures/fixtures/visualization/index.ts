/**
 * Visualization Fixtures
 *
 * Fixtures for /api/v1/visualize/:sessionId endpoint.
 * PRD #354: REST API Route Registry with Auto-Generated OpenAPI and Test Fixtures
 */

import successMermaid from './success-mermaid.json';
import successCards from './success-cards.json';
import successTable from './success-table.json';
import successCode from './success-code.json';
import successDiff from './success-diff.json';
import successBarChart from './success-bar-chart.json';
import empty from './empty.json';
import errorNotFound from './error-not-found.json';
import errorAiNotConfigured from './error-ai-not-configured.json';

export const visualizationFixtures = {
  success: {
    mermaid: successMermaid,
    cards: successCards,
    table: successTable,
    code: successCode,
    diff: successDiff,
    barChart: successBarChart,
    empty: empty,
  },
  errors: {
    notFound: errorNotFound,
    aiNotConfigured: errorAiNotConfigured,
  },
};

export default visualizationFixtures;
