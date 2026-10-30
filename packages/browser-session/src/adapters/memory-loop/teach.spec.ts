import { MemoryHostRefused } from '@sysdesign/agentic-memory-client';
import type { OperatorGuidanceDto } from '@sysdesign/contracts';

import type { TeachReceipt } from '../../core/ports';
import { predicateOf } from './teach';
import {
  AT,
  brainUnderTest,
  guidance,
  PROJECT,
  SESSION,
  SUBJECT,
  TENANT,
  unitValue,
  type BrainHarness,
} from './testing';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const OF_SUBJECT = { tenant: TENANT, project: PROJECT };

/** The row a teaching left, by the reference its receipt carries. */
const rowOf = (h: BrainHarness, ref: string | null) => {
  const row = h.rows().find((candidate) => candidate.id === ref);
  if (row === undefined) throw new Error(`no record ${ref}`);
  return row;
};

/** One answer taught, and its one receipt. */
async function teachOne(h: BrainHarness, answer: OperatorGuidanceDto): Promise<TeachReceipt> {
  const receipts = await h.brain.teach([answer], SESSION, SUBJECT);
  expect(receipts).toHaveLength(1);
  const [receipt] = receipts;
  if (receipt === undefined) throw new Error('one answer is one receipt');
  return receipt;
}

