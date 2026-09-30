import { BadGatewayException, ServiceUnavailableException } from '@nestjs/common';
import type {
  ConfirmedFinding,
  CriterionEvidence,
  Decision,
  DeriveCriteriaRequest,
  DerivedCriteriaDto,
  IterationTrace,
  LlmAvailabilityDto,
  ProduceMode,
  PromptLibraryDocumentDto,
  PromptLibraryEntryDto,
  QualityRunDto,
  QualityRunStartedDto,
  StartQualityRunRequest,
  SuccessCriterion,
} from '@sysdesign/contracts';

import {
  QualityLoopClient,
  type QualityLoopHealth,
} from '../modules/quality-loop/quality-loop.client';

/** What a spec says one iteration of a finished run looked like. */
export interface FakeIteration {
  overall: number;
  decision?: Decision;
  mode?: ProduceMode | 'provided';
  /** Defaults to the request's own `output` for iteration 1 and null after. */
  artifact?: unknown;
  dimensions?: Record<string, number | null>;
  findings?: ConfirmedFinding[];
  /** Defaults to pass / partial / fail over the request's criteria, by position. */
  criteria?: CriterionEvidence[];
}

const CRITERION_RESULTS = ['pass', 'partial', 'fail'] as const;

const KIND_BY_HEADING: readonly [RegExp, string][] = [
  [/non-functional|quality/i, 'non_functional'],
  [/scale/i, 'scale'],
  [/constraint/i, 'constraint'],
  [/functional/i, 'functional'],
];

/**
 * A rubric from a markdown goal, by its own headings: one criterion per
 * bullet, numbered line or table row, kinded by the section it sits under.
 * Deterministic, so a spec can predict `c1…cN`; a goal with no lists at all
 * still yields one criterion of each kind the canvas pipeline declares.
 */
export function criteriaFromMarkdown(goal: string): SuccessCriterion[] {
  const statements: { kind: string; statement: string }[] = [];
  let kind = 'functional';
  for (const raw of goal.split('\n')) {
    const line = raw.trim();
    const heading = /^#{2,}\s+(.+)$/.exec(line);
    if (heading) {
      kind = KIND_BY_HEADING.find(([pattern]) => pattern.test(heading[1]))?.[1] ?? kind;
      continue;
    }
    const item = /^(?:\d+\.|[-*])\s+(.+)$/.exec(line);
    if (item) {
      statements.push({ kind, statement: item[1] });
      continue;
    }
    const row = /^\|(.+)\|$/.exec(line);
    if (row) {
      const cells = row[1].split('|').map((cell) => cell.trim());
      if (cells.every((cell) => /^-+$/.test(cell))) continue;
      if (/^(kind|metric)$/i.test(cells[0] ?? '')) continue;
      statements.push({ kind, statement: cells.join(' — ') });
    }
  }
  if (statements.length === 0) {
    statements.push(
      { kind: 'functional', statement: 'Do what the goal asks.' },
      { kind: 'non_functional', statement: 'Meet the stated quality target.' },
      { kind: 'constraint', statement: 'Break no stated rule.' },
    );
  }
  return statements.map((item, index) => ({
    id: `c${index + 1}`,
    kind: item.kind,
    statement: item.statement.slice(0, 300),
  }));
}

/**
 * The quality loop as the studio's specs see it: runs start `running` and
 * finish when the spec says so, rubrics come from the goal's headings, and
 * every request is kept so a spec can assert what the studio asked for.
 */
export class FakeQualityLoopClient extends QualityLoopClient {
  readonly runs = new Map<string, QualityRunDto>();
  readonly requests = new Map<string, StartQualityRunRequest>();
  readonly startRequests: StartQualityRunRequest[] = [];
  readonly criteriaRequests: DeriveCriteriaRequest[] = [];
  llm: LlmAvailabilityDto = { enabled: true, model: 'fake-model', reason: null };
  unreachable = false;
  failNextStart: Error | null = null;
  library: PromptLibraryDocumentDto[] = [
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
  ];
  private sequence = 0;

  reset(): void {
    this.sequence = 0;
    this.runs.clear();
    this.requests.clear();
    this.startRequests.length = 0;
    this.criteriaRequests.length = 0;
    this.llm = { enabled: true, model: 'fake-model', reason: null };
    this.unreachable = false;
    this.failNextStart = null;
  }

  health(): Promise<QualityLoopHealth> {
    if (this.unreachable) throw new BadGatewayException('the quality loop is unreachable: fake');
    return Promise.resolve({ status: 'ok', llm: this.llm });
  }

  deriveCriteria(request: DeriveCriteriaRequest): Promise<DerivedCriteriaDto> {
    this.criteriaRequests.push(request);
    if (!this.llm.enabled) {
      throw new ServiceUnavailableException({
        message: 'no model is available to derive criteria',
        llm: this.llm,
      });
    }
    return Promise.resolve({
      pipeline: request.pipeline,
      criteria: criteriaFromMarkdown(request.goal),
      diagnostic: null,
      llm: this.llm,
    });
  }

