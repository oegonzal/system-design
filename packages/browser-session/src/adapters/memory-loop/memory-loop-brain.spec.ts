import {
  MemoryHostRefused,
  MemoryHostTimeout,
  MemoryHostUnreachable,
} from '@sysdesign/agentic-memory-client';
import { memoryClientUnderTest } from '@sysdesign/agentic-memory-client/testing';
import {
  ANSWER_SUGGESTIONS_PIPELINE_ID,
  bestIterationOf,
  FIELD_ANSWER_PIPELINE_ID,
  FIELD_EVIDENCE_HEADING,
  FORM_GOAL_TERMS,
  kindsLegend,
  readEvidenceItems,
  readFieldIndex,
  textBytes,
} from '@sysdesign/contracts';
import { FakeLoop, FakeLoopClient } from '@sysdesign/studio-testing';

import { withheldBy } from '../../core/testing';
import { MemoryLoopBrain } from './memory-loop-brain';
import {
  ANSWERS,
  ASSISTANT_RUN,
  assistantStrategy,
  BRAIN_SETTINGS,
  brainUnderTest,
  completeRuns,
  CRITERIA,
  field,
  fieldsInput,
  guidance,
  PROJECT,
  SESSION,
  SPACE_NAME,
  spiedClient,
  SUBJECT,
  TENANT,
  unitValue,
} from './testing';

/** A fact of the subject, as an ingest would have written it. */
const PYTHON_FACT = {
  register: 'profile_fact',
  scope: { tenant: TENANT, project: PROJECT },
  candidate: {
    subject: SUBJECT,
    predicate: 'python_years',
    value: '6 years of Python',
    validFrom: null,
  },
  provenance: { source: 'memory-ingest:profile', sourceRunId: null },
};

const PYTHON = field('e1', 'Years of experience with Python');
const WORKED = field('e2', 'Have you worked here before', {
  role: 'radiogroup',
  options: ['Yes', 'No'],
});
/** The same question twice on one page: one request. */
const PYTHON_AGAIN = field('e3', 'Years of experience with Python');
/** More distinct questions than the recall's concurrency: what a host that is down is asked. */
const MANY = Array.from({ length: BRAIN_SETTINGS.recall.concurrency + 2 }, (_, index) =>
  field(`e${index + 1}`, `Question ${index + 1} of the page`),
);

/** The runtime's test policy under the four keys the binding names, recalling deeper than any field draws. */
const DEEP_POLICY = {
  scopeKeys: ['tenant', 'project', 'user', 'unit'],
  terms: { short_term: { ttlSeconds: 600 }, long_term: { ttlSeconds: null } },
  recall: {
    maxItems: 12,
    maxChars: 20_000,
    weights: { similarity: 0.5, exact: 0.3, recency: 0.1, support: 0.1 },
    recencyHalfLifeDays: 30,
  },
  consolidation: { minSupport: 2, promoteAt: 3 },
};

