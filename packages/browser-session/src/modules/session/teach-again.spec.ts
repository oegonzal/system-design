import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  readDocumentIndex,
  type OrchestrationRunDto,
  type OrchestrationStepDto,
} from '@sysdesign/contracts';
import { FakeLoop, FakeLoopClient } from '@sysdesign/studio-testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { TEACH_ITERATIONS } from '../../adapters/loop-http/loop-brain';
import { SESSION_ENV, SESSION_FLAGS } from '../../config';
import { SessionRefused } from '../../core/unit-advice';
import { guidanceItemOf, subjectFor, teachAgain, type TeachAgainDeps } from './teach-again';

const SESSION_A = '11111111-1111-4111-8111-111111111111';
const SESSION_C = '33333333-3333-4333-8333-333333333333';
const AT = '2026-10-10T12:00:00.000Z';
const CONTEXT = { taskLabel: 'Engineer at Acme', page: 'Engineer | Acme' };

/** An item as a session before question-keyed guidance wrote it: the label and the words beside it apart, no chosen basis. */
const older = (
  label: string,
  question: string | null,
  answer: string,
  options: string[] | null,
) => ({
  sessionId: SESSION_A,
  capturedAt: AT,
  field: { label, question, type: 'radio', options },
  context: CONTEXT,
  answer,
});

/** An item as a session writes it today, given in the unit of work named — null outside any — and naming its channel. */
const newer = (
  question: string,
  answer: string,
  chosen: string | null,
  unitKey: string | null = null,
) => ({
  sessionId: SESSION_A,
  capturedAt: AT,
  field: { question, type: 'radio', options: ['Yes', 'No'] },
  context: { ...CONTEXT, unitKey },
  answer,
  chosen,
  via: 'chat',
});

/** A field's result as the dump records it: the item, what it was chosen from, and the channel it came on. */
const withResult = (
  guidance: unknown,
  chosen: string | null = 'option',
  via: string | null = 'chat',
) => ({
  result: { guidance, chosen, via },
});

/** The result's say beside an item, as `guidanceItemOf` takes it. */
const result = (chosen: string | null = 'option', via: string | null = 'chat') => ({ chosen, via });

const teaching = (
  decisionId: string,
  orchestrationRunId: string | null,
  subject: string | null = null,
) => ({
  decisionId,
  orchestrationRunId,
  fault: orchestrationRunId === null ? 'loop unreachable' : null,
  document: subject === null ? {} : { subject },
});

async function writeStep(dump: string, step: string, fields: unknown[], teachings: unknown[]) {
  const dir = join(dump, '01-steps', step);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'fields.json'), JSON.stringify({ fields }));
  await writeFile(join(dir, 'teach.json'), JSON.stringify(teachings));
}

const running = (loop: FakeLoop): OrchestrationRunDto[] =>
  [...loop.orchestrations.records.values()].filter((record) => record.status === 'running');

/** The fake loop whose every awaited orchestration settles stored on the first poll's sleep — its digest step as given — plus the deps over it. */
function harness(digest: Partial<OrchestrationStepDto> = {}) {
  const loop = new FakeLoop();
  const client = new FakeLoopClient(loop);
  const taught: { decisionIds: string[]; orchestrationRunId: string }[] = [];
  const logged: string[] = [];
  let digests = 0;
  const deps: TeachAgainDeps = {
    client,
    ledger: {
      recordTeaching: async (decisionIds, orchestrationRunId) => {
        taught.push({ decisionIds: [...decisionIds], orchestrationRunId });
      },
    },
    subject: 'the configured subject',
    untaught: ['terminal'],
    log: (text) => logged.push(text),
    awaiting: {
      pollEveryMs: 0,
      staleAfterMs: 60_000,
      now: () => 0,
      sleep: async () => {
        const latest = running(loop).at(-1);
        if (latest === undefined) return;
        digests += 1;
        loop.orchestrations.complete(latest.orchestrationRunId, {
          digest: { runIds: [`d-new-${digests}`], counts: { memories: 3, kept: 3 }, ...digest },
          store: { counts: { chunks: 3 } },
        });
      },
    },
  };
  return { loop, deps, taught, logged };
}

