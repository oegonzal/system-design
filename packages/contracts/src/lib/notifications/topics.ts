import {
  DESIGN_TOPICS,
  designRevisedSchema,
  designStartedSchema,
  designStoredSchema,
} from '../agentic-system/events';
import {
  GMAIL_TOPICS,
  gmailDraftCreatedSchema,
  gmailLabelsChangedSchema,
  gmailMessageReceivedSchema,
} from '../gmail/events';
import {
  GOOGLE_CALENDAR_TOPICS,
  calendarEventSchema,
  calendarInvitationSchema,
} from '../google-calendar/events';
import { ALERT_DECLARATIONS } from '../govcon/alerts';
import {
  TOOL_SESSION_TOPICS,
  toolSessionFinishedSchema,
  toolSessionStartedSchema,
  toolSessionSteppedSchema,
} from '../tool-session/events';
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
  // What the agentic-system service says happened to a memory-design cycle.
  [DESIGN_TOPICS.started]: { schema: designStartedSchema, publishedBy: 'anyone' },
  [DESIGN_TOPICS.revised]: { schema: designRevisedSchema, publishedBy: 'anyone' },
  [DESIGN_TOPICS.stored]: { schema: designStoredSchema, publishedBy: 'anyone' },
  // What a tool session says happened, whichever program ran it.
  [TOOL_SESSION_TOPICS.started]: { schema: toolSessionStartedSchema, publishedBy: 'anyone' },
  [TOOL_SESSION_TOPICS.stepped]: { schema: toolSessionSteppedSchema, publishedBy: 'anyone' },
  [TOOL_SESSION_TOPICS.finished]: { schema: toolSessionFinishedSchema, publishedBy: 'anyone' },
  // What the mailbox service saw arrive, drafted and relabelled.
  [GMAIL_TOPICS.messageReceived]: { schema: gmailMessageReceivedSchema, publishedBy: 'anyone' },
  [GMAIL_TOPICS.draftCreated]: { schema: gmailDraftCreatedSchema, publishedBy: 'anyone' },
  [GMAIL_TOPICS.labelsChanged]: { schema: gmailLabelsChangedSchema, publishedBy: 'anyone' },
  // What the calendar service saw change, and the invitations it found waiting.
  [GOOGLE_CALENDAR_TOPICS.eventCreated]: { schema: calendarEventSchema, publishedBy: 'anyone' },
  [GOOGLE_CALENDAR_TOPICS.eventUpdated]: { schema: calendarEventSchema, publishedBy: 'anyone' },
  [GOOGLE_CALENDAR_TOPICS.eventCancelled]: { schema: calendarEventSchema, publishedBy: 'anyone' },
  [GOOGLE_CALENDAR_TOPICS.invitationReceived]: {
    schema: calendarInvitationSchema,
    publishedBy: 'anyone',
  },
  // What govcon's daily warm found, for whoever keeps a record; the digest it also prompts is what reaches a person.
  ...Object.fromEntries(
    Object.values(ALERT_DECLARATIONS).map(({ topic, schema }): [string, TopicDeclaration] => [
      topic,
      { schema, publishedBy: 'anyone' },
    ]),
  ),
};
