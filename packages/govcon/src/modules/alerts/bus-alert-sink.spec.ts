import {
  DEFAULT_ALERT_POLICY,
  spendingHorizonOf,
  type EventEnvelope,
  type PublishEventRequest,
} from '@sysdesign/contracts';

import { alertPromptOf } from '../../core/alerts/digest';
import { awardEndingAlerts, SPENDING_DIGEST } from '../../core/alerts/spending';
import { BusAlertSink, notificationsUrlFromEnv } from './bus-alert-sink';

const NOW = new Date('2026-06-15T12:00:00Z');

describe('the bus alert sink', () => {
  it('[GOV-24] publishes an alert on its declared topic and the digest as an interaction prompt, both as govcon, and reads the bus URL from the environment with its default', async () => {
    const published: PublishEventRequest[] = [];
    const bus = {
      async publish(request: PublishEventRequest): Promise<EventEnvelope> {
        published.push(request);
        return { ...request, seq: String(published.length), publishedAt: NOW.toISOString() };
      },
    };
    const sink = new BusAlertSink(bus);
    const [alert] = awardEndingAlerts(spendingHorizonOf(), DEFAULT_ALERT_POLICY, 'enfav');
    if (alert === undefined) throw new Error('expected an alert');
    expect(await sink.publish(alert)).toEqual({ seq: '1' });
    const prompt = alertPromptOf({
      id: crypto.randomUUID(),
      profile: { id: 'enfav', company: 'Enfav LLC' },
      alerts: [alert],
      kind: SPENDING_DIGEST,
      now: NOW,
    });
    await sink.prompt(prompt);
    expect(published.map((event) => [event.topic, event.source])).toEqual([
      ['govcon.award.ending', 'govcon'],
      ['interaction.prompted', 'govcon'],
    ]);
    expect(published[0]?.payload).toBe(alert.payload);
    expect(published[1]?.payload).toBe(prompt);

    expect(notificationsUrlFromEnv({})).toBe('http://localhost:3005');
    expect(notificationsUrlFromEnv({ NOTIFICATIONS_URL: ' http://bus:3005 ' })).toBe(
      'http://bus:3005',
    );
    expect(() => notificationsUrlFromEnv({ NOTIFICATIONS_URL: 'nope' })).toThrow(
      /NOTIFICATIONS_URL must be a URL/,
    );
  });
});
