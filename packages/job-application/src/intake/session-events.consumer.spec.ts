import { SESSION_TOPICS } from '@sysdesign/contracts';

import { SessionRecord } from '../applications';
import { InMemoryApplicationStore } from '../applications/testing';
import { SessionIntake } from './session-events.consumer';
import { FakeBusClient } from './testing';

const SETTINGS = {
  subscription: 'job-application.sessions',
  pullWaitMs: 50,
  eventsPerPull: 20,
  retryPauseMs: 5,
  busRecovery: { windowMs: 0, pauseMs: 1 },
};
const SESSION = { sessionId: crypto.randomUUID(), subject: 'Alex Example', profile: 'spec' };
const UNIT = {
  id: crypto.randomUUID(),
  ordinal: 1,
  label: 'Senior Engineer at Acme',
  url: null,
  facets: [{ name: 'company', value: 'Acme' }],
};

/** Polls until `holds` is true, for what a background consumer does; fails after `ms`. */
async function until(holds: () => boolean, ms = 3_000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!holds()) {
    if (Date.now() > deadline) throw new Error('the condition never held');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

describe('the record fed from the bus', () => {
  const log = () => {
    const lines: string[] = [];
    const warnings: string[] = [];
    return {
      lines,
      warnings,
      sink: { log: (m: string) => lines.push(m), warn: (m: string) => warnings.push(m) },
    };
  };

  it('[JA-4] subscribes before it pulls, applies each event and acknowledges it, and passes over — acknowledged — a payload the schema refuses', async () => {
    const bus = new FakeBusClient();
    const store = new InMemoryApplicationStore();
    const { lines, warnings, sink } = log();
    const intake = new SessionIntake(bus, new SessionRecord(store), SETTINGS, sink);
    await intake.start();
    expect(bus.subscribed).toEqual(['job-application.sessions']);
    expect(bus.subscriptions.get('job-application.sessions')?.topics).toEqual(
      Object.values(SESSION_TOPICS),
    );
    const publish = (topic: string, payload: unknown) =>
      bus.publish({ topic, source: 'browser-session', payload });
    await publish(SESSION_TOPICS.started, SESSION);
    await publish(SESSION_TOPICS.unitOpened, { ...SESSION, maxMinutes: 90, unit: UNIT });
    await publish(SESSION_TOPICS.unitOpened, { poison: true });
    await publish(SESSION_TOPICS.unitClosed, {
      ...SESSION,
      maxMinutes: 90,
      unit: UNIT,
      outcome: 'done',
    });
    await publish(SESSION_TOPICS.ended, { sessionId: SESSION.sessionId });
    await until(() => bus.acked.length === 5);
    await intake.stop();
    expect(bus.acked).toEqual(['1', '2', '3', '4', '5']);
    expect(store.rows.get(UNIT.id)).toMatchObject({ status: 'submitted', company: 'Acme' });
    expect(store.rows.get(UNIT.id)?.openedAt.toISOString()).toBe(bus.events[1]?.publishedAt);
    expect(warnings).toEqual([expect.stringMatching(/^session\.unit\.opened #3 passed over: /)]);
    expect(lines).toContain('#2 session.unit.opened: inserted');
    expect(lines).toContain('#4 session.unit.closed: updated');
  });

  it('[JA-4] on a subscription the bus swept it subscribes again, from the head, and warns once that a gap may exist', async () => {
    const bus = new FakeBusClient();
    const { warnings, sink } = log();
    const intake = new SessionIntake(
      bus,
      new SessionRecord(new InMemoryApplicationStore()),
      SETTINGS,
      sink,
    );
    await intake.start();
    bus.sweep('job-application.sessions');
    await until(() => bus.subscribed.length === 2);
    bus.sweep('job-application.sessions');
    await until(() => bus.subscribed.length === 3);
    await intake.stop();
    expect(warnings).toEqual([expect.stringContaining('the bus swept job-application.sessions')]);
  });
});
