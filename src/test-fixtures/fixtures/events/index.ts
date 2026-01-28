/**
 * Events Fixtures
 *
 * Fixtures for /api/v1/events endpoint.
 * PRD #354: REST API Route Registry with Auto-Generated OpenAPI and Test Fixtures
 */

import podEvents from './pod-events.json';
import warningEvents from './warning-events.json';
import empty from './empty.json';
import errorBadRequest from './error-bad-request.json';

export const eventsFixtures = {
  success: {
    podEvents: podEvents,
    warningEvents: warningEvents,
    empty: empty,
  },
  errors: {
    badRequest: errorBadRequest,
  },
};

export default eventsFixtures;
