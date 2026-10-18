/**
 * Builders the register-memory specs share, over the sample transcript the
 * register-digest specs digest. Pure helpers only — no vitest imports — so the
 * file compiles under the app tsconfig.
 *
 * Two ways to a register-digest run:
 * - `digestRun`, the real pipeline under a fake model, for what the engine
 *   itself records — answered from `judgedClean`, the canned answers of a
 *   digest the engine judges clean, or from what a spec hands it;
 * - `digestTrace`, one iteration built from the ledger facts a spec sets,
 *   every lens the pipeline declares answering both its samples unless the
 *   spec gives it another fate.
 */
import type {
  CriticReport,
  DiagnosticReason,
  EvaluationReport,
  LensOutcome,
  RunTrace,
  SuccessCriterion,
} from '@sysdesign/contracts';
import type { LlmClient } from '@sysdesign/llm';

import { runPipeline } from '../../core/loop/run-pipeline';
import { REGISTER_DIGEST } from '../../pipelines/register-digest/definition';
import { REGISTER_DIGEST_ID } from '../../pipelines/register-digest/input';
import { registerDigestOutput, type RegisterDigest } from '../../pipelines/register-digest/output';
import { registerDigestGoal, sampleRegisterDigest } from '../../pipelines/register-digest/testing';
import { passed, readoutTrace, type ReadoutInput } from '../memory/testing';

/** The bar the pipeline declares. */
export const ACCEPT_AT = REGISTER_DIGEST.policy.thresholds.acceptAt;

/** What the transcript states that a listed register keeps, as the deriver words it. */
const CAPTURE = {
  kind: 'capture',
  statement:
    'Captures section.1 under semantic_fact: Dana prefers the nightly export to run at 02:00 UTC.',
};

/** The rubric the sample digest is judged against: the pipeline's fixed rules (c1–c3), then the capture criterion (c4). */
const RUBRIC: SuccessCriterion[] = [...(REGISTER_DIGEST.task.fixedCriteria ?? []), CAPTURE].map(
  (criterion, index) => ({ id: `c${index + 1}`, ...criterion }),
);

/** One criterion an evaluator judged held. */
const held = (criterionId: string) => ({
  criterionId,
  result: 'pass',
  confidence: 'high',
  locationRefs: [],
  rationale: 'as the cited sections state',
});

/** Every critic's answer when it finds nothing. */
export const CLEAN = { findings: [] };

/** The rules evaluator's answer, locked to the fixed rules (c1–c3): every one held. */
export const RULES_HELD = {
  results: RUBRIC.filter((criterion) => criterion.kind !== CAPTURE.kind).map((criterion) =>
    held(criterion.id),
  ),
  advisoryVerdict: null,
};

/** The capture evaluator's answer, locked to c4: captured. */
const CAPTURED = { results: [held('c4')], advisoryVerdict: null };

/**
 * A fake model's answers for a digest the engine judges clean — the deriver's,
 * the producer's, every critic's and both evaluators' — each tried in order
 * against the schema a stage asks with. `extra` comes before the critics' and
 * evaluators' own, so an answer only one lens's schema takes reaches that lens
 * alone; `digest` stands in for the producer's.
 */
export const judgedClean = (
  digest: RegisterDigest = sampleRegisterDigest(),
  extra: readonly unknown[] = [],
): readonly unknown[] => [{ criteria: [CAPTURE] }, digest, ...extra, CLEAN, CAPTURED, RULES_HELD];

/** The real pipeline over the sample transcript's goal, for one iteration. */
export const digestRun = (llm: LlmClient): Promise<RunTrace> =>
  runPipeline(
    REGISTER_DIGEST,
    { goal: registerDigestGoal(), maxIterations: 1 },
    { llm, sink: () => undefined, now: () => 0 },
  );

/**
 * A model that answers as `inner` does, except to the declared lens named:
 * every sample of it answers nothing, as a lens records when its model went
 * away. The lens is known by its persona, which heads every prompt it is sent.
 */
export function silentTo(lens: string, inner: LlmClient): LlmClient {
  const personas = [...REGISTER_DIGEST.critics, ...REGISTER_DIGEST.evaluators]
    .filter((spec) => spec.id === lens)
    .map((spec) => spec.persona.trim());
  return {
    model: inner.model,
    completeStructured: (request) =>
      personas.some((persona) => request.system.startsWith(persona))
        ? Promise.resolve(null)
        : inner.completeStructured(request),
  };
}

/** How one lens's samples came out: both answered, both lost, the first lost, or skipped with nothing to judge. */
type LensFate = 'answered' | 'lost' | 'one-lost' | 'not-applicable';

function outcomesOf<R>(
  lens: string,
  fate: LensFate,
  report: (sample: number) => R,
): LensOutcome<R>[] {
  const answered = (sample: number): LensOutcome<R> => ({
    report: report(sample),
    diagnostic: null,
  });
  const unanswered = (sample: number | null, reason: DiagnosticReason): LensOutcome<R> => ({
    report: null,
    diagnostic: { stage: lens, sample, reason, detail: null },
  });
  switch (fate) {
    case 'answered':
      return [answered(1), answered(2)];
    case 'lost':
      return [unanswered(1, 'llm-failed'), unanswered(2, 'llm-failed')];
    case 'one-lost':
      return [unanswered(1, 'llm-failed'), answered(2)];
    case 'not-applicable':
      return [unanswered(null, 'not-applicable')];
  }
}

interface DigestTraceInput extends Partial<
  Omit<ReadoutInput, 'pipeline' | 'goal' | 'artifact' | 'locations' | 'criteria'>
> {
  /** The fate of each lens named; every other declared lens answered both its samples. */
  lenses?: Readonly<Partial<Record<string, LensFate>>>;
}

/**
 * One iteration over the sample transcript's digest, judged against the
 * rubric: every criterion passed and the run accepted unless the spec says
 * otherwise.
 */
export function digestTrace({ lenses = {}, ...facts }: DigestTraceInput = {}): RunTrace {
  const digest = sampleRegisterDigest();
  const trace = readoutTrace({
    pipeline: REGISTER_DIGEST_ID,
    goal: registerDigestGoal(),
    artifact: digest,
    locations: registerDigestOutput.locate(digest).map((location) => location.id),
    criteria: RUBRIC,
    results: RUBRIC.map((criterion) => passed(criterion.id, criterion.kind, [])),
    ...facts,
  });
  const fateOf = (lens: string): LensFate => lenses[lens] ?? 'answered';
  const [only] = trace.iterations;
  return {
    ...trace,
    iterations: [
      {
        ...only,
        critics: REGISTER_DIGEST.critics.flatMap(({ id }) =>
          outcomesOf<CriticReport>(id, fateOf(id), (sample) => ({
            criticId: id,
            sample,
            findings: [],
          })),
        ),
        evaluators: REGISTER_DIGEST.evaluators.flatMap(({ id }) =>
          outcomesOf<EvaluationReport>(id, fateOf(id), (sample) => ({
            evaluatorId: id,
            sample,
            results: [],
            advisoryVerdict: null,
          })),
        ),
      },
    ],
  };
}
