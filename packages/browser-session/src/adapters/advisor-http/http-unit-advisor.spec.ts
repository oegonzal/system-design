import type { UnitAdviceRequest } from '@sysdesign/contracts';

import { AdvisorFaulted } from '../../core/unit-advice';
import { HttpUnitAdvisor } from './http-unit-advisor';

type Script = { status: number; body?: unknown } | Error;

/** Fetch answering from a script, call by call, and recording what it was asked. */
function scripted(answers: Script[]) {
  const calls: { method: string; url: string; body: unknown }[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({
      method: String(init?.method),
      url: String(url),
      body: init?.body === undefined ? undefined : JSON.parse(String(init.body)),
    });
    const answer = answers.shift();
    if (answer === undefined) throw new Error('the script ran out of answers');
    if (answer instanceof Error) throw answer;
    return new Response(answer.body === undefined ? null : JSON.stringify(answer.body), {
      status: answer.status,
    });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

const DESCRIPTOR = { id: 'record', facets: ['company'] };
const REQUEST: UnitAdviceRequest = {
  subject: 'Alex Example',
  asker: { kind: 'browser-session', id: 'session-1', label: 'step 2' },
  facets: ['company'],
};
const ADVICE = {
  advisor: 'record',
  units: [{ identity: [{ name: 'company', value: 'Acme' }], stance: 'avoid', note: 'applied' }],
  omitted: 0,
};
const dead = () => new TypeError('fetch failed');
const ticking = () => {
  let clock = 0;
  return { now: () => clock, sleep: async (ms: number) => void (clock += ms) };
};
const RECOVERY = { windowMs: 1_000, pauseMs: 300 };

describe('an advisor over HTTP', () => {
  it('[BRW-14] reads the descriptor and the advice from the contracts’ routes and envelope, posting the request as given', async () => {
    const { calls, fetchImpl } = scripted([
      { status: 200, body: { data: DESCRIPTOR } },
      { status: 200, body: { data: ADVICE } },
      { status: 200, body: { data: { advisor: 'record', unit: ADVICE.units[0] } } },
      { status: 200, body: { data: { advisor: 'record', unit: null } } },
    ]);
    const advisor = new HttpUnitAdvisor('http://advisor.test', { fetchImpl });
    expect(await advisor.describe()).toEqual(DESCRIPTOR);
    expect(await advisor.recall(REQUEST, { probe: false })).toEqual(ADVICE);
    // A lookup posts the claim's identity with the request, and reads a unit or nothing.
    const lookup = { ...REQUEST, identity: [{ name: 'company', value: 'Acme' }] };
    expect(await advisor.lookup(lookup, { probe: false })).toEqual({
      advisor: 'record',
      unit: ADVICE.units[0],
    });
    expect(await advisor.lookup(lookup, { probe: true })).toEqual({
      advisor: 'record',
      unit: null,
    });
    expect(calls.map((call) => [call.method, call.url, call.body])).toEqual([
      ['GET', 'http://advisor.test/advisor', undefined],
      ['POST', 'http://advisor.test/advice', REQUEST],
      ['POST', 'http://advisor.test/advice/lookup', lookup],
      ['POST', 'http://advisor.test/advice/lookup', lookup],
    ]);
  });

  it('[BRW-14] says which fault it was — malformed, refused, failed, unreachable, timed out — and a bad answer never reads as advice', async () => {
    const fault = async (script: Script[], probe = false): Promise<AdvisorFaulted> => {
      const advisor = new HttpUnitAdvisor('http://advisor.test', {
        fetchImpl: scripted(script).fetchImpl,
      });
      try {
        await advisor.recall(REQUEST, { probe });
        throw new Error('answered');
      } catch (error) {
        if (!(error instanceof AdvisorFaulted)) throw error;
        return error;
      }
    };
    expect(
      (await fault([{ status: 200, body: { data: { ...ADVICE, omitted: 'none' } } }])).reason,
    ).toBe('malformed');
    expect(
      (
        await fault([
          { status: 200, body: { data: { advisor: 'record', units: [{}], omitted: 0 } } },
        ])
      ).detail,
    ).toMatch(/answered something the contract does not read: units\.0\./);
    const refused = await fault([{ status: 404, body: { message: 'no such subject' } }]);
    expect([refused.reason, refused.detail]).toEqual([
      'refused',
      'POST /advice answered 404: no such subject',
    ]);
    expect((await fault([{ status: 503, body: { message: 'starting' } }])).reason).toBe('failed');
    expect((await fault([dead()])).reason).toBe('unreachable');
    const timeout = new Error('The operation was aborted due to timeout');
    timeout.name = 'TimeoutError';
    expect((await fault([timeout])).reason).toBe('timeout');
  });

  it('[BRW-14] rides out a restarting advisor within the declared window — a dead socket, a failed answer — never a refusal, and a probe asks exactly once', async () => {
    const restarting = scripted([
      dead(),
      { status: 500, body: {} },
      { status: 200, body: { data: ADVICE } },
    ]);
    const advisor = new HttpUnitAdvisor('http://advisor.test', {
      fetchImpl: restarting.fetchImpl,
      recovery: RECOVERY,
      clock: ticking(),
    });
    expect(await advisor.recall(REQUEST, { probe: false })).toEqual(ADVICE);
    expect(restarting.calls).toHaveLength(3);

    const refusing = scripted([{ status: 400, body: { message: 'bad request' } }]);
    await expect(
      new HttpUnitAdvisor('http://advisor.test', {
        fetchImpl: refusing.fetchImpl,
        recovery: RECOVERY,
        clock: ticking(),
      }).describe(),
    ).rejects.toBeInstanceOf(AdvisorFaulted);
    expect(refusing.calls).toHaveLength(1);

    const gone = scripted(Array.from({ length: 10 }, dead));
    const probing = new HttpUnitAdvisor('http://advisor.test', {
      fetchImpl: gone.fetchImpl,
      recovery: RECOVERY,
      clock: ticking(),
    });
    await expect(probing.recall(REQUEST, { probe: true })).rejects.toBeInstanceOf(AdvisorFaulted);
    expect(gone.calls).toHaveLength(1);
    await expect(probing.recall(REQUEST, { probe: false })).rejects.toBeInstanceOf(AdvisorFaulted);
    // A pause at 0, 300, 600 and 900 ms of a 1 s window.
    expect(gone.calls).toHaveLength(5);
  });
});
