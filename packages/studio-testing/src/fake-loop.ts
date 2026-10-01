import {
  sameRubric,
  type DeriveCriteriaRequest,
  type DerivedCriteriaDto,
  type Diagnostic,
  type IterationTrace,
  type LlmModelDto,
  type LlmExchangeSummaryDto,
  type PromptLibraryDocumentDto,
  type PromptLibraryEntryDto,
  type QualityRunDto,
  type QualityRunStartedDto,
  type StartQualityRunRequest,
} from '@sysdesign/contracts';

import { criteriaFromMarkdown } from './criteria-from-markdown';
import {
  autoIterations,
  DEFAULT_ITERATIONS,
  runTrace,
  tracesFrom,
  type FakeIteration,
} from './trace-builders';

/**
 * The quality loop as one scriptable state machine, transport-agnostic: the
 * studio API's client fake calls it in process and the e2e stub routes HTTP
 * onto it. Runs start `running` and finish when the caller says so — a spec
 * by calling `complete`/`fail`, the stub by `settle` after a delay — and a
 * scenario keyed by a run's goal lets a browser test script its own run
 * without touching anyone else's. No timers here: when a run settles is the
 * transport's call.
 */

/** What a scripted run does when it settles, keyed by the run's goal. */
export type RunScenario =
  | { outcome: 'complete'; iterations?: FakeIteration[]; once?: boolean }
  | { outcome: 'fail'; message: string; once?: boolean }
  | { outcome: 'refuse'; status?: number; message?: string; once?: boolean };

/** The loop's socket is dead: the adapter answers as the real client would to no answer at all. */
export class LoopUnreachable extends Error {
  constructor() {
    super('the quality loop is unreachable: fake');
    this.name = 'LoopUnreachable';
  }
}

/** The loop answered, and refused. */
export class LoopRefused extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'LoopRefused';
  }

  get body(): { statusCode: number; message: string } {
    return { statusCode: this.status, message: this.message };
  }
}

/** A derivation yielded no rubric — the loop's 503, never an empty list. */
export class DerivationFailed extends Error {
  constructor(
    message: string,
    readonly llm: LlmModelDto,
    readonly diagnostic: Diagnostic | null,
  ) {
    super(message);
    this.name = 'DerivationFailed';
  }
}

export interface FakeLoopOptions {
  model?: string;
  /** `fake-run` → `fake-run-1`, `fake-run-2`, …; the stub uses a per-process prefix. */
  runIdPrefix?: string;
  pipelineVersion?: string;
  library?: readonly PromptLibraryDocumentDto[];
  /** When set, any other pipeline is refused with 404, as the real loop does. */
  knownPipelines?: readonly string[];
  /** Exchange scopes a run starts with, so a live signal exists before it settles. */
  startExchanges?: readonly string[];
  now?: () => string;
}

const exchangesOf = (scopes: readonly string[], at: string): LlmExchangeSummaryDto[] =>
  scopes.map((scope, index) => ({
    scope,
    ordinal: index + 1,
    outcome: 'ok' as const,
    durationMs: 10,
    startedAt: at,
  }));

export class FakeLoop {
  readonly runs = new Map<string, QualityRunDto>();
  readonly requests = new Map<string, StartQualityRunRequest>();
  readonly startRequests: StartQualityRunRequest[] = [];
  readonly criteriaRequests: DeriveCriteriaRequest[] = [];
  llm: LlmModelDto;
  unreachable = false;
  /** The model answers, and derives nothing: `POST /criteria` is a 503 with the diagnostic. */
  derivationFails = false;
  failNextStart: Error | null = null;
  library: PromptLibraryDocumentDto[];

  private readonly model: string;
  private readonly prefix: string;
  private readonly version: string;
  private readonly known: readonly string[] | null;
  private readonly startExchanges: readonly string[];
  private readonly now: () => string;
  private readonly scenarios = new Map<string, RunScenario>();
  private readonly adoptions = new Map<string, IterationTrace>();
  private sequence = 0;

  constructor(options: FakeLoopOptions = {}) {
    this.model = options.model ?? 'fake-model';
    this.prefix = options.runIdPrefix ?? 'fake-run';
    this.version = options.pipelineVersion ?? 'fake';
    this.known = options.knownPipelines ?? null;
    this.startExchanges = options.startExchanges ?? [];
    this.now = options.now ?? (() => '2026-09-29T00:00:00.000Z');
    this.library = [...(options.library ?? [])];
    this.llm = { model: this.model };
  }

