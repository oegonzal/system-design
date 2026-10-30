import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  composeFieldGoal,
  FAKE_RUBRIC,
  FIELD_ANSWER_PIPELINE_ID,
  fieldQuestionOf,
  fieldSpecOf,
  LESSON_SEPARATOR,
  observedElement,
  type FieldAnswers,
  type FieldSpec,
  type MemoryStrategy,
} from '@sysdesign/contracts';

import { predicateOf } from '../../adapters/memory-loop/teach';
import { fieldAnswer } from '../../core/testing';
import type { MemoryBrainSettings } from '../../settings';

/**
 * What the replay spec runs over: a strategy of one semantic register and the
 * brain settings that bind it, three fields with the facts that answer them —
 * an ingested fact, a unit's answer, and a standing answer kept as the brain
 * teaches one — an embedder that maps each question onto its fact, and two
 * session dumps as a session writes them: a page in a unit of work whose run
 * the loop holds, with a goal the loop's own recall wrote in its previous
 * grammar, and a page outside any whose run it lost. No vitest import.
 */
export const RUN = 'run-replay-spec';
export const TENANT = 'verify-spec';
export const PROJECT = 'replay-spec';
export const SESSION = '11111111-1111-4111-8111-111111111111';
export const AT = '2026-10-20T10:00:00.000Z';
const MISSION = '# Mission\n\nFill the form for the subject.\n';

const register = (name: string, metadata: string[]): MemoryStrategy['registers'][number] => ({
  name,
  kind: 'semantic',
  term: 'long_term',
  holds: 'facts of the subject',
  store: 'rows',
  scope: 'tenant, then project, then unit',
  metadata,
  lifecycle: 'superseded in place',
});
const iface = (
  operation: MemoryStrategy['interfaces'][number]['operation'],
  name: string,
): MemoryStrategy['interfaces'][number] => ({
  operation,
  register: name,
  input: 'a request',
  output: 'an answer',
  guarantee: 'scoped',
});

/** One semantic register, recalled and taught to — the shape the brain settings bind. */
export const STRATEGY: MemoryStrategy = {
  summary: 'The facts of one subject, kept for the forms that ask about them.',
  assumptions: [],
  registers: [register('facts', ['question', 'channel'])],
  interfaces: [
    iface('remember', 'facts'),
    iface('recall', 'facts'),
    iface('update', 'facts'),
    iface('invalidate', 'facts'),
  ],
  workflows: [
    {
      name: 'answer a field',
      kind: 'recall_routing',
      steps: [
        { operation: 'recall', register: 'facts', does: 'recall what the question bears on' },
      ],
    },
  ],
  safeguards: [],
  tradeoffs: [],
  risks: [],
};

export const SETTINGS: MemoryBrainSettings = {
  adapter: 'memory',
  binding: {
    space: { name: 'replay-spec', runId: RUN },
    scope: { partition: 'tenant', unit: 'unit' },
    registers: {
      fact: {
        name: 'facts',
        kind: 'semantic',
        operations: ['recall', 'remember'],
        metadata: ['question', 'channel'],
      },
    },
    recovery: { windowMs: 0, pauseMs: 1 },
  },
  project: PROJECT,
  facts: ['fact'],
  teach: 'fact',
  legend: [{ kind: 'facts', use: 'one thing true of the subject' }],
  recall: {
    hitsPerFieldType: {
      text: 3,
      textarea: 10,
      number: 3,
      date: 3,
      select: 3,
      radio: 3,
      checkbox: 3,
      file: 3,
      unknown: 3,
    },
    maxEvidence: 24,
    concurrency: 4,
  },
};

const field = (ref: string, name: string, context: string): FieldSpec =>
  fieldSpecOf(
    observedElement(ref, 'textbox', name, {
      kind: 'fillable',
      inputType: 'text',
      required: true,
      context,
    }),
  );
