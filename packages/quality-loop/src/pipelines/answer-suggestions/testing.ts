/**
 * Fixtures for the answer-suggestions pipeline: three fields the operator is
 * about to be asked — a number the record states, an employer it does not,
 * an open question its adjacent work bears on — the evidence recalled for
 * them, the goal the form-memory orchestrator composes, and suggestions as a
 * drafter following the policy would write them.
 */
import {
  ANSWER_SUGGESTIONS_PIPELINE_ID,
  composeFieldGoal,
  DOCUMENT_MEMORY_LEGEND,
  type AnswerSuggestions,
  type EvidenceItem,
  type FieldSpec,
} from '@sysdesign/contracts';

export const SUGGESTING_PROSE = [
  '# Suggesting',
  '',
  '## Suggesting policy',
  '',
  '- Where the record answers a question, lead with record suggestions.',
  '- Where it is silent on a question about the subject’s experience, offer a transfer draft when adjacent work is recorded, and an invented draft.',
  '- A fact the record lacks — a name, a date, a figure, an employer, a contact — gets no invented draft.',
].join('\n');

const field = (ref: string, name: string, overrides: Partial<FieldSpec> = {}): FieldSpec => ({
  ref,
  role: 'textbox',
  name,
  inputType: 'text',
  options: null,
  optionsOmitted: 0,
  value: null,
  required: true,
  invalid: false,
  maxLength: null,
  hiddenTraits: [],
  context: null,
  ...overrides,
});

export const sampleFields = (): FieldSpec[] => [
  field('e1', 'Years of experience with Python', { inputType: 'number', maxLength: 3 }),
  field('e2', 'Current employer'),
  field('e3', 'Describe your experience building distributed systems with Node.js', {
    maxLength: 600,
  }),
];

/** One recalled item as the recall lists it: what the store holds it as, where it holds, and the run and item it came from. */
const item = (alias: string, text: string, kind: EvidenceItem['kind']): EvidenceItem => ({
  alias,
  text,
  when: '2026-10-02',
  scope: 'subject',
  kind,
  source: { origin: 'document-digest', ref: `digest-run-1#memory.${alias.slice(1)}` },
});

export const sampleEvidence = (): EvidenceItem[] => [
  item('m1', 'Alex Example has six years of professional Python, 2020–2026.', 'profile_fact'),
  item(
    'm2',
    'At Acme, Alex Example built an event pipeline in Go that fanned work out across a queue to stateless workers.',
    'profile_story',
  ),
  item(
    'm3',
    'The scale of a system Alex Example worked on is not to be inferred.',
    'claim_boundary',
  ),
];

/** The goal as the form-memory orchestrator recomposes it for this pipeline, evidence listed. */
export const suggestionsGoal = (
  evidence: EvidenceItem[] = sampleEvidence(),
  fields: FieldSpec[] = sampleFields(),
): string =>
  composeFieldGoal({
    pipeline: ANSWER_SUGGESTIONS_PIPELINE_ID,
    prose: SUGGESTING_PROSE,
    fields,
    evidence,
    kinds: DOCUMENT_MEMORY_LEGEND,
  });

/** Suggestions as the policy wants them: a record answer, nothing for the employer, a transfer and an invented draft. */
export const sampleSuggestions = (): AnswerSuggestions => ({
  summary:
    'The record states the Python years and bears on distributed work through a Go pipeline; it names no current employer.',
  fields: [
    {
      ref: 'e1',
      suggestions: [
        { text: '6', basis: 'record', cites: ['m1'], why: 'm1 states six years of Python' },
      ],
    },
    { ref: 'e2', suggestions: [] },
    {
      ref: 'e3',
      suggestions: [
        {
          text: 'I built an event pipeline at Acme that fanned work out across a queue to stateless workers; the same queue-and-worker design carries over to Node.js services.',
          basis: 'transfer',
          cites: ['m2'],
          why: 'm2 records the Go pipeline; the transfer is the design, not Node.js itself',
        },
        {
          text: 'I have built Node.js services that consume a shared queue and scale out as stateless workers.',
          basis: 'invented',
          cites: ['m2'],
          why: 'modelled on m2; the operator must have built such Node.js services to choose it',
        },
      ],
    },
  ],
});
