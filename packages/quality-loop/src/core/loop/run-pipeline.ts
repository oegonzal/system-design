/**
 * The loop: derive the contract, then per iteration produce (or adopt),
 * validate, judge, normalize, decide — and either act on the decision or stop
 * with a reason the runner owns. `finalDecision` says what the artifact
 * deserves next; `stopReason` says why the loop ended. Both are recorded.
 *
 * A produce that answers nothing costs its iteration, never the run: the
 * controller still decides it — no artifact, so it escalates, on the record —
 * and the loop asks again in the same mode from the best, told what the
 * schema refused. A run that ends on a lost produce — it lost more than its
 * policy allows (`loop.lostProduces`), or had no iteration left to ask in —
 * stops `produce-lost`. A produce that was judged and did not beat the best
 * leaves the best standing, and the next ask is told what its judges found.
 */
import type {
  Diagnostic,
  IterationMode,
  IterationTrace,
  ProduceMode,
  RunTrace,
  StopReason,
  SuccessCriterion,
} from '@sysdesign/contracts';
import type { LlmClient } from '@sysdesign/llm';

import type { RunProgress, TaskContract } from '../contracts';
import { validatePipeline, type PipelineDefinition } from '../pipeline';
import type { AdvisoryMemory, DerivedCriteria, ExchangeSink, Stages } from '../ports';
import { rubricOverruns } from '../stages/derive-criteria';
import { CRITERIA_STAGE, overrunDiagnostic } from '../stages/shared';
import { lostProduce } from './briefing';
import { runIteration } from './iteration';
import { materialize } from './materialize';
import { beats, progressOf } from './progress';
import { rubricProblems } from './rubric';

export interface RunInput {
  goal: string;
  /** A supplied artifact to judge; iteration 1 takes it as provided instead of producing. */
  output?: unknown;
  maxIterations?: number;
  /** A fixed rubric; when present the derive-criteria stage is not called. */
  criteria?: readonly SuccessCriterion[];
  /**
   * A recorded iteration of an earlier run, taken verbatim as iteration 1 in
   * mode `adopted` — no stage runs for it — and gone on from. Resolved by the
   * service (same pipeline and version, equal rubric), never by the loop.
   */
  adopted?: IterationTrace;
  /**
   * Advisory lessons for the producer alone, on every call it makes. Refused
   * unless the pipeline's producer declares it consumes `memories`; never
   * shown to the deriver or a lens, and never part of the contract.
   */
  memories?: readonly AdvisoryMemory[];
}

/**
 * Called once per finished iteration, in order, with the run so far — the
 * extension point a host publishes progress through while the loop is still
 * running. Synchronous on purpose: the loop never waits on what the host does
 * with it, and a host that writes somewhere slow queues the write itself.
 */
export type IterationListener = (progress: RunProgress) => void;

export interface RunDeps {
  llm: LlmClient;
  sink: ExchangeSink;
  now: () => number;
  onIteration?: IterationListener;
}

export async function runPipeline<T>(
  definition: PipelineDefinition<T>,
  input: RunInput,
  deps: RunDeps,
): Promise<RunTrace<T>> {
  validatePipeline(definition as PipelineDefinition<unknown>);
  const problems = input.criteria ? rubricProblems(input.criteria, definition.task) : [];
  if (problems.length > 0) {
    throw new Error(`pipeline ${definition.id}: rubric rejected: ${problems.join('; ')}`);
  }
  if ((input.memories?.length ?? 0) > 0 && !definition.producer.consumes.includes('memories')) {
    throw new Error(`pipeline ${definition.id}: its producer does not consume memories`);
  }
  return runLoop(
    materialize(definition, deps.llm, deps.sink),
    definition,
    input,
    deps.now,
    deps.onIteration,
  );
}

/** Everything one iteration reads and never changes: the stages, the contract, the request. */
export interface Loop<T> {
  stages: Stages<T>;
  definition: PipelineDefinition<T>;
  contract: TaskContract<T>;
  input: RunInput;
  /** What deriving the contract reported; every iteration starts from it. */
  baseDiagnostics: readonly Diagnostic[];
  now: () => number;
}