export const AUTH = field(
  'e1',
  'Work authorisation',
  'Are you authorised to work in this country?',
);
export const KNOWS = field('e2', 'Referral', 'Do you know anyone at this organisation?');
export const NOTICE = field('e3', 'Notice period', 'What is your notice period?');
export const QUESTION_AUTH = fieldQuestionOf(AUTH) as string;
export const QUESTION_KNOWS = fieldQuestionOf(KNOWS) as string;
export const QUESTION_NOTICE = fieldQuestionOf(NOTICE) as string;

/** A semantic fact and the text the runtime keeps it as. */
const fact = (predicate: string, value: string) => ({
  candidate: { subject: 'Ada', predicate, value, validFrom: null },
  text: `Ada — ${predicate}: ${value}`,
});
/** An ingested fact of the subject's. */
export const AUTH_FACT = fact('authorisation', 'Yes, authorised to work in this country');
export const KNOWS_AT_ACME = fact('knows_someone', 'Yes, a former colleague');
export const KNOWS_AT_GLOBEX = fact('knows_someone', 'No');
/** A standing answer as the brain teaches one: the question hashed as its predicate, the answer in its words. */
export const NOTICE_ANSWER = fact(
  predicateOf(QUESTION_NOTICE),
  `Asked "${QUESTION_NOTICE}", Ada answered "Two weeks".`,
);

/** The unit key hashed as the brain writes it into a scope. */
export const unitValue = (unitKey: string): string =>
  createHash('sha256').update(unitKey).digest('hex');

/** Each question maps onto the vector of the facts that answer it; anything else onto one of its own. */
const VECTORS: Readonly<Record<string, readonly number[]>> = {
  [QUESTION_AUTH]: [1, 0, 0, 0],
  [AUTH_FACT.text]: [1, 0, 0, 0],
  [QUESTION_KNOWS]: [0, 1, 0, 0],
  [KNOWS_AT_ACME.text]: [0, 1, 0, 0],
  [KNOWS_AT_GLOBEX.text]: [0, 1, 0, 0],
  [QUESTION_NOTICE]: [0, 0, 1, 0],
  [NOTICE_ANSWER.text]: [0, 0, 1, 0],
};
export const embedder = {
  model: 'spec-embedder',
  dimensions: 4,
  embed: (inputs: readonly string[]): Promise<number[][]> =>
    Promise.resolve(inputs.map((text) => [...(VECTORS[text] ?? [0, 0, 0, 1])])),
};

/** A field as `fields.json` records it: the routed field with the answerer's say, and what became of it. */
const routed = (
  spec: FieldSpec,
  route: string,
  source: string,
  value: string | null,
  answer: unknown,
  result: Record<string, unknown>,
) => ({
  position: 0,
  field: spec,
  answer,
  route,
  value,
  source,
  reason: 'as recorded',
  withheld: [],
  cached: false,
  result: { ref: spec.ref, label: spec.name, outcome: 'ok', via: null, chosen: null, ...result },
});

/** A text as the loop's store kept a memory: the fact, and the question it applies under. */
const lesson = (insight: string, appliesWhen: string): string =>
  `${insight}${LESSON_SEPARATOR}${appliesWhen}`;

/**
 * The goal the recorded run was given: today's codec, each text as the loop's
 * recall wrote it — the ingested authorisation fact, a unit answer the space
 * no longer holds in those words, and the notice-period answer as the old
 * digest worded it, which the space now holds under the question's identity.
 */
export const recordedGoal = (): string =>
  composeFieldGoal({
    pipeline: FIELD_ANSWER_PIPELINE_ID,
    prose: `${MISSION}\n## Open unit of work\n\n"Engineer at Acme"`,
    fields: [AUTH, KNOWS, NOTICE],
    evidence: [
      {
        alias: 'm1',
        text: lesson(AUTH_FACT.candidate.value, QUESTION_AUTH),
        when: '2026-10-03',
        scope: 'subject',
        kind: 'profile_fact',
        source: { origin: 'document-digest', ref: 'd1#c1' },
      },
      {
        alias: 'm2',
        text: lesson('Ada knows nobody at Acme.', QUESTION_KNOWS),
        when: '2026-10-12',
        scope: 'unit',
        kind: 'standing_answer',
        source: { origin: 'document-digest', ref: 'd2#c1' },
      },
      {
        alias: 'm3',
        text: lesson('Two weeks', QUESTION_NOTICE),
        when: '2026-10-12',
        scope: 'subject',
        kind: 'standing_answer',
        source: { origin: 'document-digest', ref: 'd2#c2' },
      },
    ],
    kinds: [
      { kind: 'profile_fact', use: 'one thing true of the subject' },
      { kind: 'standing_answer', use: "the subject's own answer" },
    ],
    unitKey: 'company=acme',
  });

