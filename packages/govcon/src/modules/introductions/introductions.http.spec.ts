import {
  awardBodyOf,
  type IntroductionDto,
  type IntroductionNoteOutput,
  type StoredProfile,
  type Target,
} from '@sysdesign/contracts';
import { FakeLoopClient } from '@sysdesign/studio-testing';

import type { AwardRecord } from '../../core/ports';
import { fetchedOf } from '../../core/spending/testing';
import {
  bootGovconHttp,
  get,
  json,
  post,
  resetGovcon,
  send,
  truncateGovcon,
  type Envelope,
  type GovconHttp,
} from '../app/testing';

/** The award fixture as the award lens reads it, with nothing subcontracted so the lens spends one request. */
const {
  orders: _orders,
  subcontracts: _roster,
  ...RECORD
} = awardBodyOf({ subcontractCount: 0, subcontractAmount: 0 });
const AWARD = RECORD.externalId;
const KEY = `kind=award&subject=${encodeURIComponent(AWARD)}`;

const NOTE: IntroductionNoteOutput = {
  subject: 'Small-business engineering capacity for 89303019FET000003',
  opening:
    'I lead Enfav LLC, a small software firm, and I am writing about the Department of Energy BPA call 89303019FET000003 for CYSOC support.',
  programReference: { piid: '89303019FET000003' },
  offerLines: [
    {
      offerId: 'offer.1',
      line: 'Agents that carry a support process end to end under human approval.',
    },
  ],
  ask: 'Does the program need additional small-business engineering capacity, and could you introduce me to its program manager?',
  closing:
    'Our capability statement is attached; I deliver remotely as a U.S.-citizen principal on unclassified work.',
};

describe('the introduction routes', () => {
  let http: GovconHttp;
  let url: string;
  const fake = new FakeLoopClient();

  /** The default profile given one offer to make; its company, for the goal's title. */
  const withOffers = async (): Promise<string> => {
    const profiles = (await get<Envelope<StoredProfile[]>>(url, '/profiles')).data;
    const chosen = profiles.find((profile) => profile.isDefault);
    if (chosen === undefined) throw new Error('no default profile');
    const { isDefault: _default, createdAt: _created, updatedAt: _updated, ...document } = chosen;
    const saved = await send(url, 'PUT', `/profiles/${chosen.id}`, {
      ...document,
      introduction: {
        about: 'builds agentic AI workflows.',
        delivery: 'Remote delivery by a U.S.-citizen principal; unclassified work.',
        contact: 'teaming@tiny.example',
        offers: [
          {
            id: 'agentic-workflows',
            label: 'Agentic workflow engineering',
            line: 'Agents that carry a process end to end.',
          },
        ],
      },
    });
    expect(saved.status).toBe(200);
    return chosen.company;
  };

  beforeAll(async () => {
    http = await bootGovconHttp({ awardDetails: [fetchedOf<AwardRecord | null>(RECORD)] }, fake);
    url = http.url;
  });

  beforeEach(() => resetGovcon(http));

  afterAll(async () => {
    await truncateGovcon(http.em);
    await http.app.close();
  });

  it('[GOV-40] starts one introduction-note run for a tracked award — the goal composed from the target, the award’s snapshot and the profile’s offers under the four fixed rules — reads it back pending, then ready as the note with the decision beside it, logs the draft on the target once, and reads a failed run as why', async () => {
    await send(url, 'PUT', `/targets/award/${AWARD}`, { label: RECORD.piid, stage: 'watching' });
    const company = await withOffers();

    const started = await post(url, '/introductions', {
      kind: 'award',
      subject: AWARD,
      awardExternalId: AWARD,
    });
    expect(started.status).toBe(202);
    const { runId } = (await json<Envelope<{ runId: string }>>(started)).data;
    const run = fake.core.getRun(runId);
    expect(run).toMatchObject({ pipeline: 'introduction-note', status: 'running' });
    expect(run?.request).toMatchObject({ maxIterations: 2 });
    expect(run?.trace).toBeNull();
    const request = fake.core.requests.get(runId);
    expect(request?.criteria?.map((criterion) => criterion.kind)).toEqual([
      'fidelity',
      'relevance',
      'restraint',
      'clarity',
    ]);
    const goal = request?.goal ?? '';
    expect(goal).toContain(
      `# Introduce ${company} to BOOZ ALLEN HAMILTON INC about 89303019FET000003`,
    );
    expect(goal).toContain('[offer.1] Agentic workflow engineering');
    expect(goal).toContain('"piid":"89303019FET000003"');

    const pending = (await get<Envelope<IntroductionDto>>(url, `/introductions/${runId}?${KEY}`))
      .data;
    expect(pending).toEqual({
      runId,
      status: 'pending',
      note: null,
      decision: null,
      overall: null,
      reason: null,
    });

    fake.core.complete(runId, [{ overall: 88, decision: 'accept', artifact: NOTE }]);
    const ready = (await get<Envelope<IntroductionDto>>(url, `/introductions/${runId}?${KEY}`))
      .data;
    expect(ready).toMatchObject({
      runId,
      status: 'ready',
      decision: 'accept',
      overall: 88,
      reason: null,
    });
    expect(ready.note?.subject).toBe(NOTE.subject);
    expect(ready.note?.body.split('\n')[0]).toBe(
      'Dear the small business liaison team at BOOZ ALLEN HAMILTON INC,',
    );
    expect(ready.note?.body).toContain('- Agents that carry a support process');

    // Logged once: a second read of the same run adds nothing.
    await get<Envelope<IntroductionDto>>(url, `/introductions/${runId}?${KEY}`);
    const target = (await get<Envelope<Target | null>>(url, `/targets/award/${AWARD}`)).data;
    expect(target?.activity).toEqual([
      { at: '2026-09-26T12:00:00.000Z', kind: 'drafted', summary: NOTE.subject, ref: runId },
    ]);

    const second = await post(url, '/introductions', {
      kind: 'award',
      subject: AWARD,
      awardExternalId: AWARD,
    });
    const other = (await json<Envelope<{ runId: string }>>(second)).data.runId;
    fake.core.fail(other, 'the model timed out');
    expect(
      (await get<Envelope<IntroductionDto>>(url, `/introductions/${other}?${KEY}`)).data,
    ).toMatchObject({ status: 'failed', reason: 'the model timed out', note: null });
  });

  it('[GOV-40] refuses an untracked target, a subject that is not of its kind, and a run the loop does not have', async () => {
    const untracked = await post(url, '/introductions', {
      kind: 'award',
      subject: 'CONT_AWD_NOBODY',
      awardExternalId: AWARD,
    });
    expect(untracked.status).toBe(404);
    const badUei = await post(url, '/introductions', {
      kind: 'firm',
      subject: 'NOT-A-UEI',
      awardExternalId: AWARD,
    });
    expect(badUei.status).toBe(400);
    await send(url, 'PUT', `/targets/award/${AWARD}`, { label: RECORD.piid, stage: 'watching' });
    const missing = await fetch(`${url}/introductions/run-nobody?${KEY}`);
    expect(missing.status).toBe(404);
  });
});
