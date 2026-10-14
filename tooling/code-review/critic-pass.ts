import { readSchema, runClaude, type ClaudeRuntime } from './claude';
import type { EvidenceGuard } from './config';
import type { ReviewContext } from './context';
import { CRITICS, type CriticName, type ProfileSettings } from './critics';
import type { SourcedFinding } from './evaluator';
import type { CriticOutcome } from './persist';
import { sanitise, type CriticReport, type Finding } from './policy';
import { criticPrompt, criticSchemaFor, evaluatorPrompt, systemPrompt } from './prompts';
import { buildRepoMap, type RepoMap } from './repo-map';

/** One critic's run, named: its report, or why there is none. */
type CriticRun = { name: CriticName; report: CriticReport } | { name: CriticName; error: string };

interface EvaluationRef {
  critic: CriticName;
  finding: number;
  reason: string;
}

interface Evaluation {
  blockingFindings: EvaluationRef[];
  warnings: EvaluationRef[];
  /** Surviving `low` findings. Without this channel they would be silently lost. */
  informational: EvaluationRef[];
  summary: string;
}

export interface CriticPassInput {
  context: ReviewContext;
  settings: ProfileSettings;
  runtime: ClaudeRuntime;
  /**
   * `warn` by default (see `config.ts`), deliberately.
   *
   * Dropping a true finding is worse than keeping an unsupported one: the
   * developer never learns the pipeline had something to say, and the record
   * shows a clean pass. In `warn` the line is still recorded, so a matcher
   * regression is diagnosable from run history before the guard is enforced.
   */
  evidenceGuard: EvidenceGuard;
  /**
   * Built once and passed to every critic, not built per critic: the default
   * spawns `nx show project` per project, and building it three times would be
   * two dozen subprocesses.
   */
  buildMap?: () => RepoMap;
}

/** What the critics and the evaluator left: their findings, and how each pass went. */
export interface CriticPass {
  findings: readonly SourcedFinding[];
  outcomes: readonly CriticOutcome[];
  /** Every pass that did not run, as `name: why`. */
  failed: readonly string[];
  /** Why the critics went without the repository map, when they did. */
  mapWarnings: readonly string[];
  /** What the sanitiser and the reference check dropped, each with its reason. */
  dropped: readonly string[];
  evaluatorRan: boolean;
  costUsd: number;
  summary?: string;
}

/** The pass of a rules-only review: nothing ran, so nothing was found or spent. */
export const SKIPPED_PASS: CriticPass = {
  findings: [],
  outcomes: [],
  failed: [],
  mapWarnings: [],
  dropped: [],
  evaluatorRan: false,
  costUsd: 0,
};

/**
 * The model's part of a review: every critic over the same prompt, then — when
 * there is something to reconcile — the evaluator over their findings. A map
 * that cannot be built degrades the review rather than blocking the commit.
 */
export async function runCriticPass(input: CriticPassInput): Promise<CriticPass> {
  const { buildMap = buildRepoMap } = input;
  const mapWarnings: string[] = [];
  let repoMap: RepoMap | undefined;
  try {
    repoMap = buildMap();
  } catch (err) {
    mapWarnings.push(`repository map unavailable — ${(err as Error).message}`);
  }

  const { reports, ...critics } = await runCritics(input, repoMap);
  const pass: CriticPass = { ...critics, mapWarnings, evaluatorRan: false };

  // With one critic there is nothing to deduplicate or reconcile, so the
  // second call would be pure cost. The deterministic evaluator decides
  // alone.
  const worthReconciling = input.settings.critics.length > 1 && pass.findings.length > 0;
  return worthReconciling ? reconcile(pass, reports, input) : pass;
}

/** What the critics said, before the evaluator reconciles it. */
interface CriticsAnswered extends Omit<CriticPass, 'mapWarnings' | 'evaluatorRan' | 'summary'> {
  reports: CriticReport[];
}

