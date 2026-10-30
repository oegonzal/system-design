import {
  MemoryHostRefused,
  MemoryHostTimeout,
  MemoryHostUnreachable,
  SpaceNotCompiled,
  type BoundSpace,
  type MemoryClient,
} from '@sysdesign/agentic-memory-client';
import {
  ANSWER_SUGGESTIONS_PIPELINE_ID,
  FIELD_ANSWER_PIPELINE_ID,
  type AnswerSuggestions,
  type BrowserSessionRole,
  type FieldAnswers,
  type FormPipeline,
  type OperatorGuidanceDto,
  type StepPlan,
} from '@sysdesign/contracts';
import type { LoopClient } from '@sysdesign/loop-client';

import {
  BrainFaulted,
  type BrainPort,
  type Decided,
  type DerivedRubric,
  type FieldsInput,
  type FormReport,
  type SessionStepRef,
  type StepInput,
  type TeachReceipt,
} from '../../core/ports';
import { SessionRefused } from '../../core/unit-advice';
import type { MemoryBrainSettings } from '../../settings';
import {
  deriveRubricWith,
  guarded,
  LOOP_FAULTS,
  planStepWith,
  type FaultTable,
  type LoopBrainOptions,
} from '../loop-http/loop-runs';
import { bindBrainSpace, bootBrainSpace, isHostSilent, memoryTenantOf, scopeOf } from './binding';
import { noEvidence, recallForFields, type FieldRecall } from './field-recall';
import { judgeFields } from './judged-form';
import { rememberAnswers } from './teach';

/**
 * The brain is the quality loop for plans and judgements, and a memory space
 * for what a field's answer rests on and for what the operator teaches. A plan
 * and a rubric are the loop's as under the loop alone. A form page is recalled
 * for first — one request per distinct question, under the open unit of work
 * — then judged by the loop on a goal the session composed whole, its
 * admission read off the run's own readout; an operator's answer is written to
 * the space as one deterministic fact the moment it is given. The space is
 * bound when the brain is told to bind — before any session row, by whoever
 * runs the session or teaches through it — never when it is composed, so a
 * command that only reads the ledger asks the host nothing. A host that does
 * not answer never faults a page: the goal is composed with no evidence, the
 * outage said once, and the host probed once a step until it answers again.
 */

/** The errors both hosts raise, each to the fault it is: the loop's rows, then the memory host's. */
const MEMORY_FAULTS: FaultTable = [
  ...LOOP_FAULTS,
  [MemoryHostUnreachable, 'unreachable'],
  [MemoryHostTimeout, 'unreachable'],
  [MemoryHostRefused, 'failed'],
  [SpaceNotCompiled, 'failed'],
  // A space that stopped serving the binding between boot and a step's probe
  // is the brain's fault at that step, never a refusal of a session already running.
  [SessionRefused, 'failed'],
];

interface MemoryLoopBrainOptions extends LoopBrainOptions {
  /** Where the brain says what a person hears once: the host gone quiet, the host back. */
  warn?: (text: string) => void;
}

/** The recall of one page, as the brain keeps it for the step: the suggestions for a page draw on what its answers did. */
interface StepRecall {
  key: string;
  recall: Promise<FieldRecall>;
}

export class MemoryLoopBrain implements BrainPort {
  /** The tenant every request names, once bound; null until `bind` checked the one it was composed for. */
  private tenant: string | null = null;
  private bound: BoundSpace | null = null;
  /** Open while the host is not answering: said once when it opens, closed by the step whose probe it answers. */
  private silent = false;
  private memo: StepRecall | null = null;

  constructor(
    private readonly loop: LoopClient,
    private readonly memory: MemoryClient,
    private readonly settings: MemoryBrainSettings,
    /** The tenant as the environment or the command named it — checked at bind, never before. */
    private readonly memoryTenant: string,
    private readonly options: MemoryLoopBrainOptions = {},
  ) {}

  /**
   * The tenant checked and the space bound, before any session row: a tenant
   * left unnamed and a space that does not serve the binding refuse by name;
   * a host silent at boot is said once, and the first step's probe binds it.
   */
  async bind(): Promise<void> {
    this.tenant = memoryTenantOf(this.memoryTenant);
    this.bound = await bootBrainSpace(this.memory, this.settings, (text) => this.warn(text));
    this.silent = this.bound === null;
  }

