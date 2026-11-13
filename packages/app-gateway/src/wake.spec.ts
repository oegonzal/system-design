import { functionUrlEvent, recordedLog } from './testing';
import { createWake, RETRY_AFTER_SECONDS, WAKE_CODES, type ServiceControl } from './wake';

/** A service at a desired count, remembering what it is set to; `undefined` is a service not found. */
function service(desired: number | undefined, failing = false) {
  const set: number[] = [];
  const control: ServiceControl = {
    desiredCount: async () => {
      if (failing) throw new Error('ecs down');
      return desired;
    },
    setDesiredCount: async (count) => void set.push(count),
  };
  return { control, set };
}

describe('the wake path', () => {
  it('names the failures that mean nobody is listening', () => {
    expect([...WAKE_CODES]).toEqual([
      'ENOTFOUND',
      'EAI_AGAIN',
      'ECONNREFUSED',
      'ETIMEDOUT',
      'ECONNRESET',
    ]);
  });

  it('asks for one task when none is wanted, and touches the database', async () => {
    const asleep = service(0);
    const touched: number[] = [];
    const { log, lines } = recordedLog();
    const wake = createWake({
      service: asleep.control,
      database: { touch: () => void touched.push(1) },
      log,
    });
    await wake.ensureAwake();
    expect(asleep.set).toEqual([1]);
    expect(touched).toEqual([1]);
    expect(lines).toEqual([{ message: 'waking the service', detail: { desiredCount: 1 } }]);
  });

  it('asks for nothing when a task is already wanted, or the service is unknown, or cannot be asked', async () => {
    const awake = service(1);
    const unknown = service(undefined);
    const failing = service(0, true);
    const { log, lines } = recordedLog();
    for (const { control } of [awake, unknown, failing]) {
      await createWake({ service: control, log }).ensureAwake();
    }
    expect([awake.set, unknown.set, failing.set]).toEqual([[], [], []]);
    expect(lines.map(({ message }) => message)).toEqual([
      'service already waking',
      'service not found while waking',
      'could not wake the service',
    ]);
  });

  it('answers a page with a self-refreshing "starting" page that is never cached', () => {
    const { log } = recordedLog();
    const wake = createWake({ service: service(0).control, log });
    const result = wake.starting(functionUrlEvent({ headers: { accept: 'text/html,*/*' } }), false);
    expect(result.statusCode).toBe(503);
    expect(result.headers).toEqual({
      'content-type': 'text/html; charset=utf-8',
      'retry-after': String(RETRY_AFTER_SECONDS),
      'cache-control': 'no-store',
    });
    expect(result.body).toContain('<meta http-equiv="refresh" content="5">');
    expect(result.body).toContain('under two minutes');
  });

  it('answers an api route, or a caller who did not ask for a page, in JSON', () => {
    const { log } = recordedLog();
    const wake = createWake({ service: service(0).control, log });
    const api = wake.starting(functionUrlEvent({ headers: { accept: 'text/html' } }), true);
    const script = wake.starting(
      functionUrlEvent({ headers: { accept: 'application/json' } }),
      false,
    );
    for (const result of [api, script]) {
      expect(result.statusCode).toBe(503);
      expect(result.headers?.['retry-after']).toBe('10');
      expect(result.headers?.['cache-control']).toBe('no-store');
      expect(JSON.parse(result.body ?? '')).toEqual({ status: 'starting', retryAfterSeconds: 10 });
    }
  });
});
