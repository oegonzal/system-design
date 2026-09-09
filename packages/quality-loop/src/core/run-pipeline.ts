/**
 * The loop: derive the contract, then per iteration produce (or adopt),
 * validate, judge, normalize, decide — and either act on the decision or stop
 * with a reason the runner owns. `finalDecision` says what the artifact
 * deserves next; `stopReason` says why the loop ended. Both are recorded.
 */
import type {
  ConfirmedFinding,
  CriticReport,
  EvaluationReport,
  IterationTrace,
  LensOutcome,
  ProduceMode,
  Remediation,
  RemediationNote,
  RunTrace,
  StopReason,
  ValidationReport,
} from '@sysdesign/contracts';
import type { LlmClient } from '@sysdesign/llm';

import type { TaskContract } from './contracts';
import { deriveLessons } from './lessons';
import { materialize } from './materialize';
import { admitRefs, normalize, sameDefect } from './normalize';
import { validatePipeline, type PipelineDefinition } from './pipeline';
import {
  emptyUpstream,
  type AnnotatedFinding,
  type Critic,
  type Evaluator,
  type ExchangeSink,
  type LensContext,
  type Stages,
} from './ports';
import { mapConcurrent } from './scoped-llm';
import { diagnostic, LENSES_STAGE } from './stages/shared';

export interface RunInput {
  goal: string;
  /** A supplied artifact to judge; iteration 1 adopts it instead of producing. */
  output?: unknown;
  maxIterations?: number;
}

export interface RunDeps {
  llm: LlmClient;
  sink: ExchangeSink;
  now: () => number;
}

export async function runPipeline<T>(
  definition: PipelineDefinition<T>,
  input: RunInput,
  deps: RunDeps,
): Promise<RunTrace<T>> {
  validatePipeline(definition as PipelineDefinition<unknown>);
  return runLoop(materialize(definition, deps.llm, deps.sink), definition, input, deps.now);
}

type LensResult =
  | { critic: LensOutcome<CriticReport>[]; evaluator?: undefined }
  | { evaluator: LensOutcome<EvaluationReport>[]; critic?: undefined };

export async function runLoop<T>(
  stages: Stages<T>,
  definition: PipelineDefinition<T>,
  input: RunInput,
  now: () => number,
): Promise<RunTrace<T>> {
  const { policy, task } = definition;
  const maxIterations = Math.max(1, input.maxIterations ?? policy.loop.maxIterations);

  const derived = await stages.deriveCriteria(input.goal);
  const contract: TaskContract<T> = { ...task, goal: input.goal, criteria: derived.criteria ?? [] };
  const baseDiagnostics = derived.diagnostic ? [derived.diagnostic] : [];

  const iterations: IterationTrace<T>[] = [];
  let best: IterationTrace<T> | null = null;
  let stalled = 0;
  let mode: ProduceMode | 'provided' = input.output !== undefined ? 'provided' : 'initial';
  let stop: StopReason | null = null;

  for (let iteration = 1; iteration <= maxIterations && stop === null; iteration++) {
    const startedAt = now();
    const diagnostics = [...baseDiagnostics];

    let artifact: T | null = null;
    if (mode === 'provided') {
      artifact = input.output as T;
    } else {
      const produced = await stages.producer.produce({
        contract,
        mode,
        prior: mode === 'revise' ? (best?.artifact ?? null) : null,
        remediations: best?.remediations ?? [],
      });
      artifact = produced.output;
      if (produced.diagnostic) diagnostics.push(produced.diagnostic);
    }

    const validation =
      artifact === null
        ? []
        : stages.validators.map((validator) => validator.validate(artifact as T, contract));
    const blocked = validation.some(
      (report) => report.gate === 'block' && report.problems.length > 0,
    );
    const lensesRun = artifact !== null && !blocked && contract.criteria.length > 0;
    const locations = artifact !== null && !blocked ? task.output.locate(artifact) : [];
    const rendered = artifact !== null && !blocked ? task.output.render(artifact) : null;

    let critics: LensOutcome<CriticReport>[] = [];
    let evaluators: LensOutcome<EvaluationReport>[] = [];
    if (lensesRun) {
      const ctx: LensContext<T> = {
        contract,
        artifact: artifact as T,
        locations,
        rendered: rendered ?? '',
        validation,
        upstream: emptyUpstream(),
      };
      // Two waves, by declaration. Lenses that consume nothing judge the
      // artifact alone; what the normaliser CONFIRMS from them is what the
      // second wave is shown. The deterministic normaliser is the boundary
      // between tiers — a downstream lens never sees a raw report.
      const first = await runWave(
        stages.critics.filter((lens) => lens.consumes.length === 0),
        stages.evaluators.filter((lens) => lens.consumes.length === 0),
        ctx,
        policy.loop.concurrency,
      );
      critics = first.critics;
      evaluators = first.evaluators;
      const laterCritics = stages.critics.filter((lens) => lens.consumes.length > 0);
      const laterEvaluators = stages.evaluators.filter((lens) => lens.consumes.length > 0);
      if (laterCritics.length + laterEvaluators.length > 0) {
        const confirmed = normalize(
          {
            contract,
            artifactPresent: true,
            locations,
            validation,
            critics,
            evaluators,
            diagnostics: [],
          },
          policy,
        );
        const second = await runWave(
          laterCritics,
          laterEvaluators,
          {
            ...ctx,
            upstream: {
              findings: annotate(confirmed.findings, critics, locations),
              results: confirmed.criteria.filter((evidence) => evidence.result !== 'unassessed'),
            },
          },
          policy.loop.concurrency,
        );
        critics = [...critics, ...second.critics];
        evaluators = [...evaluators, ...second.evaluators];
      }
    } else {
      diagnostics.push(
        diagnostic(
          LENSES_STAGE,
          null,
          'not-applicable',
          artifact === null
            ? 'no artifact'
            : blocked
              ? 'blocked by a validator'
              : 'no criteria derived',
        ),
      );
    }

    const ledger = normalize(
      {
        contract,
        artifactPresent: artifact !== null,
        locations,
        validation,
        critics,
        evaluators,
        diagnostics,
      },
      policy,
    );
    const decision = stages.controller.decide(ledger, policy);
    const remediations = hydrate(
      decision.selectedRemediations,
      ledger.findings,
      contract,
      critics,
      evaluators,
      validation,
      locations,
    );
    const entry: IterationTrace<T> = {
      iteration,
      mode,
      artifact,
      locations,
      rendered,
      validation,
      critics,
      evaluators,
      ledger,
      decision,
      remediations,
      durationMs: now() - startedAt,
    };
    iterations.push(entry);

    // The strict-better gate: a revision keeps the crown only by beating it.
    if (best === null || decision.scores.overall > best.decision.scores.overall) {
      best = entry;
      stalled = 0;
    } else {
      stalled += 1;
    }

    switch (decision.finalDecision) {
      case 'accept':
        stop = 'accepted';
        break;
      case 'reject':
        stop = 'rejected';
        break;
      case 'escalate':
        stop = 'escalated';
        break;
      default:
        if (!stages.producer.enabled) stop = 'producer-unavailable';
        else if (stalled >= policy.loop.plateauAfter) stop = 'plateau';
        else if (iteration === maxIterations) stop = 'max-iterations';
        else mode = decision.finalDecision;
    }
  }

  const last = iterations[iterations.length - 1];
  return {
    pipeline: { id: definition.id, version: definition.version },
    contract: { goal: input.goal, criteria: contract.criteria },
    iterations,
    bestIteration: (best ?? last).iteration,
    finalDecision: last.decision.finalDecision,
    stopReason: stop ?? 'max-iterations',
    lessons: deriveLessons(iterations),
  };
}

