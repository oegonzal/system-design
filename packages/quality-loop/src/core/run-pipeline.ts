/**
 * The loop: derive the contract, then per iteration produce (or adopt),
 * validate, judge, normalize, decide — and either act on the decision or stop
 * with a reason the runner owns. `finalDecision` says what the artifact
 * deserves next; `stopReason` says why the loop ended. Both are recorded.
 */
import type { LlmClient } from '@sysdesign/llm';

import type {
  CriticReport,
  EvaluationReport,
  IterationTrace,
  LensOutcome,
  ProduceMode,
  Remediation,
  RemediationNote,
  RunTrace,
  StopReason,
  TaskContract,
  ValidationReport,
} from './contracts';
import { decide } from './decide';
import { deriveLessons } from './lessons';
import { materialize } from './materialize';
import { admitRefs, findingKey, normalize } from './normalize';
import { validatePipeline, type PipelineDefinition } from './pipeline';
import type { ExchangeSink, LensContext, Stages } from './ports';
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

    let critics: LensOutcome<CriticReport>[] = [];
    let evaluators: LensOutcome<EvaluationReport>[] = [];
    if (lensesRun) {
      const ctx: LensContext<T> = {
        contract,
        artifact: artifact as T,
        locations,
        rendered: task.output.render(artifact as T),
        validation,
      };
      const units: (() => Promise<LensResult>)[] = [
        ...stages.critics.map((critic) => async (): Promise<LensResult> => ({
          critic: await critic.run(ctx),
        })),
        ...stages.evaluators.map((evaluator) => async (): Promise<LensResult> => ({
          evaluator: await evaluator.run(ctx),
        })),
      ];
      const results = await mapConcurrent(units, policy.loop.concurrency, (run) => run());
      critics = results.flatMap((result) => result.critic ?? []);
      evaluators = results.flatMap((result) => result.evaluator ?? []);
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
    const decision = decide(ledger, policy);
    const remediations = hydrate(
      decision.selectedRemediations,
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

/**
 * Attach the lenses' own words to what the policy selected. The runner does
 * this join, not the policy: prose reaches the producer, never the decision.
 */
function hydrate<T>(
  selected: readonly Remediation[],
  contract: TaskContract<T>,
  critics: readonly LensOutcome<CriticReport>[],
  evaluators: readonly LensOutcome<EvaluationReport>[],
  validation: readonly ValidationReport[],
  locations: readonly { id: string }[],
): RemediationNote[] {
  const known = new Set(locations.map((location) => location.id));
  const findingNotes = new Map<string, string>();
  for (const outcome of critics) {
    for (const raw of outcome.report?.findings ?? []) {
      const key = findingKey(raw.type, admitRefs(raw.locationRefs, known));
      if (!findingNotes.has(key)) findingNotes.set(key, raw.rationale);
    }
  }
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
