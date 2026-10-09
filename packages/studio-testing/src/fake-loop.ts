import {
  openingRecall,
  type DeriveCriteriaRequest,
  type DerivedCriteriaDto,
  type IterationTrace,
  type LlmModelDto,
  type OrchestrationRunDto,
  type OrchestrationRunStartedDto,
  type PromptLibraryDocumentDto,
  type PromptLibraryEntryDto,
  type QualityLoopHealthDto,
  type QualityRunDto,
  type QualityRunStartedDto,
  type RunHeartbeatDto,
  type RunRecallDto,
  type StartOrchestrationFromRunRequest,
  type StartOrchestrationRequest,
  type StartQualityRunRequest,
} from '@sysdesign/contracts';

import { criteriaFromMarkdown } from './criteria-from-markdown';
import { resolveAdoption } from './fake-adoption';
import {
  exchangesOf,
  FAKE_LOOP_HEARTBEAT,
  type CoachScript,
  type FakeLoopOptions,
  type RunScenario,
} from './fake-loop-options';
import { FakeOrchestrations } from './fake-orchestrations';
import { fakeRecalled } from './fake-recall';
import { DerivationFailed, LoopRefused, LoopUnreachable } from './loop-errors';
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
 * transport's call. A run that asks to recall opens as the loop records it —
 * `recalling`, or skipped at once when it can never call its producer — and a
 * recalling one settles, to the fake's fixed lessons unless a spec says
 * otherwise, before any iteration lands.
 */

