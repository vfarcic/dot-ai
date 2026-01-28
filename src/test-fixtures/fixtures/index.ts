/**
 * All Fixtures
 *
 * Central export for all REST API test fixtures.
 * PRD #354: REST API Route Registry with Auto-Generated OpenAPI and Test Fixtures
 */

export { toolFixtures } from './tools';
export { resourceFixtures } from './resources';
export { eventsFixtures } from './events';
export { logsFixtures } from './logs';
export { promptsFixtures } from './prompts';
export { visualizationFixtures } from './visualization';
export { sessionsFixtures } from './sessions';

import { toolFixtures } from './tools';
import { resourceFixtures } from './resources';
import { eventsFixtures } from './events';
import { logsFixtures } from './logs';
import { promptsFixtures } from './prompts';
import { visualizationFixtures } from './visualization';
import { sessionsFixtures } from './sessions';

/**
 * All fixtures combined into a single object
 */
export const allFixtures = {
  tools: toolFixtures,
  resources: resourceFixtures,
  events: eventsFixtures,
  logs: logsFixtures,
  prompts: promptsFixtures,
  visualization: visualizationFixtures,
  sessions: sessionsFixtures,
};

export default allFixtures;
