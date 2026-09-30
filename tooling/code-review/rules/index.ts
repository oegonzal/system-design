import type { Finding } from '../policy';
import { ruleSource, type SourcedFinding } from '../evaluator';
import { boundaries } from './boundaries';
import { fileSize } from './file-size';
import { exportSurface } from './export-surface';
import { themeGuard } from './theme-guard';

/**
 * The deterministic rules engine.
 *
 * These run on every review, whether or not the critics can reach Claude Code,
 * and their findings enter the pipeline ahead of the critics'. Each rule is a pure function over
 * the changed files' *content* — not the diff — because the properties they
 * check (import direction, file length, barrel width, forbidden vocabulary)
 * are properties of the file as it will be committed, and a rule that only
 * looked at added lines would pass a file that was already in violation.
 *
 * A rule never calls out to git, the filesystem or the network: `review.ts`
 * reads every changed file once, at the review's scope (the index for a staged
 * run, HEAD for a branch run), and hands the same snapshot to every rule. That
 * is what makes the whole engine testable from string fixtures.
 */
export interface ChangedFile {
  /** Repo-relative path. */
  file: string;
  /** The content at the review's scope; undefined when the blob is unreadable. */
  content: string | undefined;
}

export type Rule = (files: readonly ChangedFile[]) => Finding[];

export const RULE_NAMES = ['boundaries', 'file-size', 'export-surface', 'theme-guard'] as const;

export type RuleName = (typeof RULE_NAMES)[number];

export const RULES: Record<RuleName, Rule> = {
  boundaries,
  'file-size': fileSize,
  'export-surface': exportSurface,
  'theme-guard': themeGuard,
};

/**
 * Runs every rule and stamps each finding with `rules/<name>`.
 *
 * No allSettled here, deliberately: a rule is repo-owned deterministic code,
 * so an exception in one is a bug to fix, not a condition to degrade around —
 * swallowing it would turn a broken tripwire into a permanently green one.
 */
export function runRules(files: readonly ChangedFile[]): SourcedFinding[] {
  return RULE_NAMES.flatMap((name) =>
    RULES[name](files).map((finding) => ({ ...finding, source: ruleSource(name) })),
  );
}
