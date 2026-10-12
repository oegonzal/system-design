import { describe, expect, it } from 'vitest';

import { keptAtMost } from '../bounds';
import { TASK_LABEL_BOUND } from '../browser-session/observation.schema';
import { NOTIFICATION_TOPICS } from '../notifications/topics';
import {
  SESSION_TOPICS,
  sessionEndedSchema,
  sessionStartedSchema,
  sessionUnitClosedSchema,
  sessionUnitOpenedSchema,
} from './session-events';

const SESSION = { sessionId: crypto.randomUUID(), subject: 'Alex Example', profile: 'spec' };
const UNIT = {
  id: crypto.randomUUID(),
  ordinal: 1,
  label: 'Senior Engineer at Acme',
  url: 'https://jobs.example.test/42',
  facets: [{ name: 'company', value: 'Acme' }],
};

describe('what a session says happened', () => {
  it('[BRW-15] declares the four topics on the bus, each with the payload the session publishes, and refuses a payload beside it', () => {
    for (const topic of Object.values(SESSION_TOPICS)) {
      expect(NOTIFICATION_TOPICS[topic]?.publishedBy).toBe('anyone');
    }
    expect(sessionStartedSchema.parse(SESSION)).toEqual(SESSION);
    expect(sessionStartedSchema.safeParse({ ...SESSION, subject: '' }).success).toBe(false);

    const opened = { ...SESSION, maxMinutes: 90, unit: UNIT };
    expect(sessionUnitOpenedSchema.parse(opened)).toEqual(opened);
    expect(
      sessionUnitOpenedSchema.parse({ ...opened, unit: { ...UNIT, url: null } }).unit.url,
    ).toBeNull();
    expect(
      sessionUnitOpenedSchema.safeParse({ ...opened, unit: { ...UNIT, id: 'task-1' } }).success,
    ).toBe(false);
    // A label read leniently off a plan may run past the ceiling the plan was asked for: the event takes what a lenient read returns.
    expect(
      sessionUnitOpenedSchema.safeParse({
        ...opened,
        unit: { ...UNIT, label: 'x'.repeat(keptAtMost(TASK_LABEL_BOUND)) },
      }).success,
    ).toBe(true);

    expect(sessionUnitClosedSchema.parse({ ...opened, outcome: 'done' }).outcome).toBe('done');
    expect(sessionUnitClosedSchema.safeParse({ ...opened, outcome: 'maybe' }).success).toBe(false);
    expect(sessionUnitClosedSchema.safeParse(opened).success).toBe(false);

    expect(sessionEndedSchema.parse({ sessionId: SESSION.sessionId })).toEqual({
      sessionId: SESSION.sessionId,
    });
    expect(sessionEndedSchema.safeParse(SESSION).success).toBe(false);
  });
});
