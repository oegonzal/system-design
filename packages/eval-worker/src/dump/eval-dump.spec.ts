import { describe, expect, it } from 'vitest';

import type { LlmCall } from '@sysdesign/llm';

import { aggregate } from '../engine/core/aggregator';
import type { EvidenceArtifact } from '../engine/core/artifacts';
import { DEFAULT_PROFILE } from '../engine/profiles/default.profile';
import { flashSaleFacts, graph, node } from '../engine/testing';
import { capText, describeError, jsonSafe, makeRunId, MAX_TEXT_BYTES } from '@sysdesign/run-dump';

import { buildEvalDump, startEvalDump, type EvalDumpState } from './eval-dump';

const NOW = Date.parse('2026-09-01T07:20:05.880Z');

function call(overrides: Partial<LlmCall> = {}): LlmCall {
  return {
    model: 'claude-test',
    system: 'You are a critic.',
    user: 'Review this design.',
    schema: { type: 'object' },
    maxTokens: 4096,
    startedAt: '2026-09-01T07:20:06.000Z',
    durationMs: 1200,
    outcome: 'ok',
    stopReason: 'end_turn',
    usage: { inputTokens: 100, outputTokens: 50 },
    requestId: 'req_1',
    text: '{"ok":true}',
    response: { ok: true },
    error: null,
    ...overrides,
  };
}

function dumpFor(seed: (dump: ReturnType<typeof startEvalDump>) => void): EvalDumpState {
  const dump = startEvalDump({
    runId: makeRunId(NOW, 'eval', () => 0.5),
    jobId: 'job-1',
    now: NOW,
    llm: { enabled: true, model: 'claude-test', reason: null },
    git: { branch: 'main', headSha: 'abc123' },
  });
  seed(dump);
  return dump.state;
}

function inputs() {
  const canvas = graph([node('n-1', 'client')], []);
  return {
    revisionId: 'rev-1',
    revisionNumber: 1,
    sessionId: 'ses-1',
    promptId: 'pr-1',
    prompt: { id: 'pr-1', title: 'Flash sale' },
    graph: canvas,
    narrative: 'The client calls the service.',
    brief: null,
    facts: flashSaleFacts(),
    profile: DEFAULT_PROFILE,
    engineVersion: '1.0.0',
  };
}

const pathsOf = (state: EvalDumpState) =>
  buildEvalDump(state, NOW + 900).files.map((file) => file.path);