export async function runLoop<T>(
  stages: Stages<T>,
  definition: PipelineDefinition<T>,
  input: RunInput,
  now: () => number,
  onIteration?: IterationListener,
): Promise<RunTrace<T>> {
  const { policy, task } = definition;
  const maxIterations = Math.max(1, input.maxIterations ?? policy.loop.maxIterations);

  const derived = await deriveOrAdopt(stages, task, input);
  const contract: TaskContract<T> = { ...task, goal: input.goal, criteria: derived.criteria ?? [] };
  const loop: Loop<T> = {
    stages,
    definition,
    contract,
    input,
    baseDiagnostics: [
      ...(derived.diagnostic ? [derived.diagnostic] : []),
      ...derived.overruns.map((overrun) => overrunDiagnostic(CRITERIA_STAGE, overrun)),
    ],
    now,
  };

  const head = {
    pipeline: { id: definition.id, version: definition.version },
    contract: { goal: input.goal, criteria: contract.criteria },
  };
  const iterations: IterationTrace<T>[] = [];
  let standing: RunProgress<T> | null = null;
  let best: IterationTrace<T> | null = null;
  let stalled = 0;
  let mode: IterationMode =
    input.adopted !== undefined ? 'adopted' : input.output !== undefined ? 'provided' : 'initial';
  let stop: StopReason | null = null;
  let lost = 0;

  for (let iteration = 1; iteration <= maxIterations && stop === null; iteration++) {
    const previous = iterations[iterations.length - 1] ?? null;
    const entry: IterationTrace<T> =
      mode === 'adopted'
        ? adoptIteration(input.adopted as IterationTrace<T>, iteration)
        : await runIteration(loop, iteration, mode, best, previous);
    iterations.push(entry);

    const produceLost = lostProduce(entry);
    if (produceLost) lost += 1;
    // A lost produce never beats a best with an artifact, and was no revision that failed to improve.
    if (beats(entry, best)) {
      best = entry;
      stalled = 0;
    } else if (!produceLost) {
      stalled += 1;
    }
    standing = progressOf(head, iterations);
    if (standing !== null) onIteration?.(standing);

    const budget = { last: iteration === maxIterations };
    const next = produceLost
      ? afterLostProduce(entry, lost, policy.loop.lostProduces, budget)
      : afterDecision(entry, stages, policy.loop.plateauAfter, stalled, budget);
    if ('stop' in next) stop = next.stop;
    else mode = next.mode;
  }

  // The budget is at least one iteration, so the loop always stands somewhere.
  if (standing === null) throw new Error(`pipeline ${definition.id}: no iteration ran`);
  // What every listener was handed last, plus why the loop stopped.
  return { ...standing, stopReason: stop ?? 'max-iterations' };
}

/**
 * A supplied rubric is used verbatim — its ids are what the caller cites
 * across runs — so the deriver is never asked. Its statements are measured
 * against the bound the deriver writes within, as a derived one is: past the
 * target is an overrun on the record (past the longest its deriver can return
 * it was refused before the run started).
 */
function deriveOrAdopt<T>(
  stages: Stages<T>,
  task: PipelineDefinition<T>['task'],
  input: RunInput,
): Promise<DerivedCriteria> {
  return input.criteria !== undefined
    ? Promise.resolve({
        criteria: input.criteria.map((criterion) => ({ ...criterion })),
        diagnostic: null,
        overruns: rubricOverruns(input.criteria, task),
      })
    : stages.deriveCriteria(input.goal);
}

/**
 * A recorded iteration taken as this run's own: ledger, decision,
 * remediations and locations verbatim, renumbered, in mode `adopted`. The
 * loop then goes on exactly as it would from a decision it made itself.
 */
const adoptIteration = <T>(source: IterationTrace<T>, iteration: number): IterationTrace<T> => ({
  ...structuredClone(source),
  iteration,
  mode: 'adopted',
});

/**
 * A lost produce goes round again in the same mode — from the best, which it
 * left unchanged — while the run has produce calls to lose and an iteration
 * to ask in. Otherwise the run ends on the lost produce, and says so:
 * `produce-lost`, whichever of the two ran out.
 */
function afterLostProduce<T>(
  entry: IterationTrace<T>,
  lost: number,
  lostProduces: number,
  budget: { last: boolean },
): { stop: StopReason } | { mode: ProduceMode } {
  return lost > lostProduces || budget.last
    ? { stop: 'produce-lost' }
    : { mode: entry.mode as ProduceMode };
}

/**
 * What the decision means for the loop: a terminal decision stops it with
 * its reason; otherwise the loop stops for a reason of its own — a plateau,
 * the budget — or goes round again in the mode decided.
 */
function afterDecision<T>(
  entry: IterationTrace<T>,
  stages: Stages<T>,
  plateauAfter: number,
  stalled: number,
  budget: { last: boolean },
): { stop: StopReason } | { mode: ProduceMode } {
  switch (entry.decision.finalDecision) {
    case 'accept':
      return { stop: 'accepted' };
    case 'reject':
      return { stop: 'rejected' };
    case 'escalate':
      return { stop: 'escalated' };
    default:
      if (stalled >= plateauAfter) return { stop: 'plateau' };
      if (budget.last) return { stop: 'max-iterations' };
      return { mode: entry.decision.finalDecision };
  }
}