  /** What a run on this goal does when it settles; `once` scenarios are consumed. */
  scenario(goal: string, scenario: RunScenario): void {
    this.scenarios.set(goal, scenario);
  }

  clearScenarios(): void {
    this.scenarios.clear();
  }

  reset(): void {
    this.sequence = 0;
    this.runs.clear();
    this.requests.clear();
    this.adoptions.clear();
    this.startRequests.length = 0;
    this.criteriaRequests.length = 0;
    this.scenarios.clear();
    this.llm = { model: this.model };
    this.unreachable = false;
    this.derivationFails = false;
    this.failNextStart = null;
  }

  health(): { status: 'ok'; llm: LlmModelDto } {
    if (this.unreachable) throw new LoopUnreachable();
    return { status: 'ok', llm: this.llm };
  }

  deriveCriteria(request: DeriveCriteriaRequest): DerivedCriteriaDto {
    if (this.unreachable) throw new LoopUnreachable();
    this.criteriaRequests.push(request);
    this.assertKnown(request.pipeline);
    if (this.derivationFails) {
      throw new DerivationFailed('the model derived no criteria', this.llm, {
        stage: 'criteria',
        sample: null,
        reason: 'llm-failed',
        detail: null,
      });
    }
    return {
      pipeline: request.pipeline,
      criteria: criteriaFromMarkdown(request.goal),
      diagnostic: null,
      llm: this.llm,
    };
  }

  startRun(request: StartQualityRunRequest): QualityRunStartedDto {
    if (this.unreachable) throw new LoopUnreachable();
    if (this.failNextStart) {
      const error = this.failNextStart;
      this.failNextStart = null;
      throw error;
    }
    this.assertKnown(request.pipeline);
    const scenario = this.scenarios.get(request.goal);
    if (scenario?.outcome === 'refuse') {
      this.consume(request.goal, scenario);
      throw new LoopRefused(scenario.status ?? 400, scenario.message ?? 'the loop refused the run');
    }
    const adopted = request.adopt === undefined ? null : this.resolveAdoption(request);

    this.startRequests.push(request);
    const runId = `${this.prefix}-${++this.sequence}`;
    this.requests.set(runId, request);
    if (adopted !== null) this.adoptions.set(runId, adopted);
    const startedAt = this.now();
    this.runs.set(runId, {
      runId,
      pipeline: request.pipeline,
      status: 'running',
      startedAt,
      finishedAt: null,
      llm: this.llm,
      request: {
        goal: request.goal,
        outputProvided: request.output !== undefined,
        criteriaProvided: request.criteria !== undefined,
        adoptedFrom: request.adopt ?? null,
        maxIterations: request.maxIterations ?? 1,
      },
      trace: null,
      exchanges: exchangesOf(this.startExchanges, startedAt),
      error: null,
    });
    return { runId, status: 'running' };
  }

  getRun(runId: string): QualityRunDto | null {
    if (this.unreachable) throw new LoopUnreachable();
    return this.runs.get(runId) ?? null;
  }

  listPrompts(): PromptLibraryEntryDto[] {
    if (this.unreachable) throw new LoopUnreachable();
    return this.library.map(({ id, title }) => ({ id, title }));
  }

  getPrompt(id: string): PromptLibraryDocumentDto | null {
    if (this.unreachable) throw new LoopUnreachable();
    return this.library.find((document) => document.id === id) ?? null;
  }

  /** Model calls made so far, for a reader that shows progress while the run is still running. */
  exchanges(runId: string, count: number): void {
    const run = this.require(runId);
    run.exchanges = exchangesOf(
      Array.from({ length: count }, () => 'critic.requirements.s1'),
      this.now(),
    );
  }

  /**
   * Finish a run. `'default'` is the fake's one revise-worthy iteration;
   * `'auto'` is what the stub grades from the request alone; a list is what
   * the spec says. An adopting run's iteration 1 is the adopted iteration,
   * copied verbatim in mode `adopted`, and the list describes what follows.
   */
  complete(
    runId: string,
    iterations: readonly FakeIteration[] | 'default' | 'auto' = 'default',
  ): void {
    const run = this.require(runId);
    run.status = 'complete';
    run.finishedAt = this.now();
    run.trace = this.traceOf(runId, iterations);
  }