describe('buildEvalDump', () => {
  it('lays out inputs, passes, exchanges, artifacts and scoring', () => {
    const artifacts: EvidenceArtifact[] = [
      { passId: 'rules.core', kind: 'findings', findings: [] },
    ];
    const state = dumpFor((dump) => {
      dump.inputs(inputs());
      dump.passes.beginPass('llm.critic', 'llm', {});
      dump.record(call());
      dump.passes.endPass('llm.critic', [], 1200);
      dump.outcome({ artifacts, result: aggregate(artifacts, DEFAULT_PROFILE) });
      dump.persisted({ evaluationId: 'ev-1', findingCount: 0 });
    });

    expect(pathsOf(state)).toEqual([
      'manifest.json',
      'run.md',
      '01-prompt.json',
      '02-submission.json',
      '03-facts.json',
      '04-profile.json',
      '05-passes.json',
      '06-llm/01.llm.critic.1.system.txt',
      '06-llm/01.llm.critic.1.user.txt',
      '06-llm/01.llm.critic.1.response.json',
      '06-llm/01.llm.critic.1.meta.json',
      '07-artifacts.json',
      '08-scoring.json',
      '09-result.json',
    ]);
  });

  it('attributes each call to the pass whose window was open', () => {
    const state = dumpFor((dump) => {
      dump.passes.beginPass('llm.critic', 'llm', {});
      dump.record(call());
      dump.passes.endPass('llm.critic', [], 10);
      dump.passes.beginPass('llm.depth', 'llm', {});
      dump.record(call());
      dump.record(call());
      dump.passes.endPass('llm.depth', [], 20);
    });

    expect(state.exchanges.map((e) => `${e.scope}#${e.ordinal}`)).toEqual([
      'llm.critic#1',
      'llm.depth#1',
      'llm.depth#2',
    ]);
  });

  it('writes prompts as text, so the tree is greppable', () => {
    const state = dumpFor((dump) => {
      dump.passes.beginPass('llm.critic', 'llm', {});
      dump.record(call({ system: 'You are a critic.', user: 'Review this.' }));
      dump.passes.endPass('llm.critic', [], 10);
    });

    const files = buildEvalDump(state, NOW + 900).files;
    const system = files.find((file) => file.path.endsWith('.system.txt'));
    // Verbatim — not a JSON string with escaped newlines.
    expect(system?.content).toBe('You are a critic.');
  });

  it('keeps the artifacts mode enforcement dropped, which the diagnostic only counts', () => {
    const rejected: EvidenceArtifact = { passId: 'llm.depth', kind: 'findings', findings: [] };
    const state = dumpFor((dump) => {
      dump.passes.beginPass('llm.depth', 'llm', { weight: 2 });
      dump.passes.endPass('llm.depth', [rejected], 30);
    });

    expect(state.passes[0]).toMatchObject({
      passId: 'llm.depth',
      mode: 'llm',
      options: { weight: 2 },
      durationMs: 30,
      produced: ['findings'],
    });
    expect(state.passes[0]?.rejected).toEqual([rejected]);
  });

  /** The path the old design could not report on at all. */
  it('builds a dump for a run that threw, naming the phase it died in', () => {
    const state = dumpFor((dump) => {
      dump.inputs(inputs());
      dump.failed(new Error('connection terminated'));
    });

    const built = buildEvalDump(state, NOW + 400);
    const manifest = JSON.parse(
      built.files.find((file) => file.path === 'manifest.json')?.content ?? '{}',
    );
    expect(manifest.status).toBe('failed');
    expect(manifest.phase).toBe('evaluating');
    expect(manifest.error.message).toBe('connection terminated');
    // The inputs survive, which is the whole point of dumping a failure.
    expect(built.files.map((f) => f.path)).toContain('02-submission.json');
    expect(JSON.parse(built.indexRow).status).toBe('failed');
  });

  it('is honest that a deterministic run has nothing to capture', () => {
    const dump = startEvalDump({
      runId: makeRunId(NOW, 'eval', () => 0.5),
      jobId: 'job-1',
      now: NOW,
      llm: { enabled: false, model: null, reason: 'deterministic' },
      git: { branch: 'main', headSha: 'abc' },
    });
    dump.inputs(inputs());

    const built = buildEvalDump(dump.state, NOW + 100);
    expect(built.files.some((file) => file.path.startsWith('06-llm/'))).toBe(false);

    const readme = built.files.find((file) => file.path === 'run.md')?.content ?? '';
    expect(readme).toContain('the model is off (deterministic)');
    expect(readme).toContain('deterministic ledger above is complete');
  });

  it('emits exactly one index line per run', () => {
    const state = dumpFor((dump) => dump.inputs(inputs()));
    const row = buildEvalDump(state, NOW + 100).indexRow;
    expect(row.endsWith('\n')).toBe(true);
    expect(row.trimEnd().split('\n')).toHaveLength(1);
    expect(JSON.parse(row)).toMatchObject({ kind: 'eval', promptId: 'pr-1' });
  });

  it('never records anything derived from the API key', () => {
    const state = dumpFor((dump) => dump.inputs(inputs()));
    const whole = buildEvalDump(state, NOW + 100)
      .files.map((file) => file.content)
      .join('\n');
    expect(whole).not.toMatch(/ANTHROPIC|apiKey|api_key|sk-/i);
  });
});
