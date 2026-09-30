import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  buildRunRecord,
  RUN_SCHEMA_VERSION,
  toIndexRows,
  writeRunRecord,
  type RunInput,
} from './persist';
import type { SourcedFinding } from './evaluator';

const finding = (over: Partial<SourcedFinding> = {}): SourcedFinding => ({
  severity: 'medium',
  file: 'a.ts',
  category: 'duplication',
  evidence: 'e',
  problem: 'p',
  recommendation: 'r',
  source: 'architecture',
  ...over,
});

const input = (over: Partial<RunInput> = {}): RunInput => ({
  runId: 'run-1',
  startedAt: Date.parse('2026-08-27T10:00:00.000Z'),
  finishedAt: Date.parse('2026-08-27T10:00:41.000Z'),
  profile: 'quick',
  model: 'haiku',
  budgetUsd: 0.25,
  scope: { kind: 'staged' },
  filesReviewed: ['a.ts'],
  filesOmitted: [],
  diffBudgetChars: 50_000,
  intentSource: 'commits',
  decision: 'warn',
  summary: 's',
  findings: [
    finding(),
    finding({ severity: 'high', source: 'rules/theme-guard', category: 'branding' }),
    finding({ severity: 'low' }),
  ],
  dropped: ['one dropped'],
  critics: [{ critic: 'readability', ok: true, findingCount: 2 }],
  costUsd: 0.0574,
  files: ['a.ts', 'b.ts'],
  diffChars: 1234,
  truncated: false,
  evaluatorRan: false,
  ci: { isCi: false },
  ...over,
});

/**
 * These records are what a future reader analyses, so their shape is a contract
 * rather than an implementation detail — a silently renamed field would make an
 * accumulated history unreadable.
 */
describe('buildRunRecord', () => {
  it('stamps a schema version so old records stay identifiable', () => {
    expect(buildRunRecord(input()).schemaVersion).toBe(RUN_SCHEMA_VERSION);
  });

  it('records durations and timestamps in a portable form', () => {
    const record = buildRunRecord(input());
    expect(record.durationMs).toBe(41_000);
    expect(record.startedAt).toBe('2026-08-27T10:00:00.000Z');
    expect(record.finishedAt).toBe('2026-08-27T10:00:41.000Z');
  });

  it('pre-computes severity counts, so a trend needs no re-parsing of findings', () => {
    expect(buildRunRecord(input()).counts).toEqual({
      total: 3,
      high: 1,
      medium: 1,
      low: 1,
      fromRules: 1,
      dropped: 1,
      omittedFiles: 0,
    });
  });

  /** The question the split answers: are the rules or the critics catching? */
  it('counts rule findings by their source prefix', () => {
    const record = buildRunRecord(
      input({
        findings: [
          finding({ source: 'rules/boundaries' }),
          finding({ source: 'rules/file-size' }),
          finding({ source: 'testability' }),
        ],
      }),
    );
    expect(record.counts.fromRules).toBe(2);
  });

  it('carries the critics-skipped reason so a rules-only run is legible later', () => {
    const record = buildRunRecord(
      input({
        criticsSkipped: 'critics skipped: found no subscription login — deterministic rules only',
      }),
    );
    expect(record.criticsSkipped).toContain('critics skipped');
  });

  it('captures the git context needed to tie a run to a commit', () => {
    const record = buildRunRecord(input());
    expect(record.git).toHaveProperty('branch');
    expect(record.git).toHaveProperty('headSha');
  });
});

describe('toIndexRows', () => {
  it('emits one flat row per finding', () => {
    const rows = toIndexRows(buildRunRecord(input())).map((r) => JSON.parse(r));
    expect(rows).toHaveLength(3);
    expect(rows[0].finding.severity).toBe('medium');
    expect(rows[0].finding.source).toBe('architecture');
    expect(rows[1].finding.source).toBe('rules/theme-guard');
    expect(rows[0].decision).toBe('warn');
    expect(rows[0].runId).toBe('run-1');
  });

  it('still emits a row for a clean run, so passes appear in the history too', () => {
    const rows = toIndexRows(buildRunRecord(input({ findings: [], decision: 'pass' }))).map((r) =>
      JSON.parse(r),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].finding).toBeNull();
    expect(rows[0].decision).toBe('pass');
  });

  it('produces one JSON object per line, with no embedded newlines', () => {
    for (const row of toIndexRows(buildRunRecord(input()))) {
      expect(row).not.toContain('\n');
      expect(() => JSON.parse(row)).not.toThrow();
    }
  });
});

describe('writeRunRecord', () => {
  it('writes the record and appends to the index without overwriting it', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cr-runs-'));

    writeRunRecord(buildRunRecord(input({ runId: 'first' })), dir);
    const second = writeRunRecord(buildRunRecord(input({ runId: 'second' })), dir);

    expect(JSON.parse(readFileSync(join(dir, 'first.json'), 'utf8')).runId).toBe('first');
    expect(JSON.parse(readFileSync(second.recordPath, 'utf8')).runId).toBe('second');

    const lines = readFileSync(second.indexPath, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(6); // three findings per run, two runs
    expect(lines.map((l) => JSON.parse(l).runId)).toContain('first');
  });
});
