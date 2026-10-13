import {
  INTERACTION_TOPICS,
  type GovconAlert,
  type InteractionPrompt,
  type Recovery,
} from '@sysdesign/contracts';
import type { BusClient } from '@sysdesign/notifications-client';

import type { AlertSink } from '../../../core/ports';

/** How govcon names itself on what it publishes. */
export const GOVCON_SOURCE = 'govcon';
/** A bus that cannot be reached is asked again for this long; nobody waits on a warm. */
export const ALERT_BUS_RECOVERY: Recovery = { windowMs: 30_000, pauseMs: 2_000 };
const DEFAULT_NOTIFICATIONS_URL = 'http://localhost:3005';

/**
 *   NOTIFICATIONS_URL  the notifications bus the alerts and the digest go to (default http://localhost:3005)
 *
 * Refused by name when it is not a URL, so a misspelt bus fails the boot and not the first warm.
 */
export function notificationsUrlFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  const url = env['NOTIFICATIONS_URL']?.trim() || DEFAULT_NOTIFICATIONS_URL;
  try {
    new URL(url);
  } catch {
    throw new Error(`NOTIFICATIONS_URL must be a URL, got ${JSON.stringify(url)}`);
  }
  return url;
}

/** Alerts onto the notifications bus: each on its declared topic, the digest as the prompt every channel renders. */
export class BusAlertSink implements AlertSink {
  constructor(private readonly bus: Pick<BusClient, 'publish'>) {}

  async publish(alert: GovconAlert): Promise<{ seq: string }> {
    const event = await this.bus.publish({
      topic: alert.topic,
      source: GOVCON_SOURCE,
      payload: alert.payload,
    });
    return { seq: event.seq };
  }

  async prompt(prompt: InteractionPrompt): Promise<void> {
    await this.bus.publish({
      topic: INTERACTION_TOPICS.prompted,
      source: GOVCON_SOURCE,
      payload: prompt,
    });
  }
}
