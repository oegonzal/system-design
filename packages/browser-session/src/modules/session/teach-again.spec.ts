import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { DOCUMENT_DIGEST_ID, DOCUMENT_MEMORY_ORCHESTRATOR_ID } from '@sysdesign/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SESSION_ENV, SESSION_FLAGS } from '../../config';
import type { SessionStepRef } from '../../core/ports';
import { SessionRefused } from '../../core/unit-advice';
import {
  newer,
  older,
  receipted,
  SESSION_A,
  teaching,
  withResult,
  writeStep,
} from './recorded-dumps.testing';
import { subjectFor, teachAgain } from './teach-again';
import { harness, questions, running, tasksFile } from './teach-again.testing';

const SESSION_C = '33333333-3333-4333-8333-333333333333';
const FROM_STEP_ZERO: SessionStepRef = { sessionId: SESSION_A, step: 0 };

describe('teach-again over a folder of session dumps', () => {
  let dumps: string;
  beforeEach(async () => {
    dumps = await mkdtemp(join(tmpdir(), 'teach-again-'));
  });
  afterEach(async () => {
    await rm(dumps, { recursive: true, force: true });
  });

  it('[BRW-20] leaves an answer on a channel the settings keep untaught where it was: counted, untaught, its earlier digest kept, its row unlinked', async () => {
    const { loop, deps, taught, linked, logged } = harness();
    const earlier = loop.orchestrations.start(DOCUMENT_MEMORY_ORCHESTRATOR_ID, { goal: 'earlier' });
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
      outcomes: { queued: 1 },
      scopes: { declared: 1, fromDigest: 0, undeclared: 0 },
      untaught: 1,
      retracted: 0,
      unreadable: [],
    });
    expect(taught.map(questions)).toEqual([['Will you require sponsorship?']]);
    expect(loop.retracted).toEqual([]);
    expect(linked.map((link) => link.decisionIds)).toEqual([['dec-chat']]);
    expect(logged[0]).toContain('1 answer(s) taught again through');
  });

  it('[BRW-20] counts a dump whose every answer is on a channel the settings keep untaught as untaught, not as unanswered', async () => {
    const { deps, taught } = harness();
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
      outcomes: {},
    });
    expect(taught).toEqual([]);
  });

  it('[BRW-17] [QL-71] teaches one document per unit of work a dump’s answers were given in, and one for those given outside any, each linking its own answers’ rows', async () => {
    const { deps, taught, linked } = harness();
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

    const report = await teachAgain(deps, dumps, false);
    expect(report.documents).toBe(3);
    // Four answers declared their scope; the older one declares none and its earlier teaching digested nowhere.
    expect(report.scopes).toEqual({ declared: 4, fromDigest: 0, undeclared: 1 });
    expect(taught.map((call) => call.answers.map((answer) => answer.context.unitKey))).toEqual([
      ['company=acme', 'company=acme'],
      [null, null],
      ['company=globex'],
    ]);
    expect(questions(taught[0])).toEqual([
      'Do you know anyone at this organization?',
      'Would you relocate for this role?',
    ]);
    expect(questions(taught[1])).toEqual([
      'Will you require sponsorship?',
      'Are you available for an Onsite job?',
    ]);
    expect(questions(taught[2])).toEqual(['How did you hear of this opening?']);
    expect(linked.map((link) => link.decisionIds)).toEqual([
      ['d-1', 'd-5'],
      ['d-2', 'd-3'],
      ['d-4'],
    ]);
  });

  it('[BRW-17] keeps every earlier digest of a batch whose new digest left facts out of the store, its rows linked, and says why', async () => {
    const note = '1 withheld: bound to a unit of work, in a document that names none';
    const { loop, deps, linked } = harness({
      reason: 'unit-unnamed',
      note,
      counts: { memories: 3, kept: 2, 'unit-unnamed': 1 },
    });
    const earlier = loop.orchestrations.start(DOCUMENT_MEMORY_ORCHESTRATOR_ID, { goal: 'earlier' });
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
    expect(linked.map((link) => link.decisionIds)).toEqual([['dec-1']]);
  });

  it('[BRW-17] teaches every recorded answer again in today’s shape, batched per session, links the rows and retracts each earlier digest once the new facts stand', async () => {
    const { loop, deps, taught, linked, logged } = harness();
    // The earlier teachings as the loop still has them: one digested, one that never did.
    const earlier1 = loop.orchestrations.start(DOCUMENT_MEMORY_ORCHESTRATOR_ID, {
      goal: 'earlier 1',
    });
    loop.orchestrations.complete(earlier1.orchestrationRunId, {
      digest: { runIds: ['d-old-1'] },
      store: {},
    });
    const earlier2 = loop.orchestrations.start(DOCUMENT_MEMORY_ORCHESTRATOR_ID, {
      goal: 'earlier 2',
    });
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
      // One receipt per answer: the nineteen answers queued on three documents.
      outcomes: { queued: 19 },
      // The one newer answer declares its scope; the older ones declare none, and their digests the loop holds no run of.
      scopes: { declared: 1, fromDigest: 0, undeclared: 18 },
      stored: 9,
      retracted: 1,
      unanswered: 1,
      untaught: 0,
      unreadable: [],
      skipped: [
        '2026-10-12T09-00-00-000-cccccc-session: 17 answer(s) but 16 teaching(s) — taught without linking rows or retracting',
      ],
    });
    // Three teachings from step 0 of their sessions; the first carries session A's two answers under the subject its own teachings name.
    expect(taught).toHaveLength(3);
    expect(taught[0]).toMatchObject({ session: FROM_STEP_ZERO, subject: 'Ada Lovelace' });
    expect(questions(taught[0])).toEqual([
      'Are you available for an Onsite job?',
      'Will you require sponsorship?',
    ]);
    // Session C's seventeen answers are two teachings, about the configured subject; nothing links them.
    expect(taught[1]).toMatchObject({
      session: { sessionId: SESSION_C, step: 0 },
      subject: 'the configured subject',
    });
    expect(questions(taught[1])).toHaveLength(16);
    expect(questions(taught[1])).toContain('Question 16');
    expect(questions(taught[2])).toEqual(['Question 17']);
    // The rows of the two taught answers point at the new orchestration; the keyless one has no row to link.
    const newId = running(loop).length === 0 ? [...loop.orchestrations.records.keys()][2] : '';
    expect(linked).toEqual([{ decisionIds: ['dec-1', 'dec-3'], ref: newId }]);
    // Only the earlier digest that stored anything is retracted, after the new facts landed.
    expect(loop.retracted).toEqual(['d-old-1']);
    expect(logged).toHaveLength(3);
    expect(logged[0]).toContain('2 answer(s) taught again through');
  });

  it('[BRW-17] takes an older answer’s scope from the digest of its earlier teaching while the loop holds it — the scope the digest gave its question — and leaves one the digest did not keep undeclared', async () => {
    const { loop, deps, taught } = harness();
    // The earlier teaching's digest run, as the loop still holds it: the question kept as the subject's.
    const digestRun = loop.startRun({ pipeline: DOCUMENT_DIGEST_ID, goal: 'the earlier document' });
    loop.complete(digestRun.runId, [
      {
        overall: 90,
        decision: 'accept',
        artifact: {
          summary: 'Two answers of the subject.',
          memories: [
            {
              kind: 'profile_fact',
              scope: 'subject',
              evidence: ['section.1'],
              insight: 'Ada is authorised to work in the country.',
              appliesWhen: 'Are you authorised to work in this country?',
            },
          ],
          unused: ['section.2'],
        },
      },
    ]);
    const earlier = loop.orchestrations.start(DOCUMENT_MEMORY_ORCHESTRATOR_ID, { goal: 'earlier' });
    loop.orchestrations.complete(earlier.orchestrationRunId, {
      digest: { runIds: [digestRun.runId], counts: { memories: 1, kept: 1 } },
      store: {},
    });
    const dump = join(dumps, '2026-10-12T09-00-00-000-eeeeee-session');
    await writeStep(
      dump,
      '03',
      [
        withResult(older('', 'Are you authorised to work in this country?', 'Yes', ['Yes', 'No'])),
        withResult(older('', 'Do you know anyone here?', 'No', ['Yes', 'No'])),
      ],
      [
        teaching('dec-1', earlier.orchestrationRunId),
        teaching('dec-2', earlier.orchestrationRunId),
      ],
    );
    await tasksFile(dump, 2, 4);

    const report = await teachAgain(deps, dumps, false);
    expect(report.scopes).toEqual({ declared: 0, fromDigest: 1, undeclared: 1 });
    // Both were given in the unit the dump records open; the first is taught as the subject's all the same, as its digest scoped it.
    expect(taught[0]?.answers.map((answer) => [answer.context.unitKey, answer.about])).toEqual([
      ['company=acme', 'subject'],
      ['company=acme', null],
    ]);
    // A dry run reads no digest: every undeclared scope stays undeclared.
    expect((await teachAgain(deps, dumps, true)).scopes).toEqual({
      declared: 0,
      fromDigest: 0,
      undeclared: 2,
    });
  });

  it('[BRW-17] [BRW-23] takes the receipts a memory-backed brain answers, one per answer: outcomes counted per answer, each written answer linked to its own record and no other, a refusal named with its question, and nothing awaited on the loop', async () => {
    const { loop, deps, taught, linked, logged } = harness({}, [
      { ref: 'rec-1', outcome: 'inserted', fault: null },
      { ref: 'rec-2', outcome: 'unchanged', fault: null },
      { ref: null, outcome: 'refused', fault: 'the value is past the ceiling' },
      { ref: 'rec-4', outcome: 'superseded', fault: null },
    ]);
    const dump = join(dumps, '2026-10-21T09-00-00-000-abcdef-session');
    await writeStep(
      dump,
      '02',
      [
        withResult(newer('Do you know anyone at this organization?', 'No', null, 'company=acme')),
        withResult(newer('Would you relocate for this role?', 'Yes', null, 'company=acme')),
        withResult(newer('Tell us about yourself', 'a'.repeat(1_200), null, 'company=acme')),
        withResult(newer('Will you require sponsorship?', 'No', null, 'company=acme')),
      ],
      ['d-1', 'd-2', 'd-3', 'd-4'].map((id) => receipted(id, null, null)),
    );

    const report = await teachAgain(deps, dumps, false);
    expect(report).toMatchObject({
      answers: 4,
      documents: 1,
      outcomes: { inserted: 1, unchanged: 1, refused: 1, superseded: 1 },
      stored: 0,
      retracted: 0,
    });
    expect(report.skipped).toEqual([
      expect.stringContaining(
        '"Tell us about yourself" refused by the memory — the value is past the ceiling',
      ),
    ]);
    // One batch of four, and each row linked to the one record its own answer went to: never a reference naming another's.
    expect(taught).toHaveLength(1);
    expect(linked).toEqual([
      { decisionIds: ['d-1'], ref: 'rec-1' },
      { decisionIds: ['d-2'], ref: 'rec-2' },
      { decisionIds: ['d-4'], ref: 'rec-4' },
    ]);
    expect(linked.every((link) => !link.ref.includes(','))).toBe(true);
    expect(taught.map((call) => call.session)).toEqual([FROM_STEP_ZERO]);
    expect(loop.orchestrations.startRequests).toEqual([]);
    expect(logged).toEqual([
      expect.stringContaining(
        '3 answer(s) taught again — inserted rec-1, unchanged rec-2, superseded rec-4',
      ),
    ]);
  });

  it('[BRW-17] a dry run plans the documents and teaches nothing', async () => {
    const { loop, deps, taught, linked } = harness();
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
      outcomes: {},
      scopes: { declared: 0, fromDigest: 0, undeclared: 1 },
      stored: 0,
      retracted: 0,
      unanswered: 0,
      untaught: 0,
      unreadable: [],
      skipped: [],
    });
    expect(taught).toEqual([]);
    expect(loop.retracted).toEqual([]);
    expect(linked).toEqual([]);
  });

  it('[BRW-17] names each recorded item it could not read, by dump, step and field, and teaches the rest', async () => {
    const { deps, taught } = harness();
    const dump = join(dumps, '2026-10-22T09-00-00-000-bad0bad-session');
    const { context: _context, ...withoutContext } = older('', 'Preferred name?', 'Alex', null);
    await writeStep(
      dump,
      '04',
      [withResult(withoutContext), withResult(newer('Will you require sponsorship?', 'No', null))],
      [teaching('dec-1', null), teaching('dec-2', null)],
    );
    const report = await teachAgain(deps, dumps, false);
    expect(report.unreadable).toEqual([
      expect.stringMatching(
        /^2026-10-22T09-00-00-000-bad0bad-session: step 04: field 1 — context\.taskLabel .*; context\.page /,
      ),
    ]);
    expect(report).toMatchObject({ answers: 1, documents: 1, outcomes: { queued: 1 } });
    expect(taught.map(questions)).toEqual([['Will you require sponsorship?']]);
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
