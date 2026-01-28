/**
 * Prompts Fixtures
 *
 * Fixtures for /api/v1/prompts and /api/v1/prompts/:promptName endpoints.
 * PRD #354: REST API Route Registry with Auto-Generated OpenAPI and Test Fixtures
 */

import listSuccess from './list-success.json';
import getSuccess from './get-success.json';
import errorNotFound from './error-not-found.json';

export const promptsFixtures = {
  list: {
    success: listSuccess,
  },
  get: {
    success: getSuccess,
  },
  errors: {
    notFound: errorNotFound,
  },
};

export default promptsFixtures;