export class FakeLoop {
  readonly runs = new Map<string, QualityRunDto>();
  readonly requests = new Map<string, StartQualityRunRequest>();
  readonly startRequests: StartQualityRunRequest[] = [];
  readonly criteriaRequests: DeriveCriteriaRequest[] = [];
  /** The orchestrations started through the fake, and the run ids handed over from-run. */
  readonly orchestrations = new FakeOrchestrations({
    prefix: () => this.prefix,
    now: () => this.now(),
    runOf: (runId) => this.runs.get(runId) ?? null,
  });
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
  private readonly heartbeat: RunHeartbeatDto;
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
    this.heartbeat = options.heartbeat ?? FAKE_LOOP_HEARTBEAT;
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
    this.orchestrations.reset();
    this.adoptions.clear();
    this.startRequests.length = 0;
    this.criteriaRequests.length = 0;
    this.scenarios.clear();
    this.llm = { model: this.model };
    this.unreachable = false;
    this.derivationFails = false;
    this.failNextStart = null;
  }

  health(): QualityLoopHealthDto {
    if (this.unreachable) throw new LoopUnreachable();
    return { status: 'ok', llm: this.llm, heartbeat: this.heartbeat };
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
      // A fake derivation leaves no dump to name.
      dumpRunId: null,
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
    const adopted = request.adopt === undefined ? null : resolveAdoption(request, this.runs);

    this.startRequests.push(request);
    const runId = `${this.prefix}-${++this.sequence}`;
    this.requests.set(runId, request);
    if (adopted !== null) this.adoptions.set(runId, adopted);
    const startedAt = this.now();
    const summary: QualityRunDto['request'] = {
      goal: request.goal,
      outputProvided: request.output !== undefined,
      criteriaProvided: request.criteria !== undefined,
      adoptedFrom: request.adopt ?? null,
      maxIterations: request.maxIterations ?? 1,
    };
    this.runs.set(runId, {
      runId,
      pipeline: request.pipeline,
      status: 'running',
      startedAt,
      finishedAt: null,
      heartbeatAt: startedAt,
      llm: this.llm,
      request: summary,
      // The loop opens a run for another only to recall for it, and the fake recalls none.
      parentRunId: null,
      // The loop's own rule, from the contract: decided from the request.
      recall: openingRecall(request.recall === true, summary),
      trace: null,
      exchanges: exchangesOf(this.startExchanges, startedAt),
      error: null,
    });
    return { runId, status: 'running' };
  }

  /** `POST /orchestrations/:orchestrator` — start an orchestration on a goal; it runs until a spec settles it. */
  startOrchestration(
    orchestrator: string,
    request: StartOrchestrationRequest,
  ): OrchestrationRunStartedDto {
    if (this.unreachable) throw new LoopUnreachable();
    return this.orchestrations.start(orchestrator, request);
  }

  /**
   * `POST /orchestrations/:orchestrator/from-run` — a finished run stands in
   * for the orchestrator's target. The fake records the ask and answers with
   * an orchestration id; no step is simulated, because a caller only fires it.
   */
  startOrchestrationFromRun(
    orchestrator: string,
    request: StartOrchestrationFromRunRequest,
  ): OrchestrationRunStartedDto {
    if (this.unreachable) throw new LoopUnreachable();
    return this.orchestrations.startFromRun(orchestrator, request);
  }

  getOrchestration(orchestrationRunId: string): OrchestrationRunDto | null {
    if (this.unreachable) throw new LoopUnreachable();
    return this.orchestrations.get(orchestrationRunId);
  }

  /** The studio's digest, as it fires it: the memory orchestrator from a finished run. */
  digestRun(runId: string): OrchestrationRunStartedDto {
    return this.startOrchestrationFromRun('memory', { runId });
  }

  /** Run ids handed to an orchestrator from-run, in order — what the studio asked to have digested. */
  get digested(): readonly string[] {
    return this.orchestrations.digested;
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

  /**
   * Settle a recalling run's recall — to the fake's fixed lessons, or to the
   * outcome a spec gives — while the run itself stays as it is. A run that
   * did not ask to recall has nothing to settle.
   */
  recall(runId: string, outcome?: RunRecallDto): void {
    const run = this.require(runId);
    if (run.recall === null)
      throw new Error(`fake quality loop run ${runId} did not ask to recall`);
    run.recall = outcome ?? fakeRecalled(runId);
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
   * `'auto'` is what the stub grades from the request alone — its coach
   * writing what `coach` says too; a list is what the spec says. An adopting
   * run's iteration 1 is the adopted iteration, copied verbatim in mode
   * `adopted`, and the list describes what follows.
   */
  complete(
    runId: string,
    iterations: readonly FakeIteration[] | 'default' | 'auto' = 'default',
    coach: CoachScript = {},
  ): void {
    const run = this.require(runId);
    this.recalled(run);
    run.status = 'complete';
    run.finishedAt = this.now();
    run.heartbeatAt = run.finishedAt;
    run.trace = this.traceOf(runId, iterations, coach);
  }

  /**
   * Record the iterations a still-running run has finished so far, as the
   * loop publishes them: the run stays `running`, its trace holds only
   * those iterations with no stop reason, and a later `complete` or `fail`
   * settles it. The list reads as `complete`'s does — an adopting run's
   * iteration 1 is the adopted one and the list describes what follows.
   */
  progress(runId: string, iterations: readonly FakeIteration[] = []): void {
    const run = this.require(runId);
    if (run.status !== 'running') throw new Error(`fake quality loop run ${runId} has settled`);
    this.recalled(run);
    const trace = this.traceOf(runId, iterations);
    run.trace = trace === null ? null : { ...trace, stopReason: null };
    run.heartbeatAt = this.now();
  }

  /**
   * Fail a run, as the loop records one that threw or that the janitor
   * swept: the iterations it recorded are final, so a trace its `progress`
   * published stays, standing and all, with no stop reason.
   */
  fail(runId: string, message: string): void {
    const run = this.require(runId);
    this.recalled(run);
    run.status = 'failed';
    run.finishedAt = this.now();
    run.heartbeatAt = run.finishedAt;
    run.error = { name: 'Error', message, stack: null };
  }

  /** The loop no longer has the run — its store lost it — so a read of it is a 404, as a run never started. */
  forget(runId: string): void {
    this.require(runId);
    this.runs.delete(runId);
    this.requests.delete(runId);
    this.adoptions.delete(runId);
  }

  /** Settle a running run by its goal's scenario — the stub's timer calls this; a spec may too. */
  settle(runId: string): void {
    const run = this.runs.get(runId);
    if (!run || run.status !== 'running') return;
    const scenario = this.scenarios.get(run.request.goal);
    if (scenario === undefined) return this.complete(runId, 'auto');
    this.consume(run.request.goal, scenario);
    if (scenario.outcome === 'fail') return this.fail(runId, scenario.message);
    if (scenario.outcome === 'complete') {
      return this.complete(runId, scenario.iterations ?? 'auto', scenario.coach);
    }
  }

  /** The trace a run's request and the spec's iterations describe. */
  private traceOf(
    runId: string,
    iterations: readonly FakeIteration[] | 'default' | 'auto',
    coach: CoachScript = {},
  ): QualityRunDto['trace'] {
    const run = this.require(runId);
    const request = this.requests.get(runId);
    if (!request) throw new Error(`fake quality loop has no request for ${runId}`);
    const adopted = this.adoptions.get(runId) ?? null;
    const criteria = request.criteria ?? criteriaFromMarkdown(request.goal);

    let traced: IterationTrace[];
    if (iterations === 'auto') {
      traced = autoIterations(request, criteria, adopted, coach);
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

  /** The loop recalls before anything else moves: a run still recalling settles to the fixed lessons first. */
  private recalled(run: QualityRunDto): void {
    if (run.recall?.status === 'recalling') run.recall = fakeRecalled(run.runId);
  }

  private consume(goal: string, scenario: RunScenario): void {
    if (scenario.once) this.scenarios.delete(goal);
  }

  private assertKnown(pipeline: string): void {
    if (this.known !== null && !this.known.includes(pipeline)) {
      throw new LoopRefused(404, `unknown pipeline: ${pipeline}`);
    }
  }

  private require(runId: string): QualityRunDto {
    const run = this.runs.get(runId);
    if (!run) throw new Error(`fake quality loop has no run ${runId}`);
    return run;
  }
}
