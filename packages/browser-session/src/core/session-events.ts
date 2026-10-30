import {
  createWriteQueue,
  SESSION_TOPICS,
  type BrowserSessionDetailDto,
  type SessionEvent,
  type TaskOutcome,
} from '@sysdesign/contracts';

import type { EngineContext } from './engine-context';
import type { Clock } from './ports';
import { lifetimeMinutesOf } from './rails';
import type { OpenTask } from './session-state';

/**
 * What the session tells whoever keeps a record of its units beyond it: it
 * started, a unit opened, a unit closed, it ended. The events ride a write
 * queue of their own — a bus riding out a restart never holds a task row or a
 * decision row behind it — and the close waits for them one window in all,
 * saying what is still unsent rather than waiting on it for good.
 */
export interface SessionEventsPort {
  publish(event: SessionEvent): Promise<void>;
}

export interface SessionEvents {
  publish(event: SessionEvent): void;
  /** Resolves once every event has settled or the window has passed; answers what is still unsent. */
  drain(windowMs: number): Promise<string[]>;
}

const describe = (event: SessionEvent, ordinal: number): string => {
  const unit = 'unit' in event.payload ? ` (unit ${event.payload.unit.ordinal})` : '';
  return `event ${ordinal} ${event.topic}${unit}`;
};

export function createSessionEvents(
  port: SessionEventsPort,
  report: (what: string, error: unknown) => void,
  clock: Clock,
): SessionEvents {
  const queue = createWriteQueue(report);
  const inFlight = new Set<string>();
  let count = 0;
  return {
    publish(event) {
      count += 1;
      const what = describe(event, count);
      inFlight.add(what);
      queue.write(what, () => port.publish(event).finally(() => inFlight.delete(what)));
    },
    async drain(windowMs) {
      // The window is kept by the session's clock, and cancelled once the
      // queue drains first, so no timer outlives the close.
      let cancel = (): void => undefined;
      const windowEnds = new Promise<void>((resolve) => {
        cancel = clock.at(new Date(clock.now().getTime() + windowMs), resolve);
      });
      await Promise.race([queue.drain(), windowEnds]);
      cancel();
      return [...inFlight];
    },
  };
}

type Session = Pick<EngineContext, 'state' | 'options'>;

const sessionOf = ({ state, options }: Session) => ({
  sessionId: state.sessionId,
  subject: options.subject,
  profile: options.profile,
});

export const startedEvent = (session: Session): SessionEvent => ({
  topic: SESSION_TOPICS.started,
  payload: sessionOf(session),
});

const unitOf = (task: OpenTask) => ({
  id: task.id,
  ordinal: task.ordinal,
  label: task.label,
  url: task.url,
  facets: [...task.facets],
});

export const unitOpenedEvent = (session: Session, task: OpenTask): SessionEvent => ({
  topic: SESSION_TOPICS.unitOpened,
  payload: {
    ...sessionOf(session),
    maxMinutes: lifetimeMinutesOf(session.options.rails),
    unit: unitOf(task),
  },
});

export const unitClosedEvent = (
  session: Session,
  task: OpenTask,
  outcome: TaskOutcome,
): SessionEvent => ({
  topic: SESSION_TOPICS.unitClosed,
  payload: {
    ...sessionOf(session),
    maxMinutes: lifetimeMinutesOf(session.options.rails),
    unit: unitOf(task),
    outcome,
  },
});

export const endedEvent = (sessionId: string): SessionEvent => ({
  topic: SESSION_TOPICS.ended,
  payload: { sessionId },
});

/**
 * A recorded session's events again, from its rows: what it would have
 * published, for a record that missed them. A consumer keyed on the unit's id
 * takes a replay as nothing new.
 */
export function sessionEventsOf(
  detail: BrowserSessionDetailDto & { subject: string },
): SessionEvent[] {
  const session = {
    sessionId: detail.id,
    subject: detail.subject,
    profile: detail.profile,
  };
  const events: SessionEvent[] = [{ topic: SESSION_TOPICS.started, payload: session }];
  for (const task of detail.tasks) {
    const unit = {
      id: task.id,
      ordinal: task.ordinal,
      label: task.label,
      url: task.externalRef,
      facets: [...task.facets],
    };
    const payload = { ...session, maxMinutes: lifetimeMinutesOf(detail.limits), unit };
    events.push({ topic: SESSION_TOPICS.unitOpened, payload });
    if (task.outcome !== null) {
      events.push({
        topic: SESSION_TOPICS.unitClosed,
        payload: { ...payload, outcome: task.outcome },
      });
    }
  }
  if (detail.status !== 'running') {
    events.push({ topic: SESSION_TOPICS.ended, payload: { sessionId: detail.id } });
  }
  return events;
}
