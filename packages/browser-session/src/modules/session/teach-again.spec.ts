import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { OrchestrationRunDto } from '@sysdesign/contracts';
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

/** An item as a session writes it today. */
const newer = (question: string, answer: string, chosen: string | null) => ({
  sessionId: SESSION_A,
  capturedAt: AT,
  field: { question, type: 'radio', options: ['Yes', 'No'] },
  context: CONTEXT,
  answer,
  chosen,
});

const withResult = (guidance: unknown, chosen: string | null = 'option') => ({
  result: { guidance, chosen },
});

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

/** The fake loop whose every awaited orchestration settles stored on the first poll's sleep, plus the deps over it. */
function harness() {
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
          digest: { runIds: [`d-new-${digests}`], counts: { memories: 3, kept: 3 } },
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

  it('[BRW-17] reads an older item under its label and context and a newer one under its question; a keyless item is nothing', () => {
    const old = guidanceItemOf(
      older('', 'Are you available for an Onsite job?', 'Yes', ['Yes', 'No']),
      'option',
    );
    expect(old).toMatchObject({
      field: {
        question: 'Are you available for an Onsite job?',
        type: 'radio',
        options: ['Yes', 'No'],
      },
      answer: 'Yes',
      chosen: null,
    });
    expect(
      guidanceItemOf(older('Phone', 'Where can we reach you?', '555', null), null)?.field.question,
    ).toBe('Phone. Where can we reach you?');
    // A pick from the drafts is the item's own say; a letter the page's options lettered is none.
    expect(
      guidanceItemOf(newer('Will you require sponsorship?', 'No', 'record'), 'option')?.chosen,
    ).toBe('record');
    expect(guidanceItemOf(older('Notes', null, 'typed', null), 'transfer')?.chosen).toBe(
      'transfer',
    );
    expect(guidanceItemOf(older('', null, 'Yes', ['Yes']), 'option')).toBeNull();
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
