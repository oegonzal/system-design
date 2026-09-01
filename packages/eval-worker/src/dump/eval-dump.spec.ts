import type Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it, vi } from 'vitest';

import { AnthropicLlmClient, asRecordable, type LlmCall } from '@sysdesign/llm';
import { makeRunId } from '@sysdesign/run-dump';

import { aggregate } from '../engine/core/aggregator';
import type { EvidenceArtifact } from '../engine/core/artifacts';
import { runEvaluation } from '../engine/core/orchestrator';
import { createPassRegistry } from '../engine/passes';
import { DEFAULT_PROFILE } from '../engine/profiles/default.profile';
import { flashSaleFacts, graph, node } from '../engine/testing';

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

/**
 * The whole chain, wired as production wires it: a real `AnthropicLlmClient`
 * over a fake transport, scoped by the orchestrator, collected by the dump.
 *
 * Every other spec here hand-feeds `dump.record`. This one proves the seam
 * actually closes — that a prompt a pass assembled reaches a file on the way
 * out, attributed to the pass that assembled it.
 */
describe('the capture chain, end to end', () => {
  function transport(): Anthropic {
    return {
      messages: {
        parse: vi.fn(async (request: { system: string }) => ({
          stop_reason: 'end_turn',
          usage: { input_tokens: 900, output_tokens: 120 },
          content: [{ type: 'text', text: '{}' }],
          // Every LLM pass tolerates a schema miss, so one canned shape is
          // enough: what is under test is the capture, not the critique.
          parsed_output: null,
          _request_id: `req_${request.system.length}`,
        })),
      },
    } as unknown as Anthropic;
  }

  it('carries a real pass prompt into a dump file, attributed to its pass', async () => {
    const dump = startEvalDump({
      runId: makeRunId(NOW, 'eval', () => 0.5),
      jobId: 'job-1',
      now: NOW,
      llm: { enabled: true, model: 'claude-test', reason: null },
      git: { branch: 'main', headSha: 'abc' },
    });

    const base = new AnthropicLlmClient({ client: transport(), model: 'claude-test' });
    const llm = asRecordable(base)?.withRecorder(dump.record);
    expect(llm).toBeDefined();

    const canvas = graph([node('n-1', 'client'), node('n-2', 'service'), node('n-3', 'database')]);
    // A narrative is required for the fourth pass to reach the model at all —
    // without one it returns before assembling a prompt, like a disabled client.
    const narrative = 'The client calls the service, which writes to the database.';
    dump.inputs({ ...inputs(), graph: canvas, narrative });
    const run = await runEvaluation({
      graph: canvas,
      facts: flashSaleFacts(),
      narrative,
      llm: llm!,
      profile: DEFAULT_PROFILE,
      registry: createPassRegistry(),
      recorder: dump.passes,
    });
    dump.outcome({ artifacts: run.artifacts, result: run.result });

    // One call per enabled LLM pass, each attributed without any pass having
    // declared its own name to the client.
    expect(dump.state.exchanges.map((exchange) => exchange.scope)).toEqual([
      'llm.critic',
      'llm.depth',
      'llm.narrative',
      'llm.scenarios',
    ]);

    const files = buildEvalDump(dump.state, NOW + 500).files;
    const criticUser = files.find((file) => file.path === '06-llm/01.llm.critic.1.user.txt');
    // The serialized design the critic was actually shown — the thing that was
    // unrecoverable before, and the reason these land as text.
    expect(criticUser?.content).toContain('n-3');

    const meta = JSON.parse(
      files.find((file) => file.path === '06-llm/01.llm.critic.1.meta.json')?.content ?? '{}',
    );
    expect(meta).toMatchObject({
      scope: 'llm.critic',
      model: 'claude-test',
      stopReason: 'end_turn',
      usage: { inputTokens: 900, outputTokens: 120 },
      // A null parse is a schema miss, not an API error — the distinction the
      // port erases and this recovers.
      outcome: 'schema-miss',
    });
    expect(meta.requestId).toMatch(/^req_/);
  });
});
