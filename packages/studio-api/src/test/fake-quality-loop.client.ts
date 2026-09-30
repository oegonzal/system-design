import { BadGatewayException, ServiceUnavailableException } from '@nestjs/common';
import type {
  DeriveCriteriaRequest,
  DerivedCriteriaDto,
  LlmModelDto,
  PromptLibraryDocumentDto,
  PromptLibraryEntryDto,
  QualityRunDto,
  QualityRunStartedDto,
  StartQualityRunRequest,
} from '@sysdesign/contracts';
import {
  DerivationFailed,
  FakeLoop,
  LoopRefused,
  LoopUnreachable,
  type FakeIteration,
  type RunScenario,
} from '@sysdesign/studio-testing';

import {
  QualityLoopClient,
  type QualityLoopHealth,
} from '../modules/quality-loop/quality-loop.client';

/**
 * The quality loop as the studio's specs see it: `@sysdesign/studio-testing`'s
 * fake loop behind the client port. Runs start `running` and finish when the
 * spec says so, rubrics come from the goal's headings, and every request is
 * kept so a spec can assert what the studio asked for. This adapter owns only
 * the mapping of the fake's typed errors onto the exceptions the real HTTP
 * client would raise.
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

  health(): Promise<QualityLoopHealth> {
    return this.answer(() => this.core.health());
  }

  deriveCriteria(request: DeriveCriteriaRequest): Promise<DerivedCriteriaDto> {
    return this.answer(() => this.core.deriveCriteria(request));
  }

  startRun(request: StartQualityRunRequest): Promise<QualityRunStartedDto> {
    return this.answer(() => this.core.startRun(request));
  }

  getRun(runId: string): Promise<QualityRunDto | null> {
    return this.answer(() => this.core.getRun(runId));
  }

  listPrompts(): Promise<PromptLibraryEntryDto[]> {
    return this.answer(() => this.core.listPrompts());
  }

  getPrompt(id: string): Promise<PromptLibraryDocumentDto | null> {
    return this.answer(() => this.core.getPrompt(id));
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

  fail(runId: string, message: string): void {
    this.core.fail(runId, message);
  }

  /** The fake's typed errors as the real client's exceptions; anything else is the spec's own. */
  private answer<T>(call: () => T): Promise<T> {
    try {
      return Promise.resolve(call());
    } catch (error) {
      if (error instanceof LoopUnreachable) {
        throw new BadGatewayException(error.message);
      }
      if (error instanceof DerivationFailed) {
        throw new ServiceUnavailableException({
          message: error.message,
          llm: error.llm,
          diagnostic: error.diagnostic,
        });
      }
      if (error instanceof LoopRefused) {
        throw new BadGatewayException(`the quality loop refused: ${error.status} ${error.message}`);
      }
      throw error;
    }
  }
}
