import {
  acceptsHtml,
  htmlResult,
  jsonResult,
  messagePage,
  NO_STORE,
  type GatewayEvent,
  type GatewayResult,
} from './http';
import type { Log } from './log';

/**
 * The wake path. The task sleeps at a desired count of 0, and the first
 * request after that finds nobody at the upstream: no address, a refused
 * connection, a connection that goes nowhere. That is the signal to ask for
 * one task, touch the database so its resume overlaps the task's start, and
 * tell the caller to come back — a page that refreshes itself, or JSON for a
 * script — with nothing cached along the way.
 */
export interface ServiceControl {
  /** The service's desired count, or none when the service is not found. */
  desiredCount(): Promise<number | undefined>;
  setDesiredCount(count: number): Promise<void>;
}

export interface DatabaseTouch {
  /** Open and close one connection, and never wait for it. */
  touch(): void;
}

/** The failure codes that mean nobody is listening, as opposed to an upstream that answered badly. */
export const WAKE_CODES: ReadonlySet<string> = new Set([
  'ENOTFOUND',
  'EAI_AGAIN',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ECONNRESET',
]);

export const RETRY_AFTER_SECONDS = 10;
const REFRESH_SECONDS = 5;

/** What telling the service to want tasks found: no such service, tasks already wanted, or none and now asked for. */
type Desired =
  | { outcome: 'not-found' }
  | { outcome: 'wanted'; desiredCount: number }
  | { outcome: 'asked'; desiredCount: number };

/**
 * The one reading of "asleep": a desired count of 0. The service is told to
 * want `count` tasks when it wants none and left alone otherwise — by the
 * proxy, for a viewer who found nobody listening, and by the job handler,
 * for a launch that reaches the task on its private name. A failure to ask
 * is the caller's to judge: the proxy logs it and still tells the viewer to
 * retry, the job handler lets its invocation fail.
 */
export async function ensureDesired(service: ServiceControl, count: number): Promise<Desired> {
  const desired = await service.desiredCount();
  if (desired === undefined) return { outcome: 'not-found' };
  if (desired === 0) {
    await service.setDesiredCount(count);
    return { outcome: 'asked', desiredCount: count };
  }
  return { outcome: 'wanted', desiredCount: desired };
}

interface WakeDeps {
  service: ServiceControl;
  database?: DatabaseTouch;
  log: Log;
}

export interface Wake {
  /** Ask for one task when none is wanted; already waking or failing to ask, the caller is told to retry all the same. */
  ensureAwake(): Promise<void>;
  /** The 503 "starting" answer: a self-refreshing page, or JSON on an api route or for a caller who did not ask for HTML. */
  starting(event: GatewayEvent, api: boolean): GatewayResult;
}

export function createWake({ service, database, log }: WakeDeps): Wake {
  return {
    async ensureAwake() {
      database?.touch();
      try {
        const found = await ensureDesired(service, 1);
        if (found.outcome === 'not-found') {
          log('service not found while waking');
        } else if (found.outcome === 'asked') {
          log('waking the service', { desiredCount: found.desiredCount });
        } else {
          log('service already waking', { desiredCount: found.desiredCount });
        }
      } catch (error) {
        log('could not wake the service', { error: String(error) });
      }
    },

    starting(event, api) {
      const headers = { 'retry-after': String(RETRY_AFTER_SECONDS), ...NO_STORE };
      if (api || !acceptsHtml(event)) {
        return jsonResult(
          503,
          { status: 'starting', retryAfterSeconds: RETRY_AFTER_SECONDS },
          headers,
        );
      }
      const page = messagePage(
        'Starting the studio',
        'The studio is starting. This page refreshes itself; the wait is usually under two minutes.',
        `<meta http-equiv="refresh" content="${REFRESH_SECONDS}">`,
      );
      return htmlResult(503, page, headers);
    },
  };
}