  deriveRubric(role: BrowserSessionRole, goal: string): Promise<DerivedRubric> {
    return deriveRubricWith(this.loop, role, goal);
  }

  planStep(input: StepInput): Promise<Decided<StepPlan>> {
    return planStepWith(this.loop, this.options, input);
  }

  answerFields(input: FieldsInput): Promise<Decided<FieldAnswers> & FormReport> {
    return this.judged<FieldAnswers>(input, FIELD_ANSWER_PIPELINE_ID, 'form page');
  }

  suggestAnswers(input: FieldsInput): Promise<Decided<AnswerSuggestions> & FormReport> {
    return this.judged<AnswerSuggestions>(
      input,
      ANSWER_SUGGESTIONS_PIPELINE_ID,
      'suggested answers',
    );
  }

  /** The answers written to the space as facts, one receipt each; a host that does not answer is the brain's fault, recorded against the answers. */
  teach(
    answers: readonly OperatorGuidanceDto[],
    session: SessionStepRef,
    subject: string,
  ): Promise<readonly TeachReceipt[]> {
    return guarded(async () => {
      const tenant = this.tenantOf();
      const bound = await this.space(session.step);
      return rememberAnswers(this.memory, bound, this.settings, tenant, answers, session, subject);
    }, MEMORY_FAULTS);
  }

  /** The page recalled for, then judged once by the loop on the goal with the evidence, the recall reported beside the decision. */
  private judged<T>(
    input: FieldsInput,
    pipeline: FormPipeline,
    what: string,
  ): Promise<Decided<T> & FormReport> {
    return guarded(async () => {
      const { evidence, report } = await this.recallFor(input);
      const judged = await judgeFields<T>(
        this.loop,
        pipeline,
        input,
        evidence,
        this.settings.legend,
        input.session,
        what,
        this.options,
      );
      return { ...judged, recall: report };
    }, MEMORY_FAULTS);
  }

  /** The step's recall, made once and kept for the step. */
  private recallFor(input: FieldsInput): Promise<FieldRecall> {
    const key = `${input.session.sessionId}#${input.session.step}`;
    if (this.memo?.key !== key) this.memo = { key, recall: this.recallOnce(input) };
    return this.memo.recall;
  }

  /**
   * The evidence for one page. A host that does not answer never faults the
   * page: no evidence, the outage said once and recorded on the report. A
   * host that refuses, or a space that no longer serves the binding, throws,
   * and the table reads it as the brain's fault.
   */
  private async recallOnce(input: FieldsInput): Promise<FieldRecall> {
    const startedAt = Date.now();
    const { step } = input.session;
    const tenant = this.tenantOf();
    try {
      const bound = await this.space(step);
      const scope = scopeOf(bound, tenant, this.settings.project, input.task?.unitKey ?? null);
      return await recallForFields(this.memory, bound, this.settings, scope, input);
    } catch (error) {
      if (!isHostSilent(error)) throw error;
      if (!this.silent) {
        this.silent = true;
        this.warn(
          `step ${step}: the memory host did not answer — answering with no evidence until it does, probed once a step: ${error.message}`,
        );
      }
      return noEvidence(error.message, Date.now() - startedAt);
    }
  }

  /** The tenant bound for; a brain asked before it was bound is a fault in the program, not in the host. */
  private tenantOf(): string {
    if (this.tenant === null) {
      throw new Error('the memory brain is bound before it is asked: bind() was not called');
    }
    return this.tenant;
  }

  /**
   * The bound space: bound now when boot could not, and while the host has
   * been silent probed with one read before the step asks it anything more —
   * so a host that is down costs each step one call, not one per question. A
   * host that answers the probe is said to answer again.
   */
  private async space(step: number): Promise<BoundSpace> {
    if (this.bound === null) {
      this.bound = await bindBrainSpace(this.memory, this.settings);
    } else if (this.silent) {
      const space = await this.memory.getSpace(this.bound.spaceId);
      if (space === null) {
        throw new BrainFaulted(
          'failed',
          `the memory host no longer has the space ${this.bound.spaceId}`,
        );
      }
    }
    if (this.silent) {
      this.silent = false;
      this.warn(`step ${step}: the memory host answers again`);
    }
    return this.bound;
  }

  private warn(text: string): void {
    this.options.warn?.(text);
  }
}
