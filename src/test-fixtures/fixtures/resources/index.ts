/**
 * Resource Fixtures
 *
 * Fixtures for /api/v1/resources, /api/v1/resource, /api/v1/resources/kinds,
 * /api/v1/resources/search, /api/v1/resources/sync, and /api/v1/namespaces endpoints.
 * PRD #354: REST API Route Registry with Auto-Generated OpenAPI and Test Fixtures
 */

import kindsSuccess from './kinds-success.json';
import listDeployments from './list-deployments.json';
import listPods from './list-pods.json';
import searchResults from './search-results.json';
import singleDeployment from './single-deployment.json';
import namespacesSuccess from './namespaces-success.json';
import syncSuccess from './sync-success.json';
import empty from './empty.json';
import errorNotFound from './error-not-found.json';
import errorBadRequest from './error-bad-request.json';

export const resourceFixtures = {
  kinds: {
    success: kindsSuccess,
  },
  list: {
    deployments: listDeployments,
    pods: listPods,
    empty: empty,
  },
  search: {
    results: searchResults,
    empty: empty,
  },
  single: {
    deployment: singleDeployment,
  },
  namespaces: {
    success: namespacesSuccess,
  },
  sync: {
    success: syncSuccess,
  },
  errors: {
    notFound: errorNotFound,
    badRequest: errorBadRequest,
  },
};

export default resourceFixtures;
