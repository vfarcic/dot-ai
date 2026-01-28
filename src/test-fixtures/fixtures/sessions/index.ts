/**
 * Sessions Fixtures
 *
 * Fixtures for /api/v1/sessions/:sessionId endpoint.
 * PRD #354: REST API Route Registry with Auto-Generated OpenAPI and Test Fixtures
 */

import querySession from './query-session.json';
import remediateSession from './remediate-session.json';
import recommendSession from './recommend-session.json';
import operateSession from './operate-session.json';
import errorNotFound from './error-not-found.json';
import errorExpired from './error-expired.json';

export const sessionsFixtures = {
  success: {
    query: querySession,
    remediate: remediateSession,
    recommend: recommendSession,
    operate: operateSession,
  },
  errors: {
    notFound: errorNotFound,
    expired: errorExpired,
  },
};

export default sessionsFixtures;
