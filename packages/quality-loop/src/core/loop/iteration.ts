/**
 * One iteration of the loop: produce or adopt, validate, judge, normalise,
 * decide — each a named step over what the one before established, timed end
 * to end. The loop driver decides what to do with the result.
 */
import type {
  ArtifactLocation,
  Diagnostic,
  EvidenceLedger,
  IterationTrace,
  ProduceMode,
  QualityControlDecision,
  RemediationNote,
  ValidationReport,
} from '@sysdesign/contracts';

import { annotate, noteRemediations } from '../evidence/annotate';
import { normalize } from '../evidence/normalize';
import { emptyUpstream } from '../ports';
import { LENSES_STAGE, overrunDiagnostic, PRODUCER_STAGE, stageDiagnostic } from '../stages/shared';
import { refusalsOf, setbacksOf } from './briefing';
import type { Loop } from './run-pipeline';
import { runLensWaves, type Judged } from './waves';

/** The artifact against the validators, and what the lenses may read of it: nothing when it is absent or blocked. */
interface Checked<T> {
  artifact: T | null;
  validation: ValidationReport[];
  locations: ArtifactLocation[];
  rendered: string | null;
  blocked: boolean;
  judgeable: boolean;
}

/** Produce, validate, judge, normalize, decide — one iteration, timed end to end. */
export async function runIteration<T>(
  loop: Loop<T>,
  iteration: number,
  mode: ProduceMode | 'provided',
  best: IterationTrace<T> | null,
  previous: IterationTrace<T> | null,
): Promise<IterationTrace<T>> {
  const startedAt = loop.now();
  const produced = await produceOrAdopt(loop, mode, best, previous);
  const checked = validateArtifact(loop, produced.artifact);
  const { judged, diagnostic } = await judge(loop, checked);
  const diagnostics = [
    ...loop.baseDiagnostics,
    ...produced.diagnostics,
    ...(diagnostic === null ? [] : [diagnostic]),
  ];
  return {
    iteration,
    mode,
    artifact: checked.artifact,
    locations: checked.locations,
    rendered: checked.rendered,
    validation: checked.validation,
    ...judged,
    ...decide(loop, checked, judged, diagnostics),
    durationMs: loop.now() - startedAt,
  };
}

/**
 * Iteration 1 adopts a provided artifact exactly as handed in; every other
 * iteration asks the producer, and what it produced passes through the
 * output shape's `normalize` (when declared) before any validator sees it —
 * the normalized value is what the lenses judge and the trace stores. What
 * the producer reports comes back as diagnostics: why it answered nothing,
 * and one `overrun` per field it wrote past the size it was asked for.
 */
async function produceOrAdopt<T>(
  loop: Loop<T>,
  mode: ProduceMode | 'provided',
  best: IterationTrace<T> | null,
  previous: IterationTrace<T> | null,
): Promise<{ artifact: T | null; diagnostics: Diagnostic[] }> {
  if (mode === 'provided') return { artifact: loop.input.output as T, diagnostics: [] };
  const produced = await loop.stages.producer.produce({
    contract: loop.contract,
    mode,
    prior: mode === 'revise' ? (best?.artifact ?? null) : null,
    remediations: best?.remediations ?? [],
    refusals: refusalsOf(previous, best),
    setbacks: setbacksOf(previous, best),
    memories: loop.input.memories ?? [],
  });
  const { output } = loop.definition.task;
  const artifact =
    produced.output !== null && output.normalize
      ? output.normalize(produced.output, loop.contract)
      : produced.output;
  return {
    artifact,
    diagnostics: [
      ...(produced.diagnostic ? [produced.diagnostic] : []),
      ...produced.overruns.map((overrun) => overrunDiagnostic(PRODUCER_STAGE, overrun)),
    ],
  };
}

/** Every validator over the artifact; a blocking problem keeps it from the lenses, and an absent artifact has nothing to check. */
function validateArtifact<T>(loop: Loop<T>, artifact: T | null): Checked<T> {
  const { stages, contract } = loop;
  const { task } = loop.definition;
  const validation =
    artifact === null
      ? []
      : stages.validators.map((validator) => validator.validate(artifact, contract));
  const blocked = validation.some(
    (report) => report.gate === 'block' && report.problems.length > 0,
  );
  const judgeable = artifact !== null && !blocked;
  return {
    artifact,
    validation,
    locations: judgeable ? task.output.locate(artifact as T) : [],
    rendered: judgeable ? task.output.render(artifact as T) : null,
    blocked,
    judgeable,
  };
}

const notApplicableDetail = (artifact: unknown, blocked: boolean): string =>
  artifact === null ? 'no artifact' : blocked ? 'blocked by a validator' : 'no criteria derived';

/** The lenses over a judgeable artifact with criteria to judge it by; otherwise the one diagnostic that says why they did not run. */
async function judge<T>(
  loop: Loop<T>,
  checked: Checked<T>,
): Promise<{ judged: Judged; diagnostic: Diagnostic | null }> {
  const { stages, contract } = loop;
  if (!checked.judgeable || contract.criteria.length === 0) {
    return {
      judged: { critics: [], evaluators: [] },
      diagnostic: stageDiagnostic(
        LENSES_STAGE,
        'not-applicable',
        notApplicableDetail(checked.artifact, checked.blocked),
      ),
    };
  }
  const judged = await runLensWaves(
    stages,
    {
      contract,
      artifact: checked.artifact as T,
      locations: checked.locations,
      rendered: checked.rendered ?? '',
      validation: checked.validation,
      upstream: emptyUpstream(),
    },
    loop.definition.policy,
  );
  return { judged, diagnostic: null };
}

/**
 * The ledger the evidence normalises to, the controller's decision on it, and
 * the remediations the next ask is handed. The words ride on the ledger for
 * readers of the trace; the controller decides on the structural fields
 * beside them and never reads prose.
 */
function decide<T>(
  loop: Loop<T>,
  checked: Checked<T>,
  judged: Judged,
  diagnostics: Diagnostic[],
): { ledger: EvidenceLedger; decision: QualityControlDecision; remediations: RemediationNote[] } {
  const { stages, contract } = loop;
  const { policy } = loop.definition;
  const confirmed = normalize(
    {
      contract,
      artifactPresent: checked.artifact !== null,
      locations: checked.locations,
      validation: checked.validation,
      critics: judged.critics,
      evaluators: judged.evaluators,
      diagnostics,
    },
    policy,
  );
  const judgedLedger = {
    ...confirmed,
    findings: annotate(confirmed.findings, judged.critics, checked.locations),
  };
  // The engine corrects what the judges found from facts the goal declares,
  // before the controller sees it — a stop the page cannot be showing, say.
  // A pipeline that declares no pass hands its ledger through unchanged.
  const ledger =
    loop.definition.refoundEvidence?.(judgedLedger, contract.goal, policy) ?? judgedLedger;
  const decision = stages.controller.decide(ledger, policy);
  const remediations = noteRemediations(
    decision.selectedRemediations,
    ledger.findings,
    contract,
    judged.evaluators,
    checked.validation,
  );
  return { ledger, decision, remediations };
}