  /**
   * Record the iterations a still-running run has finished so far, as the
   * loop publishes them: the run stays `running`, its trace holds only
   * those iterations, and a later `complete` or `fail` settles it. The list
   * reads as `complete`'s does — an adopting run's iteration 1 is the
   * adopted one and the list describes what follows.
   */
  progress(runId: string, iterations: readonly FakeIteration[] = []): void {
    const run = this.require(runId);
    if (run.status !== 'running') throw new Error(`fake quality loop run ${runId} has settled`);
    run.trace = this.traceOf(runId, iterations);
  }

  fail(runId: string, message: string): void {
    const run = this.require(runId);
    run.status = 'failed';
    run.finishedAt = this.now();
    run.error = { name: 'Error', message, stack: null };
  }

  /** Settle a running run by its goal's scenario — the stub's timer calls this; a spec may too. */
  settle(runId: string): void {
    const run = this.runs.get(runId);
    if (!run || run.status !== 'running') return;
    const scenario = this.scenarios.get(run.request.goal);
    if (scenario === undefined) return this.complete(runId, 'auto');
    this.consume(run.request.goal, scenario);
    if (scenario.outcome === 'fail') return this.fail(runId, scenario.message);
    if (scenario.outcome === 'complete') return this.complete(runId, scenario.iterations ?? 'auto');
  }

  /** The trace a run's request and the spec's iterations describe. */
  private traceOf(
    runId: string,
    iterations: readonly FakeIteration[] | 'default' | 'auto',
  ): QualityRunDto['trace'] {
    const run = this.require(runId);
    const request = this.requests.get(runId);
    if (!request) throw new Error(`fake quality loop has no request for ${runId}`);
    const adopted = this.adoptions.get(runId) ?? null;
    const criteria = request.criteria ?? criteriaFromMarkdown(request.goal);

    let traced: IterationTrace[];
    if (iterations === 'auto') {
      traced = autoIterations(request, criteria, adopted);
    } else {
      const specs = iterations === 'default' ? DEFAULT_ITERATIONS(criteria) : iterations;
      traced =
        adopted === null
          ? tracesFrom(request, criteria, specs)
          : [
              { ...structuredClone(adopted), iteration: 1, mode: 'adopted' },
              ...tracesFrom(request, criteria, specs, 2),
            ];
    }
    // Nothing finished yet is no trace at all, as the loop publishes it.
    if (traced.length === 0) return null;
    return runTrace(run.pipeline, this.version, run.request.goal, criteria, traced);
  }

  private consume(goal: string, scenario: RunScenario): void {
    if (scenario.once) this.scenarios.delete(goal);
  }

  private assertKnown(pipeline: string): void {
    if (this.known !== null && !this.known.includes(pipeline)) {
      throw new LoopRefused(404, `unknown pipeline: ${pipeline}`);
    }
  }

  /** The recorded iteration an adopting run starts from, or the loop's refusal. */
  private resolveAdoption(request: StartQualityRunRequest): IterationTrace {
    const adopt = request.adopt;
    if (!adopt) throw new Error('no adopt on the request');
    const source = this.runs.get(adopt.runId);
    if (!source) throw new LoopRefused(404, `adopt: unknown run ${adopt.runId}`);
    if (source.pipeline !== request.pipeline) {
      throw new LoopRefused(
        400,
        `adopt: run ${adopt.runId} ran ${source.pipeline}, not ${request.pipeline}`,
      );
    }
    if (source.trace === null)
      throw new LoopRefused(400, `adopt: run ${adopt.runId} never completed`);
    const iteration = source.trace.iterations[adopt.iteration - 1];
    if (!iteration) {
      throw new LoopRefused(400, `adopt: run ${adopt.runId} has no iteration ${adopt.iteration}`);
    }
    if (
      request.criteria === undefined ||
      !sameRubric(request.criteria, source.trace.contract.criteria)
    ) {
      throw new LoopRefused(400, 'adopt: the rubric differs from the adopted run’s');
    }
    return iteration;
  }

  private require(runId: string): QualityRunDto {
    const run = this.runs.get(runId);
    if (!run) throw new Error(`fake quality loop has no run ${runId}`);
    return run;
  }
}
