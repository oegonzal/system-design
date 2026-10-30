/**
 * Builders the field-answer specs share. Pure helpers only — no vitest
 * imports — so the file compiles under the app tsconfig. The goal is composed
 * with the contracts codec exactly as the session and the form-memory
 * orchestrator compose it: a policy, one form page's fields — a number, a
 * select, an unevidenced text, a hidden bait field, a free text — and two
 * recalled facts.
 */
import {
  composeFieldGoal,
  DOCUMENT_MEMORY_LEGEND,
  FIELD_ANSWER_PIPELINE_ID,
  type EvidenceItem,
  type FieldAnswer,
  type FieldAnswers,
  type FieldSpec,
  type SuccessCriterion,
} from '@sysdesign/contracts';

export const ANSWERING_PROSE = [
  '# Answering',
  '',
  'Answer about the applicant only from the evidence listed; otherwise ask the operator.',
  '',
  '## Never do',
  '',
  '- Never type into a field the page hides or that asks whether you are a bot.',
  '',
  '## Unit of work',
  '',
  'Senior Engineer at Acme — the second page of the application form.',
].join('\n');

const field = (
  ref: string,
  role: string,
  name: string,
  overrides: Partial<FieldSpec> = {},
): FieldSpec => ({
  ref,
  role,
  name,
  inputType: null,
  options: null,
  optionsOmitted: 0,
  value: null,
  required: false,
  invalid: false,
  maxLength: null,
  hiddenTraits: [],
  context: null,
  ...overrides,
});

export const sampleFields = (): FieldSpec[] => [
  field('e1', 'textbox', 'Years of experience with Python', {
    inputType: 'number',
    required: true,
    maxLength: 3,
    context: 'Whole years, professional only.',
  }),
  field('e2', 'combobox', 'Work authorisation', {
    required: true,
    options: ['Yes', 'No'],
    context: 'Are you authorised to work in this country?',
  }),
  field('e3', 'textbox', 'Current employer', { inputType: 'text' }),
  field('e4', 'textbox', 'Website', {
    inputType: 'text',
    hiddenTraits: ['offscreen', 'autocomplete-off-bait'],
  }),
  field('e5', 'textbox', 'Why do you want this role?', { inputType: 'text', maxLength: 200 }),
];

/** One recalled fact as the recall lists it: what the store holds it as, where it holds, and the run and item it came from. */
const fact = (alias: string, text: string, ref: string): EvidenceItem => ({
  alias,
  text,
  when: '2026-10-02',
  scope: 'subject',
  kind: 'profile_fact',
  source: { origin: 'document-digest', ref: `digest-run-1#${ref}` },
});

export const sampleEvidence = (): EvidenceItem[] => [
  fact(
    'm1',
    'Alex Example has six years of professional Python, 2020–2026, at Acme — applies when a form asks how many years of Python experience the applicant has',
    'memory.1',
  ),
  fact(
    'm2',
    'Alex Example is authorised to work in Portugal without sponsorship — applies when a form asks whether the applicant is authorised to work in the country',
    'memory.2',
  ),
];

/** The goal as the form-memory orchestrator recomposes it, evidence listed. */
export const fieldGoal = (
  evidence: EvidenceItem[] = sampleEvidence(),
  fields: FieldSpec[] = sampleFields(),
): string =>
  composeFieldGoal({
    pipeline: FIELD_ANSWER_PIPELINE_ID,
    prose: ANSWERING_PROSE,
    fields,
    evidence,
    kinds: DOCUMENT_MEMORY_LEGEND,
  });

export const answer = (ref: string, overrides: Partial<FieldAnswer> = {}): FieldAnswer => ({
  ref,
  about: 'subject',
  decision: 'answer',
  value: null,
  rests: 'stated',
  basis: [],
  reason: `settled for ${ref}`,
  ...overrides,
});

/** The page answered as the policy wants: two facts from evidence, one ask, one blank trap, one free text. */
export const sampleAnswers = (overrides: Partial<FieldAnswers> = {}): FieldAnswers => ({
  summary:
    'Two fields rest on the evidence, the employer has no evidence and is asked, the hidden field stays blank, the motivation is written freely.',
  fields: [
    answer('e1', { value: '6', basis: ['m1'], reason: 'm1 states six years of Python' }),
    answer('e2', { value: 'Yes', basis: ['m2'], reason: 'm2 states the authorisation' }),
    answer('e3', {
      decision: 'ask-operator',
      rests: 'none',
      reason: 'no evidence names the current employer',
    }),
    answer('e4', { decision: 'leave-blank', rests: 'none', reason: 'the page hides this field' }),
    answer('e5', {
      value: 'The role matches six years of building services for retailers.',
      rests: 'composed',
      basis: ['m1'],
      reason: 'a motivation statement assembled from the six years m1 states',
    }),
  ],
  ...overrides,
});

/** The rubric a session derives once from the answering policy and supplies on every run. */
export const policyCriteria = (): SuccessCriterion[] => [
  {
    id: 'c1',
    kind: 'grounding',
    statement: 'Every value about the applicant rests on listed evidence, cited by alias.',
  },
  {
    id: 'c2',
    kind: 'compliance',
    statement: 'A field the page hides, or that asks whether you are a bot, is left blank.',
  },
  {
    id: 'c3',
    kind: 'coverage',
    statement: 'Every listed field is answered, asked of the operator, or left blank by rule.',
  },
];