async function runCritics(
  { context, settings, runtime, evidenceGuard }: CriticPassInput,
  repoMap: RepoMap | undefined,
): Promise<CriticsAnswered> {
  const intentAvailable = context.intent.text.length > 0;
  const prompt = criticPrompt(context, repoMap);
  const dropped: string[] = [];
  let costUsd = 0;

  const runCritic = async (name: CriticName): Promise<CriticReport> => {
    const { data, costUsd: cost } = await runClaude<CriticReport>(
      {
        systemPrompt: systemPrompt(CRITICS[name].promptFile),
        userPrompt: prompt,
        schema: criticSchemaFor(name, intentAvailable),
        model: settings.model,
        budgetUsd: settings.budgetUsd,
        timeoutMs: settings.timeoutMs,
      },
      runtime,
    );
    costUsd += cost;
    const clean = sanitise(
      { ...data, critic: name },
      {
        reviewedFiles: context.packed.included,
        changedFiles: context.files,
        // The corpus is the whole prompt, not just the diff: the
        // architecture critic is told to ground itself in the repo map.
        prompt,
        intentAvailable,
        evidenceGuard,
      },
    );
    dropped.push(...clean.dropped);
    return clean.report;
  };

  // Every critic answers, whatever another does: each catches its own
  // failure and reports it under its name. Left to reject, the first critic
  // to fail would throw away every other critic's findings with it, and —
  // with the top-level handler treating a budget stop as exit 0 — a review
  // that had already found a blocking issue would report nothing and go green.
  const runs = await Promise.all(
    settings.critics.map(async (name): Promise<CriticRun> => {
      try {
        return { name, report: await runCritic(name) };
      } catch (error) {
        return { name, error: (error as Error).message };
      }
    }),
  );

  const reports = runs.flatMap((run) => ('report' in run ? [run.report] : []));
  return {
    reports,
    findings: reports.flatMap((report) =>
      report.findings.map((finding) => ({ ...finding, source: report.critic })),
    ),
    outcomes: runs.map((run) =>
      'report' in run
        ? { critic: run.name, ok: true, findingCount: run.report.findings.length }
        : { critic: run.name, ok: false, findingCount: 0, error: run.error },
    ),
    failed: runs.flatMap((run) => ('error' in run ? [`${run.name}: ${run.error}`] : [])),
    dropped,
    costUsd,
  };
}

/**
 * The evaluator's call: the critics' findings deduplicated and reconciled.
 * Rule findings never enter it — a deterministic check being argued away by a
 * model would make the rules engine advisory.
 */
async function reconcile(
  pass: CriticPass,
  reports: CriticReport[],
  { context, settings, runtime }: CriticPassInput,
): Promise<CriticPass> {
  try {
    const evaluation = await runClaude<Evaluation>(
      {
        systemPrompt: systemPrompt('evaluator.md'),
        userPrompt: evaluatorPrompt(context, reports),
        schema: readSchema('schemas/evaluation.schema.json'),
        model: settings.model,
        budgetUsd: settings.budgetUsd,
        timeoutMs: settings.timeoutMs,
      },
      runtime,
    );
    const resolved = resolveReferences(evaluation.data, reports);
    return {
      ...pass,
      findings: resolved.kept,
      dropped: [...pass.dropped, ...resolved.dropped],
      evaluatorRan: true,
      costUsd: pass.costUsd + evaluation.costUsd,
      summary: evaluation.data.summary || undefined,
    };
  } catch (error) {
    // The critics already produced findings; losing the dedupe pass must
    // not lose them. Unreconciled findings plus a warning beat a clean lie.
    return { ...pass, failed: [...pass.failed, `evaluator: ${(error as Error).message}`] };
  }
}

/**
 * Maps the evaluator's references back onto real critic findings.
 *
 * This is where "the evaluator must not introduce new findings" stops being an
 * instruction and becomes a property: the evaluator returns *indices*, and
 * anything that does not resolve to a finding it was actually given is dropped
 * by this code rather than trusted to be absent.
 */
export function resolveReferences(
  evaluation: Evaluation,
  reports: CriticReport[],
): { kept: SourcedFinding[]; dropped: string[] } {
  const dropped: string[] = [];
  const byCritic = new Map(reports.map((r) => [r.critic, r.findings]));
  const kept: SourcedFinding[] = [];
  const seen = new Set<string>();

  for (const ref of [
    ...evaluation.blockingFindings,
    ...evaluation.warnings,
    ...(evaluation.informational ?? []),
  ]) {
    const finding: Finding | undefined = byCritic.get(ref.critic)?.[ref.finding];
    if (!finding) {
      dropped.push(
        `evaluator: referenced a finding that does not exist — ${ref.critic}#${ref.finding}`,
      );
      continue;
    }
    const key = `${ref.critic}#${ref.finding}`;
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push({ ...finding, source: ref.critic });
  }

  return { kept, dropped };
}
