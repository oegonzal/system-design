import {
  SESSION_TOPICS,
  sessionEndedSchema,
  sessionStartedSchema,
  sessionUnitClosedSchema,
  sessionUnitOpenedSchema,
} from '../units/session-events';
import type { TopicDeclaration } from './bus';
import {
  INTERACTION_TOPICS,
  interactionAnswerSchema,
  interactionPromptSchema,
  interactionWithdrawnSchema,
} from './interactions';

/**
 * Every topic the bus accepts, declared once: what each carries and who may
 * publish it. The bus refuses any other topic, and any payload its topic's
 * schema refuses, so a subscriber reads only what a declaration promised. A
 * new family of topics is one more set of lines here, and no change to the
 * bus.
 */
export const NOTIFICATION_TOPICS: Readonly<Record<string, TopicDeclaration>> = {
  [INTERACTION_TOPICS.prompted]: { schema: interactionPromptSchema, publishedBy: 'anyone' },
  [INTERACTION_TOPICS.answered]: { schema: interactionAnswerSchema, publishedBy: 'service' },
  [INTERACTION_TOPICS.withdrawn]: { schema: interactionWithdrawnSchema, publishedBy: 'anyone' },
  // What a browser session says happened, for whoever keeps a record of its units beyond it.
  [SESSION_TOPICS.started]: { schema: sessionStartedSchema, publishedBy: 'anyone' },
  [SESSION_TOPICS.unitOpened]: { schema: sessionUnitOpenedSchema, publishedBy: 'anyone' },
  [SESSION_TOPICS.unitClosed]: { schema: sessionUnitClosedSchema, publishedBy: 'anyone' },
  [SESSION_TOPICS.ended]: { schema: sessionEndedSchema, publishedBy: 'anyone' },
};
