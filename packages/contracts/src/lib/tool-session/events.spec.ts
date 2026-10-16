import { describe, expect, it } from 'vitest';

import { GMAIL_TOPICS } from '../gmail/events';
import { GOOGLE_CALENDAR_TOPICS } from '../google-calendar/events';
import { NOTIFICATION_TOPICS } from '../notifications/topics';
import {
  TOOL_SESSION_TOPICS,
  toolSessionFinishedSchema,
  toolSessionStartedSchema,
  toolSessionSteppedSchema,
} from './events';
import { sessionTitleOf } from './session';

const SESSION = { service: 'example', sessionId: crypto.randomUUID() };

describe('what a tool session says happened', () => {
  it('[TSS-1] declares the three topics on the bus, each with the payload a program publishes, and refuses a payload beside it', () => {
    for (const topic of Object.values(TOOL_SESSION_TOPICS)) {
      expect(NOTIFICATION_TOPICS[topic]?.publishedBy).toBe('anyone');
    }
    const started = {
      ...SESSION,
      title: 'Keep the list tidy.',
      startedAt: '2026-10-16T10:00:00.000Z',
    };
    expect(toolSessionStartedSchema.parse(started)).toEqual(started);
    expect(toolSessionStartedSchema.safeParse({ ...started, title: '' }).success).toBe(false);
    const stepped = {
      ...SESSION,
      step: 1,
      loopRunId: 'run-1',
      executable: true,
      calls: [{ tool: 'list_items', outcome: 'ok' }],
      asked: false,
      finished: false,
    };
    expect(toolSessionSteppedSchema.parse(stepped)).toEqual(stepped);
    expect(
      toolSessionSteppedSchema.safeParse({ ...stepped, calls: [{ tool: 'x', outcome: 'done' }] })
        .success,
    ).toBe(false);
    const finished = {
      ...SESSION,
      status: 'complete',
      cause: 'nothing-left',
      detail: 'every item carries a note',
      steps: 3,
      endedAt: '2026-10-16T10:05:00.000Z',
    };
    expect(toolSessionFinishedSchema.parse(finished)).toEqual(finished);
    expect(toolSessionFinishedSchema.safeParse({ ...finished, status: 'running' }).success).toBe(
      false,
    );
  });

  it('[TSS-1] names a session by the mission’s first line of prose, never a heading', () => {
    expect(sessionTitleOf('# Mission\n\nKeep the list tidy.\n\n## Procedure\n')).toBe(
      'Keep the list tidy.',
    );
    expect(sessionTitleOf('# Only a heading')).toBe('# Only a heading');
  });

  it('[GML-1] [GCL-1] the mailbox and calendar topics are declared on the bus beside them, published by anyone', () => {
    for (const topic of [
      ...Object.values(GMAIL_TOPICS),
      ...Object.values(GOOGLE_CALENDAR_TOPICS),
    ]) {
      expect(NOTIFICATION_TOPICS[topic]?.publishedBy).toBe('anyone');
    }
  });
});
