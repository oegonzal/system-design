import { appendFileSync, writeFileSync } from 'node:fs';

import { makeRunStamp } from '@sysdesign/run-dump';

import { criticGate, defaultRuntime, ReviewUnavailableError, subscriptionProblem } from './claude';
import { loadReviewConfig } from './config';
import { buildReviewContext } from './context';
import { runCriticPass, SKIPPED_PASS } from './critic-pass';
import { decide, defaultSummary, mergeFindings, worseOf } from './evaluator';
import { readChangedFile } from './git-scope';
import { runRules, type ChangedFile } from './rules/index';
import { buildRunRecord, writeRunRecord } from './persist';
import { toMarkdown, toTerminal, type ReviewOutcome } from './report';

/**
 * One review, start to end: the change's context, the deterministic rules,
 * the critics when they can run, the verdict, and the record every completed
 * run leaves. Each part lives in its own module; this file is their order.
 */
async function main(): Promise<number> {
  const startedAt = Date.now();
  const runId = makeRunStamp(startedAt);
  // The one read of argv and the environment; everything below receives it.
  const config = loadReviewConfig();
  const { scope, profile, settings, markdownOut, runsDir, record } = config;
  const runtime = defaultRuntime(config.claudeEnv);

  // The recorded runs carry `diffBudgetChars`, so a sweep of the override is
  // readable afterwards.
  const context = buildReviewContext(scope, {
    budgetChars: settings.diffBudgetChars,
    maxFileChars: settings.maxFileChars,
    intentOverride: config.intent,
  });

  if (context.allFiles.length === 0) {
    console.log('\n  ✓ code review: PASS  nothing to review\n');
    return 0;
  }

  /**
   * The deterministic rules, before anything that needs a network.
   *
   * Every changed file is read once, at the review's scope, and the same
   * snapshot goes to every rule — so a rules-only run (no login, fork PR,
   * offline laptop) is the same computation CI performs, minus the critics.
   */
  const changed: ChangedFile[] = context.allFiles.map((file) => ({
    file,
    content: readChangedFile(scope, file),
  }));
  const ruleFindings = runRules(changed);

  // A fork PR has no secrets, and a laptop may not be logged in. Failing there
  // would be indistinguishable from finding a real problem, so the review says
  // plainly that the critics did not look and lets the rules decide the exit
  // code alone. Only the reviewable-files check is free, so it goes first.
  const criticsSkipped = criticGate({
    reviewableFiles: context.files.length,
    subscriptionProblem:
      context.files.length === 0 ? undefined : await subscriptionProblem(runtime),
  });

  if (criticsSkipped) console.log(`\n  – ${criticsSkipped}\n`);
  const critics = criticsSkipped
    ? SKIPPED_PASS
    : await runCriticPass({ context, settings, runtime, evidenceGuard: config.evidenceGuard });

  const findings = mergeFindings(ruleFindings, critics.findings);

  // A partial review cannot claim the change is clean: a critic that never ran
  // may have been the one to object. Blocking findings still fail; otherwise
  // the best available answer is "warn", never "pass". A *skipped* critic pass
  // is different: it is the documented rules-only mode, and the exit code then
  // reflects exactly what the rules found.
  const incomplete =
    !criticsSkipped && (critics.failed.length > 0 || critics.mapWarnings.length > 0);
  const decision = incomplete ? worseOf(decide(findings), 'warn') : decide(findings);

  const summaryText = critics.summary ?? defaultSummary(findings);

  const outcome: ReviewOutcome = {
    decision,
    summary:
      critics.failed.length > 0
        ? `${summaryText} (incomplete: ${critics.failed.length} pass(es) did not run)`
        : critics.mapWarnings.length > 0
          ? `${summaryText} (incomplete: the repository map was unavailable)`
          : summaryText,
    findings,
    dropped: [
      ...context.warnings,
      ...critics.mapWarnings,
      ...critics.dropped,
      ...critics.failed.map((f) => `critic did not run — ${f}`),
      ...(criticsSkipped ? [criticsSkipped] : []),
    ],
    costUsd: critics.costUsd,
    filesReviewed: criticsSkipped ? 0 : context.packed.included.length,
    filesChanged: context.files.length,
    filesOmitted: criticsSkipped ? [] : context.packed.omitted,
    truncated: context.truncated,
  };

  console.log(toTerminal(outcome));

  const markdown = toMarkdown(outcome);
  if (markdownOut) writeFileSync(markdownOut, markdown);
  if (config.stepSummaryPath) {
    appendFileSync(config.stepSummaryPath, `${markdown}\n`);
  }

  // Every completed run leaves a record, whatever the verdict — a history of
  // passes is what makes a rise in findings visible later.
  if (record) {
    const written = writeRunRecord(
      buildRunRecord({
        runId,
        startedAt,
        finishedAt: Date.now(),
        profile,
        model: settings.model,
        budgetUsd: settings.budgetUsd,
        scope: {
          kind: scope.kind,
          ref: scope.kind === 'base' ? scope.ref : undefined,
          mergeBase: context.base,
        },
        decision: outcome.decision,
        summary: outcome.summary,
        findings,
        dropped: outcome.dropped,
        critics: [...critics.outcomes],
        criticsSkipped,
        costUsd: critics.costUsd,
        files: context.files,
        filesReviewed: criticsSkipped ? [] : context.packed.included,
        filesOmitted: criticsSkipped ? [] : context.packed.omitted,
        diffChars: context.packed.diff.length,
        diffBudgetChars: context.packed.budgetChars,
        intentSource: context.intent.source,
        truncated: context.truncated,
        evaluatorRan: critics.evaluatorRan,
        ci: config.ci,
      }),
      runsDir,
    );
    console.log(`  run recorded: ${written.recordPath}\n`);
  }

  return outcome.decision === 'fail' ? 1 : 0;
}

// Guarded so the module can be imported for testing without launching a review.
if (require.main === module) {
  main()
    .then((code) => process.exit(code))
    .catch((error: unknown) => {
      // "We could not afford to review this" is not "this code is bad", so a
      // budget or timeout stop reports and stands aside rather than refusing
      // the change.
      if (error instanceof ReviewUnavailableError) {
        console.log(`\n  – code review not run: ${error.message}\n`);
        process.exit(0);
      }
      console.error(`\n  ✗ code review could not run: ${(error as Error).message}\n`);
      process.exit(1);
    });
}