describe('teaching an answer to the space', () => {
  it('[BRW-23] writes one deterministic fact with its provenance and metadata — inserted, the same answer unchanged, a new one superseding it with the history kept — that the question recalls', async () => {
    const h = await brainUnderTest(() => undefined);
    const question = 'Are you authorized to work in this country';
    const asked = guidance({ question, answer: 'Yes', options: ['Yes', 'No'], via: 'chat' });

    const first = await teachOne(h, asked);
    expect(first).toEqual({ ref: expect.stringMatching(UUID), outcome: 'inserted', fault: null });
    expect(predicateOf(question)).toMatch(/^asked\.[0-9a-f]{64}$/);
    const value = `Asked "${question}", offering Yes | No, ${SUBJECT} answered "Yes".`;
    const row = rowOf(h, first.ref);
    expect(row).toMatchObject({
      register: 'standing_answer',
      kind: 'semantic',
      scope: OF_SUBJECT,
      body: { subject: SUBJECT, predicate: predicateOf(question), value, validFrom: AT },
      text: `${SUBJECT} — ${predicateOf(question)}: ${value}`,
      metadata: { question, channel: 'chat' },
      provenance: { source: 'operator:chat', sourceRunId: SESSION.sessionId, derivedFrom: [] },
      version: 1,
      status: 'active',
    });
    expect(row.validFrom.toISOString()).toBe(AT);
    expect(h.spy.writes).toHaveLength(1);

    expect(await h.brain.teach([asked], SESSION, SUBJECT)).toEqual([
      { ref: first.ref, outcome: 'unchanged', fault: null },
    ]);

    const changed = await teachOne(
      h,
      guidance({ question, answer: 'No', options: ['Yes', 'No'], via: 'chat' }),
    );
    expect(changed).toMatchObject({ outcome: 'superseded', fault: null });
    expect(changed.ref).not.toBe(first.ref);
    const lineage = await h.client.history(h.bound.spaceId, {
      recordId: first.ref ?? '',
      scope: OF_SUBJECT,
    });
    expect(lineage.map(({ id, version, status }) => [id, version, status])).toEqual([
      [first.ref, 1, 'superseded'],
      [changed.ref, 2, 'active'],
    ]);
    const recalled = await h.client.recall(h.bound.spaceId, {
      scope: OF_SUBJECT,
      registers: ['standing_answer'],
      text: question,
    });
    expect(recalled.items.map(({ record }) => record.id)).toEqual([changed.ref]);
  });

  it('[BRW-23] keeps the scope the answerer declared — the unit of work hashed, the subject, the open unit when none was declared — and teaches nobody an answer about a unit none was open for', async () => {
    const h = await brainUnderTest(() => undefined);
    const ofUnit = await teachOne(
      h,
      guidance({
        question: 'Have you worked here before',
        answer: 'No',
        about: 'unit',
        unitKey: 'u-1',
      }),
    );
    expect(rowOf(h, ofUnit.ref).scope).toEqual({ ...OF_SUBJECT, unit: unitValue('u-1') });

    const ofSubject = await teachOne(
      h,
      guidance({
        question: 'Years of experience with Python',
        answer: '6',
        about: 'subject',
        unitKey: 'u-1',
      }),
    );
    expect(rowOf(h, ofSubject.ref).scope).toEqual(OF_SUBJECT);

    const undeclaredOpen = await teachOne(
      h,
      guidance({
        question: 'How did you hear of this opening',
        answer: 'A friend',
        about: null,
        unitKey: 'u-1',
      }),
    );
    expect(rowOf(h, undeclaredOpen.ref).scope).toEqual({ ...OF_SUBJECT, unit: unitValue('u-1') });

    const undeclaredClosed = await teachOne(
      h,
      guidance({ question: 'Preferred name', answer: 'Alex', about: null, unitKey: null }),
    );
    expect(rowOf(h, undeclaredClosed.ref).scope).toEqual(OF_SUBJECT);

    const before = h.rows().length;
    expect(
      await teachOne(
        h,
        guidance({
          question: 'Do you know anyone here',
          answer: 'No',
          about: 'unit',
          unitKey: null,
        }),
      ),
    ).toEqual({
      ref: null,
      outcome: 'refused',
      fault: 'the answer is declared about the unit of work, and none was open when it was given',
    });
    expect(h.rows()).toHaveLength(before);
  });

  it("[BRW-23] refuses rather than cuts a fact past the register's ceiling, bounds the metadata it fills while the fact keeps the whole question, reports a refusing host in its words, sends a write that lost its race once more, and answers several answers with a receipt each, in their order", async () => {
    const h = await brainUnderTest(() => undefined);
    const long = guidance({
      question: 'Tell us about yourself',
      answer: 'a'.repeat(1_200),
      options: null,
    });
    const before = h.rows().length;
    const refused = await teachOne(h, long);
    expect(refused).toMatchObject({ ref: null, outcome: 'refused' });
    expect(refused.fault).toMatch(/not written: value /);
    expect(h.rows()).toHaveLength(before);
    expect(h.spy.writes).toHaveLength(0);

    const question = `Which of these statements ${'x'.repeat(300)} apply to you`;
    const whole = await teachOne(h, guidance({ question, answer: 'None', options: null }));
    const row = rowOf(h, whole.ref);
    expect(row.metadata['question']).toHaveLength(200);
    expect(row.metadata['question']?.endsWith('…')).toBe(true);
    expect(row.body['value']).toContain(question);

    // Three answers, three receipts: the refused one its own, each written one its own record — never one reference naming another's.
    const batch = await h.brain.teach(
      [
        guidance({ question: 'Willing to relocate', answer: 'Yes' }),
        long,
        guidance({ question: 'Notice period', answer: 'Two weeks', options: null }),
      ],
      SESSION,
      SUBJECT,
    );
    expect(batch).toEqual([
      { ref: expect.stringMatching(UUID), outcome: 'inserted', fault: null },
      { ref: null, outcome: 'refused', fault: expect.stringMatching(/not written: value /) },
      { ref: expect.stringMatching(UUID), outcome: 'inserted', fault: null },
    ]);
    expect(batch[0]?.ref).not.toBe(batch[2]?.ref);
    expect(rowOf(h, batch[2]?.ref ?? null).body['value']).toContain('Notice period');

    h.spy.failNext = new MemoryHostRefused({
      status: 409,
      route: 'POST /spaces/:id/remember',
      code: 'conflict',
      message: 'another write to register standing_answer landed first; send it again',
    });
    const written = h.spy.writes.length;
    expect(
      await teachOne(h, guidance({ question: 'Start date', answer: 'June', options: null })),
    ).toMatchObject({ outcome: 'inserted', fault: null });
    expect(h.spy.writes).toHaveLength(written + 2);

    h.spy.failing = new MemoryHostRefused({
      status: 422,
      route: 'POST /spaces/:id/remember',
      code: 'register.unknown',
      message: 'the space keeps no register named standing_answer',
    });
    expect(await teachOne(h, guidance({}))).toEqual({
      ref: null,
      outcome: 'refused',
      fault: 'the space keeps no register named standing_answer',
    });
  });

  it("[BRW-22] a host that answers a write with a server error is failing, not refusing the fact: the brain's fault, never a refusal recorded against the answer", async () => {
    const h = await brainUnderTest(() => undefined);
    h.spy.failing = new MemoryHostRefused({
      status: 503,
      route: 'POST /spaces/:id/remember',
      code: null,
      message: 'upstream unavailable',
    });
    await expect(h.brain.teach([guidance({})], SESSION, SUBJECT)).rejects.toMatchObject({
      reason: 'failed',
      message: 'brain failed: upstream unavailable',
    });
    expect(h.rows().filter((row) => row.register === 'standing_answer')).toHaveLength(0);
  });
});
