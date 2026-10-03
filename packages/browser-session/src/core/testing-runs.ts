import {
  BROWSER_STEP_PIPELINE_ID,
  FIELD_ANSWER_PIPELINE_ID,
  type Admission,
  type ConfirmedFinding,
  type Decision,
  type DocumentChunk,
  type FieldAnswers,
  type QualityRunDto,
  type StepPlan,
  type SuccessCriterion,
  type ValidationReport,
} from '@sysdesign/contracts';

import {
  BrainFaulted,
  type BrainPort,
  type Decided,
  type FieldsInput,
  type StepInput,
} from './ports';

/**
 * Recorded runs as the fakes hand them out, in the wire shape the loop would
 * have recorded, so the engine reads them back through the same contracts
 * code as a real run. No vitest import: these are shared by the pure specs
 * and the scripted end-to-end run.
 */
export interface FakeRunOptions {
  runId?: string;
  decision?: Decision;
  findings?: ConfirmedFinding[];
  validation?: ValidationReport[];
  policyAllowed?: boolean;
  status?: QualityRunDto['status'];
}

let sequence = 0;

/** A confirmed finding at the given locations, as a judge would have recorded it. */
export function finding(
  type: string,
  locationRefs: string[],
  rationale = `${type} seen`,
): ConfirmedFinding {
  return {
    key: `${type}|${[...locationRefs].sort().join(',')}`,
    type,
    severity: 'high',
    confidence: 'high',
    fixability: 'fixable_local',
    locationRefs,
    criterionIds: [],
    hits: 2,
    lenses: ['critic.fake'],
    rationale,
    reconciledTo: null,
  };
}

/** One finished run with one judged iteration holding the artifact. */
export function fakeRun(
  pipeline: string,
  artifact: unknown,
  options: FakeRunOptions = {},
  criteria: readonly SuccessCriterion[] = [],
): QualityRunDto {
  const runId = options.runId ?? `fake-${pipeline}-${++sequence}`;
  const decision = options.decision ?? 'accept';
  const validation = options.validation ?? [];
  const blocked = validation.some(
    (report) => report.gate === 'block' && report.problems.length > 0,
  );
  const at = '2026-10-03T10:00:00.000Z';
  return {
    runId,
    pipeline,
    status: options.status ?? 'complete',
    startedAt: at,
    finishedAt: at,
    heartbeatAt: at,
    llm: { model: 'fake-model' },
    request: {
      goal: 'fake goal',
      outputProvided: false,
      criteriaProvided: criteria.length > 0,
      adoptedFrom: null,
      maxIterations: 1,
    },
    parentRunId: null,
    recall: null,
    trace: {
      pipeline: { id: pipeline, version: 'fake' },
      contract: { goal: 'fake goal', criteria: [...criteria] },
      iterations: [
        {
          iteration: 1,
          mode: 'initial',
          artifact,
          locations: [],
          rendered: null,
          validation,
          critics: [],
          evaluators: [],
          ledger: {
            artifactPresent: artifact !== null,
            validation,
            criteria: [],
            findings: options.findings ?? [],
            discarded: [],
            diagnostics: [],
          },
          decision: {
            finalDecision: decision,
            gates: {
              artifactPresent: artifact !== null,
              validatorsPassed: !blocked,
              evidenceSufficient: true,
              policyAllowed: options.policyAllowed ?? true,
            },
            scores: { dimensions: {}, overall: decision === 'accept' ? 85 : 40 },
            selectedRemediations: [],
            reason: 'fake',
            trace: { steps: [], dimensions: [], weightSum: 1, weightedTotal: 0 },
          },
          remediations: [],
          durationMs: 0,
        },
      ],
      bestIteration: 1,
      finalDecision: decision,
      stopReason: decision === 'accept' ? 'accepted' : 'escalated',
      lessons: [],
    },
    exchanges: [],
    error: null,
  };
}

const FULL = { rung: 'full', bytes: 0 };

/** A step plan as the loop would have decided it. */
export function decidedPlan(plan: StepPlan, options: FakeRunOptions = {}): Decided<StepPlan> {
  const run = fakeRun(BROWSER_STEP_PIPELINE_ID, plan, options);
  return { runId: run.runId, orchestrationRunId: null, run, composition: FULL };
}

/** Field answers as the form-memory orchestration would have decided them, with the admission it reports. */
export function decidedAnswers(
  answers: FieldAnswers,
  options: FakeRunOptions & { admission?: Admission; orchestrationRunId?: string } = {},
): Decided<FieldAnswers> & { admission: Admission } {
  const run = fakeRun(FIELD_ANSWER_PIPELINE_ID, answers, options);
  return {
    runId: run.runId,
    orchestrationRunId: options.orchestrationRunId ?? `${run.runId}-orchestration`,
    run,
    composition: FULL,
    admission: options.admission ?? 'admitted',
  };
}

export type Scripted<T> = T | BrainFaulted;

export interface BrainScript {
  rubric?: SuccessCriterion[];
  /** Thrown by `deriveRubric`, when set. */
  deriveFault?: BrainFaulted;
  plans: Scripted<Decided<StepPlan>>[];
  answers?: Scripted<Decided<FieldAnswers> & { admission: Admission }>[];
  /** Thrown by `teach`, when set. */
  teachFault?: BrainFaulted;
}

export const FAKE_RUBRIC: SuccessCriterion[] = [
  { id: 'c1', kind: 'progress', statement: 'Each procedure step is taken in order.' },
  { id: 'c2', kind: 'safety', statement: 'No hidden field is filled.' },
];

/**
 * A brain that answers from a script, in order, and records what it was
 * asked. A scripted `BrainFaulted` is thrown in its turn; running past the
 * script is an error, so a spec that expects three plans gets exactly three.
 */
export class ScriptedBrain implements BrainPort {
  readonly derived: { pipeline: string; goal: string }[] = [];
  readonly planInputs: StepInput[] = [];
  readonly fieldInputs: FieldsInput[] = [];
  readonly taught: DocumentChunk[] = [];
  private readonly plans: Scripted<Decided<StepPlan>>[];
  private readonly answers: Scripted<Decided<FieldAnswers> & { admission: Admission }>[];

  constructor(private readonly script: BrainScript) {
    this.plans = [...script.plans];
    this.answers = [...(script.answers ?? [])];
  }

  async deriveRubric(pipeline: string, goal: string): Promise<SuccessCriterion[]> {
    if (this.script.deriveFault) throw this.script.deriveFault;
    this.derived.push({ pipeline, goal });
    return (this.script.rubric ?? FAKE_RUBRIC).map((criterion) => ({ ...criterion }));
  }

  async planStep(input: StepInput): Promise<Decided<StepPlan>> {
    this.planInputs.push(input);
    const next = this.plans.shift();
    if (next === undefined) throw new Error('the scripted brain has no more plans');
    if (next instanceof BrainFaulted) throw next;
    return next;
  }

  async answerFields(
    input: FieldsInput,
  ): Promise<Decided<FieldAnswers> & { admission: Admission }> {
    this.fieldInputs.push(input);
    const next = this.answers.shift();
    if (next === undefined) throw new Error('the scripted brain has no more field answers');
    if (next instanceof BrainFaulted) throw next;
    return next;
  }

  async teach(document: DocumentChunk): Promise<{ orchestrationRunId: string }> {
    if (this.script.teachFault) throw this.script.teachFault;
    this.taught.push(document);
    return { orchestrationRunId: `fake-teach-${this.taught.length}` };
  }
}
