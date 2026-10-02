import {
  MEMORY_ORCHESTRATOR_ID,
  type DeriveCriteriaRequest,
  type DerivedCriteriaDto,
  type LlmModelDto,
  type PromptLibraryDocumentDto,
  type PromptLibraryEntryDto,
  type OrchestrationRunStartedDto,
  type QualityLoopHealthDto,
  type QualityRunDto,
  type QualityRunStartedDto,
  type RunRecallDto,
  type StartQualityRunRequest,
} from '@sysdesign/contracts';
import {
  FakeLoop,
  FakeLoopClient,
  type FakeIteration,
  type RunScenario,
} from '@sysdesign/studio-testing';

import { answer } from '../modules/quality-loop/loop-exceptions';
import { QualityLoopClient } from '../modules/quality-loop/quality-loop.client';

/**
 * The quality loop as the studio's specs see it: `@sysdesign/studio-testing`'s
 * fake loop behind the client port. Runs start `running` and finish when the
 * spec says so, rubrics come from the goal's headings, and every request is
 * kept so a spec can assert what the studio asked for. The fake's errors are
 * the shared client's own, mapped here by the same table production uses, so
 * a spec sees exactly the exceptions the real HTTP client would raise.
 */
export class FakeQualityLoopClient extends QualityLoopClient {
  readonly core = new FakeLoop({
    model: 'fake-model',
    runIdPrefix: 'fake-run',
    pipelineVersion: 'fake',
    library: [
      {
        id: 'order-history',
        title: 'Serve an order history',
        markdown: [
          '# Serve an order history',
          '',
          '## Functional requirements',
          '',
          "1. Return a customer's past orders newest first.",
          '2. Ingest online orders as the storefront pushes them.',
          '',
          '## Non-functional requirements',
          '',
          '| Kind | Requirement | Target |',
          '| --- | --- | --- |',
          '| latency | order-history reads | p99 ≤ 300 ms |',
          '',
          '## Constraints',
          '',
          '- The point-of-sale system only answers polling.',
          '',
        ].join('\n'),
      },
    ],
  });

  private readonly inner = new FakeLoopClient(this.core);

  get runs(): Map<string, QualityRunDto> {
    return this.core.runs;
  }

  get requests(): Map<string, StartQualityRunRequest> {
    return this.core.requests;
  }

  get startRequests(): StartQualityRunRequest[] {
    return this.core.startRequests;
  }

  get criteriaRequests(): DeriveCriteriaRequest[] {
    return this.core.criteriaRequests;
  }

  get llm(): LlmModelDto {
    return this.core.llm;
  }

  set llm(value: LlmModelDto) {
    this.core.llm = value;
  }

  get unreachable(): boolean {
    return this.core.unreachable;
  }

  set unreachable(value: boolean) {
    this.core.unreachable = value;
  }

  get derivationFails(): boolean {
    return this.core.derivationFails;
  }

  set derivationFails(value: boolean) {
    this.core.derivationFails = value;
  }

  get failNextStart(): Error | null {
    return this.core.failNextStart;
  }

  set failNextStart(value: Error | null) {
    this.core.failNextStart = value;
  }

  get library(): PromptLibraryDocumentDto[] {
    return this.core.library;
  }

  set library(value: PromptLibraryDocumentDto[]) {
    this.core.library = value;
  }

  reset(): void {
    this.core.reset();
  }

  scenario(goal: string, scenario: RunScenario): void {
    this.core.scenario(goal, scenario);
  }

  health(): Promise<QualityLoopHealthDto> {
    return answer(() => this.inner.health());
  }

  deriveCriteria(request: DeriveCriteriaRequest): Promise<DerivedCriteriaDto> {
    return answer(() => this.inner.deriveCriteria(request));
  }

  startRun(request: StartQualityRunRequest): Promise<QualityRunStartedDto> {
    return answer(() => this.inner.startRun(request));
  }

  getRun(runId: string): Promise<QualityRunDto | null> {
    return answer(() => this.inner.getRun(runId));
  }

  listPrompts(): Promise<PromptLibraryEntryDto[]> {
    return answer(() => this.inner.listPrompts());
  }

  getPrompt(id: string): Promise<PromptLibraryDocumentDto | null> {
    return answer(() => this.inner.getPrompt(id));
  }

  digestRun(runId: string): Promise<OrchestrationRunStartedDto> {
    return answer(() => this.inner.startOrchestrationFromRun(MEMORY_ORCHESTRATOR_ID, { runId }));
  }

  /** Run ids the studio asked to have digested, in order. */
  get digested(): readonly string[] {
    return this.core.digested;
  }

  /** Settle a recalling run's recall — the fake's fixed lessons, or the outcome given. */
  recall(runId: string, outcome?: RunRecallDto): void {
    this.core.recall(runId, outcome);
  }

  /** Model calls made so far, for a spec that reads progress while the run is still running. */
  exchanges(runId: string, count: number): void {
    this.core.exchanges(runId, count);
  }

  /** Finish a run with the given iterations; `'default'` is one revise-worthy iteration with a finding at the second node. */
  complete(
    runId: string,
    iterations: readonly FakeIteration[] | 'default' | 'auto' = 'default',
  ): void {
    this.core.complete(runId, iterations);
  }

  /** Record the iterations a still-running run has finished so far; it stays running. */
  progress(runId: string, iterations: readonly FakeIteration[] = []): void {
    this.core.progress(runId, iterations);
  }

  fail(runId: string, message: string): void {
    this.core.fail(runId, message);
  }

  /** The loop no longer has the run: a read of it is the real client's null. */
  forget(runId: string): void {
    this.core.forget(runId);
  }
}