  startRun(request: StartQualityRunRequest): Promise<QualityRunStartedDto> {
    if (this.failNextStart) {
      const error = this.failNextStart;
      this.failNextStart = null;
      throw error;
    }
    this.startRequests.push(request);
    const runId = `fake-run-${++this.sequence}`;
    this.requests.set(runId, request);
    this.runs.set(runId, {
      runId,
      pipeline: request.pipeline,
      status: 'running',
      startedAt: '2026-09-29T00:00:00.000Z',
      finishedAt: null,
      llm: this.llm,
      request: {
        goal: request.goal,
        outputProvided: request.output !== undefined,
        criteriaProvided: request.criteria !== undefined,
        maxIterations: request.maxIterations ?? 1,
      },
      trace: null,
      exchanges: [],
      error: null,
    });
    return Promise.resolve({ runId, status: 'running' });
  }

  getRun(runId: string): Promise<QualityRunDto | null> {
    return Promise.resolve(this.runs.get(runId) ?? null);
  }

  listPrompts(): Promise<PromptLibraryEntryDto[]> {
    return Promise.resolve(this.library.map(({ id, title }) => ({ id, title })));
  }

  getPrompt(id: string): Promise<PromptLibraryDocumentDto | null> {
    return Promise.resolve(this.library.find((document) => document.id === id) ?? null);
  }

  /** Model calls made so far, for a spec that reads progress while the run is still running. */
  exchanges(runId: string, count: number): void {
    const run = this.require(runId);
    run.exchanges = Array.from({ length: count }, (_, index) => ({
      scope: 'critic.requirements.s1',
      ordinal: index + 1,
      outcome: 'ok' as const,
      durationMs: 10,
      startedAt: '2026-09-29T00:00:01.000Z',
    }));
  }

  /** Finish a run with the given iterations; `'default'` is one revise-worthy iteration with a finding at the second node. */
  complete(runId: string, iterations: readonly FakeIteration[] | 'default' = 'default'): void {
    const run = this.require(runId);
    const request = this.requests.get(runId);
    const criteria = request?.criteria ?? [];
    const specs: readonly FakeIteration[] =
      iterations === 'default'
        ? [
            {
              overall: 64,
              decision: 'revise',
              dimensions: { coverage: 70, quality_attributes: 52, compliance: 100 },
              findings: [
                {
                  key: 'unhandled_failure|node.2',
                  type: 'unhandled_failure',
                  severity: 'high',
                  confidence: 'high',
                  fixability: 'fixable_local',
                  locationRefs: ['node.2'],
                  criterionIds: criteria.length > 1 ? ['c2'] : [],
                  hits: 2,
                  lenses: ['critic.architecture', 'critic.scenarios'],
                  rationale: 'a single instance serves every read; a restart drops the target',
                  reconciledTo: null,
                },
              ],
            },
          ]
        : iterations;

    const traced: IterationTrace[] = specs.map((spec, index) => {
      const iteration = index + 1;
      const overall = spec.overall;
      const decision = spec.decision ?? (overall >= 75 ? 'accept' : 'revise');
      return {
        iteration,
        mode: spec.mode ?? (iteration === 1 ? 'provided' : 'revise'),
        artifact:
          spec.artifact !== undefined
            ? spec.artifact
            : iteration === 1
              ? (request?.output ?? null)
              : null,
        locations: [],
        rendered: null,
        validation: [],
        critics: [],
        evaluators: [],
        ledger: {
          artifactPresent: true,
          validation: [],
          criteria:
            spec.criteria ??
            criteria.map((criterion, position) => ({
              criterionId: criterion.id,
              kind: criterion.kind,
              result: CRITERION_RESULTS[Math.min(position, CRITERION_RESULTS.length - 1)],
              hits: 2,
              confidence: 'high' as const,
              locationRefs: [],
            })),
          findings: spec.findings ?? [],
          discarded: [],
          diagnostics: [],
        },
        decision: {
          finalDecision: decision,
          gates: {
            artifactPresent: true,
            validatorsPassed: true,
            evidenceSufficient: true,
            policyAllowed: true,
          },
          scores: { dimensions: spec.dimensions ?? { coverage: overall }, overall },
          selectedRemediations: [],
          reason: 'fake',
          trace: { steps: [], dimensions: [], weightSum: 1, weightedTotal: overall },
        },
        remediations: [],
        durationMs: 0,
      };
    });

    let best = 0;
    traced.forEach((it, index) => {
      if (it.decision.scores.overall > traced[best].decision.scores.overall) best = index;
    });
    const last = traced[traced.length - 1];
    run.status = 'complete';
    run.finishedAt = '2026-09-29T00:01:00.000Z';
    run.trace = {
      pipeline: { id: run.pipeline, version: 'fake' },
      contract: { goal: run.request.goal, criteria },
      iterations: traced,
      bestIteration: best + 1,
      finalDecision: last.decision.finalDecision,
      stopReason: last.decision.finalDecision === 'accept' ? 'accepted' : 'max-iterations',
      lessons: [],
    };
  }

  fail(runId: string, message: string): void {
    const run = this.require(runId);
    run.status = 'failed';
    run.finishedAt = '2026-09-29T00:01:00.000Z';
    run.error = { name: 'Error', message, stack: null };
  }

  private require(runId: string): QualityRunDto {
    const run = this.runs.get(runId);
    if (!run) throw new Error(`fake quality loop has no run ${runId}`);
    return run;
  }
}