/** One wave of lenses, concurrently, results in declaration order. */
async function runWave<T>(
  critics: readonly Critic<T>[],
  evaluators: readonly Evaluator<T>[],
  ctx: LensContext<T>,
  concurrency: number,
): Promise<{ critics: LensOutcome<CriticReport>[]; evaluators: LensOutcome<EvaluationReport>[] }> {
  const units: (() => Promise<LensResult>)[] = [
    ...critics.map((critic) => async (): Promise<LensResult> => ({
      critic: await critic.run(ctx),
    })),
    ...evaluators.map((evaluator) => async (): Promise<LensResult> => ({
      evaluator: await evaluator.run(ctx),
    })),
  ];
  const results = await mapConcurrent(units, concurrency, (run) => run());
  return {
    critics: results.flatMap((result) => result.critic ?? []),
    evaluators: results.flatMap((result) => result.evaluator ?? []),
  };
}

/**
 * Each confirmed finding with the first sentence a critic gave for it. A
 * confirmed finding groups raw ones, so its key is no longer any single raw
 * finding's key: match by membership. Prose for a model, never for a decision.
 */
export function annotate(
  confirmed: readonly ConfirmedFinding[],
  critics: readonly LensOutcome<CriticReport>[],
  locations: readonly { id: string }[],
): AnnotatedFinding[] {
  const known = new Set(locations.map((location) => location.id));
  const raws = critics.flatMap((outcome) =>
    (outcome.report?.findings ?? []).map((raw) => ({
      type: raw.type,
      locationRefs: admitRefs(raw.locationRefs, known),
      rationale: raw.rationale,
    })),
  );
  return confirmed.map((finding) => ({
    ...finding,
    rationale: raws.find((raw) => sameDefect(finding, raw))?.rationale ?? null,
  }));
}

/**
 * Attach the lenses' own words to what the policy selected. The runner does
 * this join, not the policy: prose reaches the producer, never the decision.
 */
function hydrate<T>(
  selected: readonly Remediation[],
  confirmed: readonly ConfirmedFinding[],
  contract: TaskContract<T>,
  critics: readonly LensOutcome<CriticReport>[],
  evaluators: readonly LensOutcome<EvaluationReport>[],
  validation: readonly ValidationReport[],
  locations: readonly { id: string }[],
): RemediationNote[] {
  const findingNotes = new Map(
    annotate(confirmed, critics, locations).flatMap((finding) =>
      finding.rationale === null ? [] : [[finding.key, finding.rationale] as const],
    ),
  );
  const criterionNotes = new Map<string, string>();
  for (const outcome of evaluators) {
    for (const raw of outcome.report?.results ?? []) {
      if (!criterionNotes.has(raw.criterionId)) criterionNotes.set(raw.criterionId, raw.rationale);
    }
  }
  const statements = new Map(
    contract.criteria.map((criterion) => [criterion.id, criterion.statement]),
  );
  const validatorNotes = new Map(
    validation.map((report) => [
      report.validatorId,
      report.problems.map((problem) => problem.message).join('; '),
    ]),
  );

  return selected.map((remediation) => {
    const { subject } = remediation;
    const note =
      'finding' in subject
        ? (findingNotes.get(subject.finding) ?? subject.finding)
        : 'criterion' in subject
          ? `${statements.get(subject.criterion) ?? subject.criterion}: ${criterionNotes.get(subject.criterion) ?? 'not met'}`
          : (validatorNotes.get(subject.validator) ?? subject.validator);
    return { ...remediation, note };
  });
}
