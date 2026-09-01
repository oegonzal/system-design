import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { LlmCall } from '@sysdesign/llm';
import { findPromptRunId, makeRunId, writeDump } from '@sysdesign/run-dump';
import { afterEach, describe, expect, it } from 'vitest';

import { buildPromptDump, startPromptDump, type PromptDumpState } from './prompt-dump';

const NOW = Date.parse('2026-09-01T07:12:40.118Z');

function call(overrides: Partial<LlmCall> = {}): LlmCall {
  return {
    model: 'claude-test',
    system: 'You are a senior engineer writing prompts.',
    user: '# Scenario to rewrite\nA flash sale.',
    schema: { type: 'object' },
    maxTokens: 2048,
    startedAt: '2026-09-01T07:12:41.000Z',
    durationMs: 900,
    outcome: 'ok',
    stopReason: 'end_turn',
    usage: { inputTokens: 400, outputTokens: 300 },
    requestId: 'req_x',
    text: '{}',
    response: { scenario: 'Sharper prose.', extraFunctionalRequirements: [] },
    error: null,
    ...overrides,
  };
}

function dumpFor(seed: (dump: ReturnType<typeof startPromptDump>) => void): PromptDumpState {
  const dump = startPromptDump({
    runId: makeRunId(NOW, 'prompt', () => 0.25),
    now: NOW,
    llm: { enabled: true, model: 'claude-test', reason: null },
    git: { branch: 'main', headSha: 'abc' },
  });
  dump.request({
    experienceId: 'exp-1',
    experienceSlug: 'flash-sale',
    difficulty: 'standard',
    seed: 42,
  });
  seed(dump);
  return dump.state;
}

const dirs: string[] = [];
const tempDir = () => {
  const dir = mkdtempSync(join(tmpdir(), 'sysdesign-prompt-dump-'));
  dirs.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('buildPromptDump', () => {
  it('records the generated prompt beside the model rewrite that replaced it', () => {
    const state = dumpFor((dump) => {
      dump.generated({ title: 'Flash sale', scenario: 'Plain prose.' } as never);
      dump.record(call());
      dump.enriched({
        scenario: 'Sharper prose.',
        functionalRequirements: ['Reserve a seat'],
        llmEnriched: true,
      });
      dump.persisted({ promptId: 'pr-1', llmEnriched: true, generatorVersion: '1.0.0' });
    });

    const files = buildPromptDump(state, NOW + 1200).files;
    expect(files.map((file) => file.path)).toEqual([
      'manifest.json',
      'run.md',
      '01-request.json',
      '02-generated-prompt.json',
      '03-llm/01.prompt.enrich.system.txt',
      '03-llm/01.prompt.enrich.user.txt',
      '03-llm/01.prompt.enrich.response.json',
      '03-llm/01.prompt.enrich.meta.json',
      '04-enriched.json',
      '05-persisted-prompt.json',
    ]);

    // Both sides of the rewrite survive — the row keeps only `llmEnriched`.
    const before = files.find((file) => file.path === '02-generated-prompt.json')?.content ?? '';
    const after = files.find((file) => file.path === '04-enriched.json')?.content ?? '';
    expect(before).toContain('Plain prose.');
    expect(after).toContain('Sharper prose.');
  });

  it('carries promptId as the join key an evaluation dump can find', () => {
    const state = dumpFor((dump) =>
      dump.persisted({ promptId: 'pr-7', llmEnriched: false, generatorVersion: '1.0.0' }),
    );
    const built = buildPromptDump(state, NOW + 100);

    const dir = tempDir();
    writeDump(built, dir);
    expect(findPromptRunId('pr-7', dir)).toBe(built.runId);
    // A prompt this history never saw degrades to null rather than lying.
    expect(findPromptRunId('pr-unknown', dir)).toBeNull();
  });

  it('returns the newest run when a prompt id was generated more than once', () => {
    const dir = tempDir();
    const older = dumpFor((dump) =>
      dump.persisted({ promptId: 'pr-9', llmEnriched: false, generatorVersion: '1.0.0' }),
    );
    writeDump(buildPromptDump(older, NOW + 100), dir);

    const newer = startPromptDump({
      runId: makeRunId(NOW + 5_000, 'prompt', () => 0.9),
      now: NOW + 5_000,
      llm: { enabled: false, model: null, reason: 'deterministic' },
      git: { branch: 'main', headSha: 'abc' },
    });
    newer.persisted({ promptId: 'pr-9', llmEnriched: false, generatorVersion: '1.0.0' });
    const built = writeDump(buildPromptDump(newer.state, NOW + 5_100), dir);

    expect(findPromptRunId('pr-9', dir)).toBe(built.runDir.split('/').pop());
  });

  it('is honest that a deterministic run was never enriched', () => {
    const dump = startPromptDump({
      runId: makeRunId(NOW, 'prompt', () => 0.5),
      now: NOW,
      llm: { enabled: false, model: null, reason: 'deterministic' },
      git: { branch: 'main', headSha: 'abc' },
    });
    dump.request({
      experienceId: 'exp-1',
      experienceSlug: 'flash-sale',
      difficulty: 'standard',
      seed: 42,
    });

    const built = buildPromptDump(dump.state, NOW + 50);
    expect(built.files.some((file) => file.path.startsWith('03-llm/'))).toBe(false);
    const readme = built.files.find((file) => file.path === 'run.md')?.content ?? '';
    expect(readme).toContain('the model is off (deterministic)');
    expect(readme).toContain('reproducible case');
  });

  it('survives a run that threw before anything was generated', () => {
    const state = dumpFor((dump) => dump.failed(new Error('experience vanished')));
    const built = buildPromptDump(state, NOW + 30);

    const manifest = JSON.parse(
      built.files.find((file) => file.path === 'manifest.json')?.content ?? '{}',
    );
    expect(manifest.status).toBe('failed');
    expect(manifest.promptId).toBeNull();
    // The request that caused it is still on the record.
    expect(manifest.seed).toBe(42);
  });

  it('emits one flat index line and never records the API key', () => {
    const state = dumpFor((dump) =>
      dump.persisted({ promptId: 'pr-1', llmEnriched: false, generatorVersion: '1.0.0' }),
    );
    const built = buildPromptDump(state, NOW + 10);

    expect(built.indexRow.trimEnd().split('\n')).toHaveLength(1);
    expect(JSON.parse(built.indexRow)).toMatchObject({ kind: 'prompt', promptId: 'pr-1' });
    expect(built.files.map((file) => file.content).join('\n')).not.toMatch(
      /ANTHROPIC|apiKey|api_key|sk-/i,
    );
  });
});
