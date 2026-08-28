import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

import type { CriticName } from './critics';
import type { Decision, SourcedFinding } from './evaluator';

const REPO_ROOT = join(__dirname, '../..');

/**
 * Bump when a field changes meaning or is removed, so a later reader can tell
 * old records from new ones instead of guessing.
 */
export const RUN_SCHEMA_VERSION = 1;

export const DEFAULT_RUNS_DIR = join(REPO_ROOT, '.code-review', 'runs');

export interface CriticOutcome {
  critic: CriticName;
  ok: boolean;
  findingCount: number;
  error?: string;
}

export interface RunInput {
  runId: string;
  startedAt: number;
  finishedAt: number;
  profile: string;
  model: string;
  budgetUsd: number;
  scope: { kind: string; ref?: string; mergeBase?: string };
  decision: Decision;
  summary: string;
  /** Rule findings and critic findings, merged; `source` says which is which. */
  findings: SourcedFinding[];
  dropped: string[];
  critics: CriticOutcome[];
  /** Present when the critics did not run at all, with the reason. */
  criticsSkipped?: string;
  costUsd: number;
  files: string[];
  /** Files whose diff actually reached the critics. */
  filesReviewed: string[];
  filesOmitted: string[];
  diffChars: number;
  diffBudgetChars: number;
  intentSource: 'env' | 'commits' | 'none';
  truncated: boolean;
  evaluatorRan: boolean;
}

export interface RunRecord extends Omit<RunInput, 'startedAt' | 'finishedAt'> {
  schemaVersion: number;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  git: { branch: string; headSha: string; headSubject: string };
  ci: { isCi: boolean; provider?: string; runId?: string; ref?: string };
  counts: {
    total: number;
    high: number;
    medium: number;
    low: number;
    fromRules: number;
    dropped: number;
    omittedFiles: number;
  };
}

/**
 * Pure: everything that lands on disk is decided here.
 *
 * Kept separate from the write so the record's shape can be tested without
 * touching the filesystem — this is the artifact future analysis reads, so its
 * shape is the contract, not an implementation detail.
 */
export function buildRunRecord(input: RunInput): RunRecord {
  const { startedAt, finishedAt, ...rest } = input;

  const counts = {
    total: input.findings.length,
    high: input.findings.filter((f) => f.severity === 'high').length,
    medium: input.findings.filter((f) => f.severity === 'medium').length,
    low: input.findings.filter((f) => f.severity === 'low').length,
    // Split out so a history can answer "are the deterministic rules or the
    // critics doing the catching?" without re-parsing every finding.
    fromRules: input.findings.filter((f) => f.source.startsWith('rules/')).length,
    dropped: input.dropped.length,
    // The completeness question a single run cannot answer: are our reviews
    // getting less complete over time?
    omittedFiles: input.filesOmitted.length,
  };

  return {
    schemaVersion: RUN_SCHEMA_VERSION,
    ...rest,
    startedAt: new Date(startedAt).toISOString(),
    finishedAt: new Date(finishedAt).toISOString(),
    durationMs: finishedAt - startedAt,
    git: readGit(),
    ci: readCi(),
    counts,
  };
}

/**
 * One row per finding, flattened — the shape you actually want when asking
 * "which categories recur?" or "is the medium count trending up?" across runs.
 */
export function toIndexRows(record: RunRecord): string[] {
  const base = {
    runId: record.runId,
    at: record.finishedAt,
    profile: record.profile,
    decision: record.decision,
    branch: record.git.branch,
    headSha: record.git.headSha,
    costUsd: record.costUsd,
    durationMs: record.durationMs,
    filesReviewed: record.files.length,
  };

  if (record.findings.length === 0) {
    return [JSON.stringify({ ...base, finding: null })];
  }

  return record.findings.map((f) =>
    JSON.stringify({
      ...base,
      finding: {
        source: f.source,
        severity: f.severity,
        category: f.category,
        file: f.file,
        line: f.line ?? null,
        problem: f.problem,
      },
    }),
  );
}

export interface WriteResult {
  recordPath: string;
  indexPath: string;
}

/**
 * Writes the full record, appends the flattened rows, and returns both paths.
 *
 * Two formats on purpose: the per-run JSON keeps every detail including evidence
 * and recommendations, while `index.jsonl` is one flat row per finding so a
 * whole history can be scanned with `jq` without opening each file.
 */
export function writeRunRecord(record: RunRecord, runsDir = DEFAULT_RUNS_DIR): WriteResult {
  mkdirSync(runsDir, { recursive: true });

  const recordPath = join(runsDir, `${record.runId}.json`);
  writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`);

  const indexPath = join(runsDir, 'index.jsonl');
  appendFileSync(indexPath, `${toIndexRows(record).join('\n')}\n`);

  return { recordPath, indexPath };
}

/** Sortable and unique: an ISO-ish stamp plus a short random suffix. */
export function makeRunId(now: number, random: () => number = Math.random): string {
  const stamp = new Date(now).toISOString().replace(/[:.]/g, '-').replace('Z', '');
  const suffix = Math.floor(random() * 0xffffff)
    .toString(16)
    .padStart(6, '0');
  return `${stamp}-${suffix}`;
}

function readGit(): RunRecord['git'] {
  const run = (args: string[]): string => {
    try {
      return execFileSync('git', args, {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
    } catch {
      return '';
    }
  };

  return {
    branch: run(['rev-parse', '--abbrev-ref', 'HEAD']),
    headSha: run(['rev-parse', 'HEAD']),
    headSubject: run(['log', '-1', '--format=%s']),
  };
}

function readCi(): RunRecord['ci'] {
  const env = process.env;
  if (env['GITHUB_ACTIONS'] === 'true') {
    return {
      isCi: true,
      provider: 'github-actions',
      runId: env['GITHUB_RUN_ID'],
      ref: env['GITHUB_REF'],
    };
  }
  return { isCi: Boolean(env['CI']) };
}