const json = (value: unknown): string => JSON.stringify(value, null, 2);

const authFilled = () =>
  routed(
    AUTH,
    'fill',
    'memory',
    AUTH_FACT.candidate.value,
    fieldAnswer('e1', { value: AUTH_FACT.candidate.value, basis: ['m1'] }),
    { route: 'fill', source: 'memory', value: AUTH_FACT.candidate.value, reply: null },
  );

/** Two dumps: a page in a unit of work whose run the loop still holds, and a page outside any whose run it lost. */
export async function writeDumps(dir: string, recordedRunId: string): Promise<void> {
  const inUnit = join(dir, '2026-10-20T10-00-00-000-aaaaaa-session');
  await mkdir(join(inUnit, '01-steps', '03'), { recursive: true });
  await writeFile(join(inUnit, 'manifest.json'), json({ sessionId: SESSION }));
  await writeFile(join(inUnit, 'goal.md'), MISSION);
  await writeFile(
    join(inUnit, '00-rubrics.json'),
    json({ [FIELD_ANSWER_PIPELINE_ID]: { criteria: FAKE_RUBRIC, dumpRunId: null } }),
  );
  await writeFile(
    join(inUnit, '01-steps', '03', 'fields.json'),
    json({
      runId: recordedRunId,
      orchestrationRunId: null,
      admission: 'admitted',
      fields: [
        authFilled(),
        routed(
          KNOWS,
          'ask-operator',
          'loop',
          null,
          fieldAnswer('e2', { decision: 'ask-operator', rests: 'none', about: 'unit' }),
          { route: 'fill', source: 'operator', value: 'Yes', reply: 'answer', via: 'chat' },
        ),
        routed(
          NOTICE,
          'fill',
          'memory',
          'Two weeks',
          fieldAnswer('e3', { value: 'Two weeks', basis: ['m3'] }),
          { route: 'fill', source: 'memory', value: 'Two weeks', reply: null },
        ),
      ],
    }),
  );
  await writeFile(
    join(inUnit, '02-tasks.json'),
    json([
      {
        id: 'task-acme',
        sessionId: SESSION,
        ordinal: 1,
        label: 'Engineer at Acme',
        externalRef: 'https://jobs.example.test/acme/1',
        facets: [{ name: 'company', value: 'Acme' }],
        status: 'complete',
        outcome: 'done',
        startStep: 2,
        endStep: 4,
        startedAt: AT,
        finishedAt: AT,
        context: null,
      },
    ]),
  );
  const outside = join(dir, '2026-10-21T10-00-00-000-bbbbbb-session');
  await mkdir(join(outside, '01-steps', '02'), { recursive: true });
  await writeFile(join(outside, 'manifest.json'), json({ sessionId: SESSION }));
  await writeFile(join(outside, 'goal.md'), MISSION);
  await writeFile(
    join(outside, '01-steps', '02', 'fields.json'),
    json({ runId: 'a-run-the-loop-lost', admission: 'admitted', fields: [authFilled()] }),
  );
}

/** What the judge answers for the page in the unit: the authorisation from m1, a referral answer the operator contradicts, the notice period from m3. */
export const JUDGED: FieldAnswers = {
  summary: 'Every field answered from the evidence.',
  fields: [
    fieldAnswer('e1', { value: AUTH_FACT.candidate.value, basis: ['m1'] }),
    fieldAnswer('e2', { value: 'No', basis: ['m2'] }),
    fieldAnswer('e3', { value: 'Two weeks', basis: ['m3'] }),
  ],
};