describe('teach-again over a folder of session dumps', () => {
  let dumps: string;
  beforeEach(async () => {
    dumps = await mkdtemp(join(tmpdir(), 'teach-again-'));
  });
  afterEach(async () => {
    await rm(dumps, { recursive: true, force: true });
  });

  it('[BRW-17] [BRW-20] reads an older item under its label and context and a newer one under its question, each on the channel its result or itself names; a keyless or channel-less item is nothing', () => {
    const old = guidanceItemOf(
      older('', 'Are you available for an Onsite job?', 'Yes', ['Yes', 'No']),
      result(),
      null,
    );
    expect(old).toMatchObject({
      field: {
        question: 'Are you available for an Onsite job?',
        type: 'radio',
        options: ['Yes', 'No'],
      },
      answer: 'Yes',
      chosen: null,
      via: 'chat',
    });
    expect(
      guidanceItemOf(older('Phone', 'Where can we reach you?', '555', null), result(null), null)
        ?.field.question,
    ).toBe('Phone. Where can we reach you?');
    // A pick from the drafts is the item's own say; a letter the page's options lettered is none.
    expect(
      guidanceItemOf(newer('Will you require sponsorship?', 'No', 'record'), result(), null)
        ?.chosen,
    ).toBe('record');
    expect(
      guidanceItemOf(older('Notes', null, 'typed', null), result('transfer'), null)?.chosen,
    ).toBe('transfer');
    expect(guidanceItemOf(older('', null, 'Yes', ['Yes']), result(), null)).toBeNull();
    // An older item carries its channel only on its result; one that names none anywhere is nobody's to teach.
    expect(
      guidanceItemOf(older('Phone', null, '555', null), result(null, 'terminal'), null)?.via,
    ).toBe('terminal');
    expect(
      guidanceItemOf(newer('Sponsorship?', 'No', null), result(null, 'terminal'), null)?.via,
    ).toBe('chat');
    expect(guidanceItemOf(older('Phone', null, '555', null), result(null, null), null)).toBeNull();
    // An item recorded before answers named their unit of work is given the unit open at its
    // step; a newer one keeps its own, none included.
    const unitOf = (raw: Record<string, unknown>) =>
      guidanceItemOf(raw, result(null), 'company=acme')?.context.unitKey;
    expect(unitOf(older('Phone', null, '555', null))).toBe('company=acme');
    expect(unitOf(newer('Sponsorship?', 'No', null, 'company=globex'))).toBe('company=globex');
    expect(unitOf(newer('Sponsorship?', 'No', null))).toBeNull();
  });

  it('[BRW-20] leaves an answer on a channel the settings keep untaught where it was: counted, untaught, its earlier digest kept, its row unlinked', async () => {
    const { loop, deps, taught, logged } = harness();
    const earlier = loop.orchestrations.start('document-memory', { goal: 'earlier' });
    loop.orchestrations.complete(earlier.orchestrationRunId, {
      digest: { runIds: ['d-old-terminal'] },
      store: {},
    });
    const dump = join(dumps, '2026-10-19T21-00-00-000-999999-session');
    await writeStep(
      dump,
      '05',
      [
        // An older item names no channel itself: its result's is the one the policy reads.
        withResult(
          older('What is your desired salary?', null, '$140,000', null),
          'typed',
          'terminal',
        ),
        withResult(newer('Will you require sponsorship?', 'No', null)),
      ],
      [teaching('dec-terminal', earlier.orchestrationRunId), teaching('dec-chat', null)],
    );

    const report = await teachAgain(deps, dumps, false);
    expect(report).toMatchObject({
      sessions: 1,
      answers: 1,
      documents: 1,
      untaught: 1,
      retracted: 0,
    });
    const goals = loop.orchestrations.startRequests.slice(1).map((posted) => posted.request.goal);
    expect(goals).toHaveLength(1);
    expect(goals[0]).toContain('Asked "Will you require sponsorship?"');
    expect(goals[0]).toContain('answered via chat.');
    expect(goals[0]).not.toContain('desired salary');
    expect(loop.retracted).toEqual([]);
    expect(taught.map((linked) => linked.decisionIds)).toEqual([['dec-chat']]);
    expect(logged[0]).toContain('1 answer(s) taught again through');
  });

  it('[BRW-20] counts a dump whose every answer is on a channel the settings keep untaught as untaught, not as unanswered', async () => {
    const { loop, deps } = harness();
    const dump = join(dumps, '2026-10-19T22-00-00-000-888888-session');
    await writeStep(
      dump,
      '03',
      [withResult(older('', 'Portfolio', 'https://example.test', null), 'typed', 'terminal')],
      [teaching('dec-1', null)],
    );
    expect(await teachAgain(deps, dumps, false)).toMatchObject({
      sessions: 0,
      answers: 0,
      unanswered: 0,
      untaught: 1,
    });
    expect(loop.orchestrations.startRequests).toHaveLength(0);
  });

  it('[BRW-17] [QL-71] teaches one document per unit of work a dump’s answers were given in, and one for those given outside any, each linking its own answers’ rows', async () => {
    const { loop, deps, taught } = harness();
    const dump = join(dumps, '2026-10-13T09-00-00-000-dddddd-session');
    await writeStep(
      dump,
      '02',
      [
        withResult(newer('Do you know anyone at this organization?', 'No', null, 'company=acme')),
        withResult(newer('Will you require sponsorship?', 'No', null)),
        withResult(older('', 'Are you available for an Onsite job?', 'Yes', ['Yes', 'No'])),
        withResult(newer('How did you hear of this opening?', 'A friend', null, 'company=globex')),
        withResult(newer('Would you relocate for this role?', 'Yes', null, 'company=acme')),
      ],
      ['d-1', 'd-2', 'd-3', 'd-4', 'd-5'].map((id) => teaching(id, null)),
    );

    expect((await teachAgain(deps, dumps, false)).documents).toBe(3);
    const goals = loop.orchestrations.startRequests.map((posted) => posted.request.goal);
    expect(goals.map((goal) => readDocumentIndex(goal)?.document.unitKey)).toEqual([
      'company=acme',
      undefined,
      'company=globex',
    ]);
    expect(goals[0]).toContain('Asked "Would you relocate for this role?"');
    expect(goals[1]).toContain('Asked "Are you available for an Onsite job?"');
    expect(goals[2]).toContain('Asked "How did you hear of this opening?"');
    expect(taught.map((linked) => linked.decisionIds)).toEqual([
      ['d-1', 'd-5'],
      ['d-2', 'd-3'],
      ['d-4'],
    ]);
  });

  it('[BRW-17] gives an older answer the unit of work its dump records open at its step — by the identity declared, else the task’s own id — and none outside every unit', async () => {
    const { loop, deps } = harness();
    const dump = join(dumps, '2026-10-12T09-00-00-000-eeeeee-session');
    const answer = (question: string, id: string, step: string) =>
      writeStep(
        dump,
        step,
        [withResult(older('', question, 'No', ['Yes', 'No']))],
        [teaching(id, null)],
      );
    await answer('Do you know anyone here?', 'd-1', '03');
    await answer('Will you require sponsorship?', 'd-2', '04');
    await answer('Would you relocate for this role?', 'd-3', '07');
    const acme = { id: 'task-acme', facets: [{ name: 'company', value: 'Acme' }] };
    await writeFile(
      join(dump, '02-tasks.json'),
      JSON.stringify([
        { ...acme, startStep: 2, endStep: 3 },
        { id: 'task-before-facets', startStep: 5, endStep: null },
      ]),
    );

    expect((await teachAgain(deps, dumps, false)).documents).toBe(3);
    const goals = loop.orchestrations.startRequests.map((posted) => posted.request.goal);
    expect(goals.map((goal) => readDocumentIndex(goal)?.document.unitKey)).toEqual([
      'company=acme',
      undefined,
      'task-before-facets',
    ]);
  });

  it('[BRW-17] keeps every earlier digest of a batch whose new digest left facts out of the store, its rows linked, and says why', async () => {
    const note = '1 withheld: bound to a unit of work, in a document that names none';
    const { loop, deps, taught } = harness({
      reason: 'unit-unnamed',
      note,
      counts: { memories: 3, kept: 2, 'unit-unnamed': 1 },
    });
    const earlier = loop.orchestrations.start('document-memory', { goal: 'earlier' });
    loop.orchestrations.complete(earlier.orchestrationRunId, {
      digest: { runIds: ['d-old'] },
      store: {},
    });
    const dump = join(dumps, '2026-10-10T12-00-00-000-ffffff-session');
    await writeStep(
      dump,
      '03',
      [withResult(older('', 'Do you know anyone here?', 'No', ['Yes', 'No']))],
      [teaching('dec-1', earlier.orchestrationRunId)],
    );

    const report = await teachAgain(deps, dumps, false);
    expect(report).toMatchObject({ stored: 2, retracted: 0 });
    expect(report.skipped).toEqual([
      expect.stringContaining(
        `left facts out of the store (unit-unnamed — ${note}); its earlier digests kept`,
      ),
    ]);
    expect(loop.retracted).toEqual([]);
    expect(taught.map((linked) => linked.decisionIds)).toEqual([['dec-1']]);
  });

  it('[BRW-17] teaches every recorded answer again in today’s shape, batched per session, links the rows and retracts each earlier digest once the new facts stand', async () => {
    const { loop, deps, taught, logged } = harness();
    // The earlier teachings as the loop still has them: one digested, one that never did.
    const earlier1 = loop.orchestrations.start('document-memory', { goal: 'earlier 1' });
    loop.orchestrations.complete(earlier1.orchestrationRunId, {
      digest: { runIds: ['d-old-1'] },
      store: {},
    });
    const earlier2 = loop.orchestrations.start('document-memory', { goal: 'earlier 2' });
    loop.orchestrations.complete(earlier2.orchestrationRunId, {
      digest: { runIds: [] },
      store: { status: 'skipped' },
    });

    const a = join(dumps, '2026-10-10T12-00-00-000-aaaaaa-session');
    const stepThree = [
      withResult(older('', 'Are you available for an Onsite job?', 'Yes', ['Yes', 'No'])),
      withResult(null, null),
      withResult(older('', null, 'Yes', ['Yes'])),
    ];
    const t1 = teaching('dec-1', earlier1.orchestrationRunId, 'Ada Lovelace');
    const t2 = teaching('dec-2', earlier2.orchestrationRunId);
    const t3 = teaching('dec-3', null);
    await writeStep(a, '03', stepThree, [t1, t2]);
    await writeStep(
      a,
      '05',
      [withResult(newer('Will you require sponsorship?', 'No', null))],
      [t1, t2, t3],
    );
    const b = join(dumps, '2026-10-11T09-00-00-000-bbbbbb-session');
    await writeStep(b, '02', [withResult(null, null)], []);
    const c = join(dumps, '2026-10-12T09-00-00-000-cccccc-session');
    const seventeen = Array.from({ length: 17 }, (_, i) => ({
      ...older(`Question ${i + 1}`, null, `Answer ${i + 1}`, null),
      sessionId: SESSION_C,
      field: { label: `Question ${i + 1}`, question: null, type: 'text', options: null },
    }));
    await writeStep(
      c,
      '04',
      seventeen.map((item) => withResult(item, null)),
      Array.from({ length: 16 }, (_, i) => teaching(`c-${i}`, null)),
    );

    const report = await teachAgain(deps, dumps, false);

    expect(report).toEqual({
      dryRun: false,
      sessions: 2,
      answers: 19,
      documents: 3,
      stored: 9,
      retracted: 1,
      unanswered: 1,
      untaught: 0,
      skipped: [
        '2026-10-12T09-00-00-000-cccccc-session: 17 answer(s) but 16 teaching(s) — taught without linking rows or retracting',
      ],
    });
    // Three new documents after the two earlier orchestrations; the first carries session A's two answers.
    const posted = loop.orchestrations.startRequests.slice(2);
    expect(posted).toHaveLength(3);
    expect(posted[0]?.orchestrator).toBe('document-memory');
    expect(posted[0]?.request).toMatchObject({
      maxIterations: TEACH_ITERATIONS,
      openedBy: { kind: 'browser-session', id: SESSION_A, label: 'taught again' },
    });
    const goal = posted[0]?.request.goal ?? '';
    expect(goal).toContain('Ada Lovelace');
    expect(goal).toContain('Asked "Are you available for an Onsite job?"');
    expect(goal).toContain('the subject answered "Yes"');
    expect(goal).toContain('Asked "Will you require sponsorship?"');
    expect(goal).not.toContain('Form field');
    // Session C's seventeen answers are two documents, about the configured subject; nothing links them.
    expect(posted[1]?.request.goal).toContain('the configured subject');
    expect(posted[1]?.request.goal).toContain('Question 16');
    expect(posted[2]?.request.goal).toContain('Question 17');
    expect(posted[2]?.request.goal).not.toContain('Question 16');
    // The rows of the two taught answers point at the new orchestration; the keyless one has no row to link.
    const newId = running(loop).length === 0 ? [...loop.orchestrations.records.keys()][2] : '';
    expect(taught).toEqual([{ decisionIds: ['dec-1', 'dec-3'], orchestrationRunId: newId }]);
    // Only the earlier digest that stored anything is retracted, after the new facts landed.
    expect(loop.retracted).toEqual(['d-old-1']);
    expect(logged).toHaveLength(3);
    expect(logged[0]).toContain('2 answer(s) taught again through');
  });

  it('[BRW-17] a dry run plans the documents and posts nothing', async () => {
    const { loop, deps, taught } = harness();
    const a = join(dumps, '2026-10-10T12-00-00-000-aaaaaa-session');
    await writeStep(
      a,
      '03',
      [withResult(older('', 'Are you available for an Onsite job?', 'Yes', ['Yes', 'No']))],
      [teaching('dec-1', 'orch-1')],
    );

    const report = await teachAgain(deps, dumps, true);

    expect(report).toEqual({
      dryRun: true,
      sessions: 1,
      answers: 1,
      documents: 1,
      stored: 0,
      retracted: 0,
      unanswered: 0,
      untaught: 0,
      skipped: [],
    });
    expect(loop.orchestrations.startRequests).toHaveLength(0);
    expect(loop.retracted).toEqual([]);
    expect(taught).toEqual([]);
  });

  it("[BRW-17] teaches under the subject given, else the configured one, and refuses the environment's placeholder by name", () => {
    expect(subjectFor('Ada', SESSION_ENV.subject.fallback)).toBe('Ada');
    expect(subjectFor(undefined, 'Alex Example')).toBe('Alex Example');
    expect(() => subjectFor(undefined, SESSION_ENV.subject.fallback)).toThrow(SessionRefused);
    expect(() => subjectFor(undefined, SESSION_ENV.subject.fallback)).toThrow(
      `${SESSION_FLAGS.subject.name} <name>, or ${SESSION_ENV.subject.name} in the environment`,
    );
  });
});
