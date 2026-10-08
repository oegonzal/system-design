import {
  type Admission,
  BROWSER_STEP_PIPELINE_ID,
  type DocumentChunk,
  FIELD_ANSWER_PIPELINE_ID,
  type FieldAnswers,
  type StepPlan,
  type SuccessCriterion,
  FAKE_RUBRIC,
  fakeRun,
  type FakeRunOptions,
} from '@sysdesign/contracts';

import {
  BrainFaulted,
  type BrainPort,
  type Decided,
  type FieldsInput,
  type StepInput,
} from './ports';

const FULL = { rung: 'full', bytes: 0, snapshotRung: 'full' as const };

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