describe('the memory-loop brain', () => {
  it('[BRW-21] lists a record whose source is named with spaces under that source as one token, so the goal composes and the line reads back whole', async () => {
    const h = await brainUnderTest(completeRuns(ANSWERS));
    const titled = 'document-digest:Operator guidance — session f5b86b33';
    const fact = await h.client.remember(h.bound.spaceId, {
      ...PYTHON_FACT,
      provenance: { source: titled, sourceRunId: null },
    });
    await h.brain.answerFields(fieldsInput([PYTHON], null));
    const items = readEvidenceItems(h.loop.startRequests[0]?.goal ?? '');
    expect(items.map(({ source }) => source)).toEqual([
      {
        origin: 'document-digest:Operator%20guidance%20—%20session%20f5b86b33',
        ref: `${fact.record.id}@v1`,
      },
    ]);
    expect(decodeURIComponent(items[0]?.source.origin ?? '')).toBe(titled);
  });

  it('[BRW-21] recalls once per distinct question — by text, under the open unit of work hashed — deals the hits into the goal under the legend with kind, scope and source, keeps the recall for the step, and reads the admission off the readout', async () => {
    const h = await brainUnderTest(completeRuns(ANSWERS));
    const fact = await h.client.remember(h.bound.spaceId, PYTHON_FACT);
    const [taught] = await h.brain.teach(
      [guidance({ question: WORKED.name, answer: 'No', about: 'unit', unitKey: 'u-1' })],
      SESSION,
      SUBJECT,
    );
    if (taught === undefined) throw new Error('one answer is one receipt');
    expect(taught).toMatchObject({ outcome: 'inserted', fault: null });

    const decided = await h.brain.answerFields(fieldsInput([PYTHON, WORKED, PYTHON_AGAIN], 'u-1'));
    expect(h.spy.recalls).toEqual([
      {
        scope: { tenant: TENANT, project: PROJECT, unit: unitValue('u-1') },
        text: PYTHON.name,
        registers: ['profile_fact', 'profile_story', 'claim_boundary', 'standing_answer'],
      },
      {
        scope: { tenant: TENANT, project: PROJECT, unit: unitValue('u-1') },
        text: WORKED.name,
        registers: ['profile_fact', 'profile_story', 'claim_boundary', 'standing_answer'],
      },
    ]);
    const started = h.loop.startRequests[0];
    expect(started).toMatchObject({
      pipeline: FIELD_ANSWER_PIPELINE_ID,
      criteria: CRITERIA,
      maxIterations: 1,
      openedBy: { kind: 'browser-session', id: SESSION.sessionId, label: 'step 6 · form page' },
    });
    const goal = started?.goal ?? '';
    expect(readFieldIndex(goal)?.unitKey).toBe('u-1');
    expect(goal).toContain(FIELD_EVIDENCE_HEADING);
    expect(goal).toContain(kindsLegend(BRAIN_SETTINGS.legend));
    const items = readEvidenceItems(goal);
    expect(items.map(({ alias }) => alias)).toEqual(['m1', 'm2']);
    expect(items).toEqual(
      expect.arrayContaining([
        {
          alias: expect.any(String),
          kind: 'profile_fact',
          scope: 'subject',
          text: `${SUBJECT} — python_years: 6 years of Python`,
          // Dated at the moment of recording: the runtime's one instant under test.
          when: '2026-10-01',
          source: { origin: 'memory-ingest:profile', ref: `${fact.record.id}@v1` },
        },
        {
          alias: expect.any(String),
          kind: 'standing_answer',
          scope: 'unit',
          text: expect.stringContaining(`${SUBJECT} answered "No"`),
          when: '2026-10-10',
          source: { origin: 'operator:terminal', ref: `${taught.ref}@v1` },
        },
      ]),
    );
    expect(decided).toMatchObject({
      runId: 'fake-run-1',
      orchestrationRunId: null,
      admission: 'admitted',
      withheld: [],
      recall: { requests: 2, evidence: 2, fault: null, skipped: [] },
    });
    expect(decided.recall?.latencyMs).toBeGreaterThanOrEqual(0);
    expect(decided.composition).toEqual({
      rung: 'full',
      bytes: textBytes(goal),
      snapshotRung: null,
    });
    expect(bestIterationOf(decided.run)?.artifact).toEqual(ANSWERS);

    // The suggestions for the same page draw on the same recall: no new request, the same items.
    await h.brain.suggestAnswers(fieldsInput([WORKED], 'u-1'));
    expect(h.spy.recalls).toHaveLength(2);
    const suggested = h.loop.startRequests[1];
    expect(suggested).toMatchObject({
      pipeline: ANSWER_SUGGESTIONS_PIPELINE_ID,
      openedBy: { label: 'step 6 · suggested answers' },
    });
    expect(readEvidenceItems(suggested?.goal ?? '').map(({ source }) => source.ref)).toEqual(
      items.map(({ source }) => source.ref),
    );

    // Another step, outside any unit: the unit's answer is nobody's evidence; under another unit, neither.
    await h.brain.answerFields(fieldsInput([PYTHON, WORKED], null, 7));
    expect(h.spy.recalls[2]?.scope).toEqual({ tenant: TENANT, project: PROJECT });
    expect(readEvidenceItems(h.loop.startRequests[2]?.goal ?? '').map(({ kind }) => kind)).toEqual([
      'profile_fact',
    ]);
    await h.brain.answerFields(fieldsInput([PYTHON, WORKED], 'u-2', 8));
    expect(h.spy.recalls[4]?.scope).toEqual({
      tenant: TENANT,
      project: PROJECT,
      unit: unitValue('u-2'),
    });
    expect(readEvidenceItems(h.loop.startRequests[3]?.goal ?? '').map(({ kind }) => kind)).toEqual([
      'profile_fact',
    ]);
    expect(h.warnings).toEqual([]);
  });

  it("[BRW-21] takes each question's hits as the declared table gives the kind of control asking, and deals them by rank under the declared cap, one slot per record", async () => {
    const python = 'Tell us about your experience with Python';
    const postgres = 'Tell us about your experience with Postgres';
    const facts = (stem: string) =>
      Array.from({ length: 6 }, (_, index) => ({
        predicate: `${stem}_${index + 1}`,
        value: `${stem} fact ${index + 1}`,
      }));
    const textOf = (fact: { predicate: string; value: string }) =>
      `${SUBJECT} — ${fact.predicate}: ${fact.value}`;
    // Each question and every fact that answers it share one vector, so the semantic route ranks them all.
    const table: Record<string, readonly number[]> = {
      [python]: [1, 0, 0, 0],
      [postgres]: [0, 1, 0, 0],
      ...Object.fromEntries(facts('python').map((fact) => [textOf(fact), [1, 0, 0, 0]])),
      ...Object.fromEntries(facts('postgres').map((fact) => [textOf(fact), [0, 1, 0, 0]])),
    };
    const embedder = {
      model: 'spec-embedder',
      dimensions: 4,
      embed: (inputs: readonly string[]) =>
        Promise.resolve(inputs.map((text) => [...(table[text] ?? [0, 0, 0, 1])])),
    };
    const h = await brainUnderTest(completeRuns(ANSWERS), {
      embedder,
      policy: DEEP_POLICY,
      settings: {
        ...BRAIN_SETTINGS,
        recall: { ...BRAIN_SETTINGS.recall, maxEvidence: 7 },
      },
    });
    const seed = async (stem: string) => {
      for (const fact of facts(stem)) {
        await h.client.remember(h.bound.spaceId, {
          ...PYTHON_FACT,
          candidate: { ...PYTHON_FACT.candidate, ...fact },
        });
      }
    };
    const box = (ref: string, question: string) => field(ref, question);
    const area = (ref: string, question: string) => field(ref, question, { inputType: 'textarea' });

    // Six facts in the space: a textbox takes as many as the table gives it, a textarea every one, up to ten.
    await seed('python');
    const asBox = await h.brain.answerFields(fieldsInput([box('e1', python)], null, 20));
    expect(asBox.recall).toMatchObject({
      requests: 1,
      evidence: BRAIN_SETTINGS.recall.hitsPerFieldType.text,
    });
    const asArea = await h.brain.answerFields(fieldsInput([area('e1', python)], null, 21));
    expect(asArea.recall).toMatchObject({ requests: 1, evidence: 6 });
    expect(asBox.recall?.evidence ?? 0).toBeLessThan(asArea.recall?.evidence ?? 0);

    // Two textareas, six facts answering each: the cap of seven, dealt by rank — every field's best before any field's second — one slot per record.
    await seed('postgres');
    const capped = await h.brain.answerFields(
      fieldsInput([area('e1', python), area('e2', postgres)], null, 22),
    );
    expect(capped.recall).toMatchObject({ requests: 2, evidence: 7 });
    const listed = readEvidenceItems(h.loop.startRequests[2]?.goal ?? '');
    expect(listed).toHaveLength(7);
    expect(new Set(listed.map(({ source }) => source.ref)).size).toBe(7);
    const stems = listed.map(({ text }) => (text.includes('python_') ? 'python' : 'postgres'));
    expect(stems.slice(0, 6)).toEqual([
      'python',
      'postgres',
      'python',
      'postgres',
      'python',
      'postgres',
    ]);
  });

  it("[BRW-21] reads what is withheld and a fall-short off the run's own readout, admits nothing when the loop answered none, and faults on a run that failed", async () => {
    const withheld = [withheldBy('e1', 'grounding', 'rests on nothing listed')];
    const fellShort = await brainUnderTest((loop) => {
      for (const run of loop.runs.values()) {
        if (run.status !== 'running') continue;
        loop.complete(run.runId, [{ overall: 40, decision: 'revise', artifact: ANSWERS }], {
          readout: { withheld },
        });
      }
    });
    expect(await fellShort.brain.answerFields(fieldsInput([PYTHON], null))).toMatchObject({
      admission: 'fell-short',
      withheld,
    });

    const unread = await brainUnderTest((loop) => {
      for (const run of loop.runs.values()) {
        if (run.status === 'running') loop.complete(run.runId, []);
      }
    });
    expect(await unread.brain.answerFields(fieldsInput([PYTHON], null))).toMatchObject({
      admission: 'fell-short',
      withheld: [],
    });

    const failed = await brainUnderTest((loop) => {
      for (const run of loop.runs.values()) {
        if (run.status === 'running') loop.fail(run.runId, 'the model refused');
      }
    });
    await expect(failed.brain.answerFields(fieldsInput([PYTHON], null))).rejects.toMatchObject({
      reason: 'failed',
      message: 'brain failed: the model refused',
    });
  });

  it("[BRW-22] a host that does not answer never faults the page: the goal carries no evidence, the outage is said once and recorded, the host is probed once a step until it answers again; a refusal is the brain's fault", async () => {
    const h = await brainUnderTest(completeRuns(ANSWERS));
    await h.client.remember(h.bound.spaceId, PYTHON_FACT);

    h.spy.failing = new MemoryHostUnreachable('ECONNREFUSED');
    const silent = await h.brain.answerFields(fieldsInput(MANY, 'u-1', 7));
    expect(silent.recall).toEqual({
      requests: 0,
      evidence: 0,
      latencyMs: expect.any(Number),
      fault: 'the memory host is unreachable: ECONNREFUSED',
      skipped: [],
    });
    expect(silent.admission).toBe('admitted');
    const goal = h.loop.startRequests[0]?.goal ?? '';
    expect(goal).toContain(FORM_GOAL_TERMS[FIELD_ANSWER_PIPELINE_ID].noEvidence);
    expect(readEvidenceItems(goal)).toEqual([]);
    expect(h.warnings).toEqual([
      expect.stringMatching(/^step 7: the memory host did not answer .* ECONNREFUSED$/),
    ]);
    // The questions in flight together faulted together, and nothing was asked after them: one round, not one call per question.
    expect(h.spy.recalls).toHaveLength(BRAIN_SETTINGS.recall.concurrency);

    // The next step, still down: one probe, no recall, nothing more said.
    const { reads } = h.spy;
    const stillSilent = await h.brain.answerFields(fieldsInput([PYTHON, WORKED], 'u-1', 8));
    expect(stillSilent.recall?.fault).toBe('the memory host is unreachable: ECONNREFUSED');
    expect(h.spy.reads).toBe(reads + 1);
    expect(h.spy.recalls).toHaveLength(BRAIN_SETTINGS.recall.concurrency);
    expect(h.warnings).toHaveLength(1);

    // The host back: the step's probe answers, the recall resumes, and that is said once.
    h.spy.failing = null;
    const back = await h.brain.answerFields(fieldsInput([PYTHON], 'u-1', 9));
    expect(back.recall).toMatchObject({ requests: 1, evidence: 1, fault: null });
    expect(h.warnings[1]).toBe('step 9: the memory host answers again');
    expect(h.warnings).toHaveLength(2);
    expect(readEvidenceItems(h.loop.startRequests[2]?.goal ?? '')).toHaveLength(1);

    // A host that refuses is the brain's fault, in the host's words.
    h.spy.failing = new MemoryHostRefused({
      status: 422,
      route: 'POST /spaces/:id/recall',
      code: 'scope.invalid',
      message: 'the scope names undeclared keys: unit',
    });
    await expect(h.brain.answerFields(fieldsInput([PYTHON], 'u-1', 10))).rejects.toMatchObject({
      reason: 'failed',
      message: 'brain failed: the scope names undeclared keys: unit',
    });

    // Teaching while the host is silent is the brain's fault too — never a receipt that says the fact stands.
    h.spy.failing = new MemoryHostTimeout('POST /spaces/:id/remember', 15_000);
    await expect(
      h.brain.teach([guidance({})], { sessionId: SESSION.sessionId, step: 11 }, SUBJECT),
    ).rejects.toMatchObject({ reason: 'unreachable' });
  });

  it("[BRW-22] [BRW-24] bound by nobody at boot — the host silent when the run told the brain to bind — the session runs with no evidence, said once, until a step's probe binds the space", async () => {
    const { client: inner } = memoryClientUnderTest({
      strategies: { [ASSISTANT_RUN]: assistantStrategy() },
    });
    const { client, spy } = spiedClient(inner);
    const warnings: string[] = [];
    const loop = new FakeLoop({ now: () => new Date().toISOString() });
    const brain = new MemoryLoopBrain(new FakeLoopClient(loop), client, BRAIN_SETTINGS, TENANT, {
      pollEveryMs: 0,
      sleep: async () => completeRuns(ANSWERS)(loop),
      warn: (text) => warnings.push(text),
    });
    // Composed, the brain asks the host nothing; told to bind with the host down, it says so once and runs degraded.
    expect(spy.reads).toBe(0);
    spy.failing = new MemoryHostUnreachable('ECONNREFUSED');
    await brain.bind();
    expect(warnings).toEqual([expect.stringMatching(/^the memory host did not answer at boot/)]);

    const degraded = await brain.answerFields(fieldsInput([PYTHON], null, 1));
    expect(degraded.recall?.fault).toBe('the memory host is unreachable: ECONNREFUSED');
    expect(degraded.admission).toBe('admitted');
    // Boot said it once; the step does not say it again.
    expect(warnings).toHaveLength(1);
    expect(await client.getSpaceByName(SPACE_NAME).catch(() => 'down')).toBe('down');

    spy.failing = null;
    const bound = await brain.answerFields(fieldsInput([PYTHON], null, 2));
    expect(bound.recall).toMatchObject({ requests: 1, evidence: 0, fault: null });
    expect(warnings[1]).toBe('step 2: the memory host answers again');
    // The probe bound the space: it now stands under its name.
    expect(await client.getSpaceByName(SPACE_NAME)).toMatchObject({ name: SPACE_NAME });
  });
});
