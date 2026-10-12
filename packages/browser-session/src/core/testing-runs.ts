import {
  type Admission,
  ANSWER_SUGGESTIONS_PIPELINE_ID,
  type AnswerSuggestions,
  BROWSER_STEP_PIPELINE_ID,
  type DocumentChunk,
  FIELD_ANSWER_PIPELINE_ID,
  type FieldAnswers,
  type StepPlan,
  type SuccessCriterion,
  type WithheldRef,
  type WithholdingSource,
  FAKE_RUBRIC,
  fakeRun,
  type FakeRunOptions,
} from '@sysdesign/contracts';

import {
  BrainFaulted,
  type BrainPort,
  type Decided,
  type DerivedRubric,
  type FieldsInput,
  type FormReport,
  type StepInput,
} from './ports';

const FULL = { rung: 'full', bytes: 0, snapshotRung: 'full' as const };

/** A step plan as the loop would have decided it. */
export function decidedPlan(plan: StepPlan, options: FakeRunOptions = {}): Decided<StepPlan> {
  const run = fakeRun(BROWSER_STEP_PIPELINE_ID, plan, options);
  return { runId: run.runId, orchestrationRunId: null, run, composition: FULL };
}

/** One location the orchestration's report withholds, as a spec declares it. */
export const withheldBy = (
  ref: string,
  by: string,
  note: string | null = null,
  source: WithholdingSource = 'finding',
): WithheldRef => ({ ref, source, by, note });

/** Field answers as the form-memory orchestration would have decided them, with the admission and the withholding it reports. */
export function decidedAnswers(
  answers: FieldAnswers,
  options: FakeRunOptions & {
    admission?: Admission;
    orchestrationRunId?: string;
    withheld?: WithheldRef[];
  } = {},
): Decided<FieldAnswers> & FormReport {
  const run = fakeRun(FIELD_ANSWER_PIPELINE_ID, answers, options);
  return {
    runId: run.runId,
    orchestrationRunId: options.orchestrationRunId ?? `${run.runId}-orchestration`,
    run,
    composition: FULL,
    admission: options.admission ?? 'admitted',
    withheld: options.withheld ?? [],
  };
}

/** Suggested answers as the form-memory orchestration would have run them, with what it reports a reader withholds. */
export function decidedSuggestions(
  suggestions: AnswerSuggestions,
  options: FakeRunOptions & { admission?: Admission; withheld?: WithheldRef[] } = {},
): Decided<AnswerSuggestions> & FormReport {
  const run = fakeRun(ANSWER_SUGGESTIONS_PIPELINE_ID, suggestions, options);
  return {
    runId: run.runId,
    orchestrationRunId: `${run.runId}-orchestration`,
    run,
    composition: FULL,
    admission: options.admission ?? 'admitted',
    withheld: options.withheld ?? [],
  };
}

export type Scripted<T> = T | BrainFaulted;

export interface BrainScript {
  rubric?: SuccessCriterion[];
  /** Thrown by `deriveRubric`, when set. */
  deriveFault?: BrainFaulted;
  plans: Scripted<Decided<StepPlan>>[];
  answers?: Scripted<Decided<FieldAnswers> & FormReport>[];
  /** Suggestions in turn; past the script a suggestions run faults. */
  suggestions?: Scripted<Decided<AnswerSuggestions> & FormReport>[];
  /** Holds every suggestions run until it settles, so a question can be asked before they arrive. */
  suggestionsGate?: Promise<void>;
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
  readonly suggestionInputs: FieldsInput[] = [];
  readonly taught: DocumentChunk[] = [];
  private readonly plans: Scripted<Decided<StepPlan>>[];
  private readonly answers: Scripted<Decided<FieldAnswers> & FormReport>[];
  private readonly suggestions: Scripted<Decided<AnswerSuggestions> & FormReport>[];

  constructor(private readonly script: BrainScript) {
    this.plans = [...script.plans];
    this.answers = [...(script.answers ?? [])];
    this.suggestions = [...(script.suggestions ?? [])];
  }

  async deriveRubric(pipeline: string, goal: string): Promise<DerivedRubric> {
    if (this.script.deriveFault) throw this.script.deriveFault;
    this.derived.push({ pipeline, goal });
    return {
      criteria: (this.script.rubric ?? FAKE_RUBRIC).map((criterion) => ({ ...criterion })),
      dumpRunId: `${pipeline}-criteria-dump`,
    };
  }

  async planStep(input: StepInput): Promise<Decided<StepPlan>> {
    this.planInputs.push(input);
    const next = this.plans.shift();
    if (next === undefined) throw new Error('the scripted brain has no more plans');
    if (next instanceof BrainFaulted) throw next;
    return next;
  }

  async answerFields(input: FieldsInput): Promise<Decided<FieldAnswers> & FormReport> {
    this.fieldInputs.push(input);
    const next = this.answers.shift();
    if (next === undefined) throw new Error('the scripted brain has no more field answers');
    if (next instanceof BrainFaulted) throw next;
    return next;
  }

  /** Past the script a suggestions run faults: a session asks without them, as it would live. */
  async suggestAnswers(input: FieldsInput): Promise<Decided<AnswerSuggestions> & FormReport> {
    this.suggestionInputs.push(input);
    await this.script.suggestionsGate;
    const next = this.suggestions.shift();
    if (next === undefined) throw new BrainFaulted('no-artifact', 'no suggestions were scripted');
    if (next instanceof BrainFaulted) throw next;
    return next;
  }

  async teach(document: DocumentChunk): Promise<{ orchestrationRunId: string }> {
    if (this.script.teachFault) throw this.script.teachFault;
    this.taught.push(document);
    return { orchestrationRunId: `fake-teach-${this.taught.length}` };
  }
}
