import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { answersOf, readDump } from './recorded-answers';
import { newer, older, receipted, teaching, withResult, writeStep } from './recorded-dumps.testing';

describe('the operator answers a session dump recorded', () => {
  let dumps: string;
  beforeEach(async () => {
    dumps = await mkdtemp(join(tmpdir(), 'recorded-answers-'));
  });
  afterEach(async () => {
    await rm(dumps, { recursive: true, force: true });
  });

  it('[BRW-17] [BRW-20] reads an older item under its label and context and a newer one under its question, each on the channel its result or itself names, in the unit its dump records open; a keyless or channel-less item is nothing, and one of a shape this build cannot read is named', async () => {
    const dump = join(dumps, '2026-10-12T09-00-00-000-abc123-session');
    const { context: _context, ...withoutContext } = older('', 'Preferred name?', 'Alex', null);
    await writeStep(
      dump,
      '03',
      [
        withResult(older('', 'Are you available for an Onsite job?', 'Yes', ['Yes', 'No'])),
        withResult(older('Phone', 'Where can we reach you?', '555', null), null),
        // A pick from the drafts is the item's own say; a letter the page's options lettered is none.
        withResult(newer('Will you require sponsorship?', 'No', 'record')),
        withResult(older('Notes', null, 'typed', null), 'transfer'),
        // A field that asked nothing it can be told by: taught by nobody.
        withResult(older('', null, 'Yes', ['Yes'])),
        // An older item carries its channel only on its result; a newer one names its own.
        withResult(older('Phone', null, '555', null), null, 'terminal'),
        withResult(newer('Sponsorship?', 'No', null), null, 'terminal'),
        // One that names no channel anywhere is nobody's to teach — declared so, not unreadable.
        withResult(older('Phone', null, '555', null), null, null),
        withResult(newer('Sponsorship?', 'No', null, 'company=globex')),
        withResult(newer('Sponsorship?', 'No', null)),
        // A shape this build cannot read — the context missing — is named, and counts toward the order.
        withResult(withoutContext),
        withResult({ ...newer('Sponsorship?', 'No', null), answer: 'x'.repeat(2_001) }),
      ],
      [],
    );
    // The unit of work open at step 3: an older item is given in it, a newer one keeps its own.
    await writeFile(
      join(dump, '02-tasks.json'),
      JSON.stringify([
        { id: 'task-acme', facets: [{ name: 'company', value: 'Acme' }], startStep: 2, endStep: 4 },
      ]),
    );
    const record = await readDump(dump);
    const items = record.items;
    expect(items).toHaveLength(12);
    expect(items[0]).toMatchObject({
      field: {
        question: 'Are you available for an Onsite job?',
        type: 'radio',
        options: ['Yes', 'No'],
      },
      answer: 'Yes',
      chosen: null,
      via: 'chat',
      about: null,
      context: { unitKey: 'company=acme' },
    });
    expect(items[1]?.field.question).toBe('Phone. Where can we reach you?');
    expect(items[2]).toMatchObject({ chosen: 'record', about: 'subject' });
    expect(items[3]?.chosen).toBe('transfer');
    expect(items[4]).toBeNull();
    expect(items[5]?.via).toBe('terminal');
    expect(items[6]?.via).toBe('chat');
    expect(items[7]).toBeNull();
    expect(items[8]?.context.unitKey).toBe('company=globex');
    expect(items[9]?.context.unitKey).toBeNull();
    expect(items[10]).toBeNull();
    expect(items[11]).toBeNull();
    expect(record.unreadable).toEqual([
      expect.stringMatching(/^step 03: field 11 — context\.taskLabel .*; context\.page /),
      expect.stringMatching(/^step 03: field 12 — answer /),
    ]);
  });

  it('[BRW-17] gives an older answer the unit of work its dump records open at its step — by the identity declared, else the task’s own id — and none outside every unit', async () => {
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

    const record = await readDump(dump);
    expect(record.items.map((item) => item?.context.unitKey)).toEqual([
      'company=acme',
      null,
      'task-before-facets',
    ]);
  });

  it('[BRW-17] reads a teach file of either shape: the orchestration an older teaching names outright, a newer one’s reference only when its brain queued it there, and the subject off whichever names it', async () => {
    const today = join(dumps, '2026-10-21T10-00-00-000-fedcba-session');
    await writeStep(
      today,
      '03',
      [
        withResult(newer('Will you require sponsorship?', 'No', null)),
        withResult(newer('Would you relocate for this role?', 'Yes', null)),
      ],
      [
        receipted('dec-1', 'orch-7', 'queued'),
        // Written by the memory itself: digested nowhere, so there is nothing to retract.
        receipted('dec-2', 'rec-9@v2', 'inserted'),
      ],
    );
    await writeStep(
      today,
      '05',
      [withResult(older('', 'Are you available for an Onsite job?', 'Yes', ['Yes', 'No']))],
      [teaching('dec-3', 'orch-3')],
    );
    const record = await readDump(today);
    expect(record.subject).toBe('Ada Lovelace');
    const { answers, linked } = answersOf(record, []);
    expect(linked).toBe(true);
    expect(answers.map((answer) => [answer.decisionId, answer.earlierOrchestrationId])).toEqual([
      ['dec-1', 'orch-7'],
      ['dec-2', null],
      ['dec-3', 'orch-3'],
    ]);

    // Before receipts the subject rode on the document; a dump of that age still names whom.
    const before = join(dumps, '2026-10-10T12-00-00-000-aaaaaa-session');
    await writeStep(
      before,
      '03',
      [withResult(older('', 'Do you know anyone here?', 'No', ['Yes', 'No']))],
      [teaching('dec-1', 'orch-1', 'Grace Hopper')],
    );
    expect((await readDump(before)).subject).toBe('Grace Hopper');
  });

  it('[BRW-20] links answers to teachings only when the counts agree, and leaves an answer on an untaught channel out, counted', async () => {
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
        // A field that asked nothing it can be told by: taught by nobody, counted toward the order.
        withResult(older('', null, 'Yes', ['Yes'])),
      ],
      [teaching('dec-terminal', 'orch-1'), teaching('dec-chat', null)],
    );
    const record = await readDump(dump);
    // Three items — one keyless — against two teachings: nothing links.
    expect(record.items).toHaveLength(3);
    const unlinked = answersOf(record, ['terminal']);
    expect(unlinked).toMatchObject({ linked: false, untaught: 1 });
    expect(unlinked.answers).toEqual([
      expect.objectContaining({ decisionId: null, earlierOrchestrationId: null }),
    ]);
    expect(unlinked.answers[0]?.item.field.question).toBe('Will you require sponsorship?');
    // Every channel taught: the terminal's answer is an answer too, still unlinked.
    expect(answersOf(record, []).answers.map((answer) => answer.item.via)).toEqual([
      'terminal',
      'chat',
    ]);
  });
});
