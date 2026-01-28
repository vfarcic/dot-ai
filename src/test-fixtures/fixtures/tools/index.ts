/**
 * Tool Fixtures
 *
 * Fixtures for /api/v1/tools and /api/v1/tools/:toolName endpoints.
 * PRD #354: REST API Route Registry with Auto-Generated OpenAPI and Test Fixtures
 */

import discoverySuccess from './discovery-success.json';
import discoveryFiltered from './discovery-filtered.json';
import executionSuccess from './execution-success.json';
import errorNotFound from './error-not-found.json';
import errorInvalidRequest from './error-invalid-request.json';

export const toolFixtures = {
  discovery: {
    success: discoverySuccess,
    filtered: discoveryFiltered,
  },
  execution: {
    success: executionSuccess,
  },
  errors: {
    notFound: errorNotFound,
    invalidRequest: errorInvalidRequest,
  },
};

export default toolFixtures;
