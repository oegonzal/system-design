import type { BriefBindingProposal, CanvasGraph } from '@sysdesign/contracts';
import type { LlmCall } from '@sysdesign/llm';
import { makeRunId } from '@sysdesign/run-dump';
import { describe, expect, it } from 'vitest';

import { buildSuggestionDump, startSuggestionDump } from './suggestion-dump';

const NOW = Date.parse('2026-09-01T09:00:00.000Z');

const graph: CanvasGraph = {
  nodes: [{ id: 'n-1', kind: 'database', label: 'Orders', config: { backups: true } }],
  edges: [],
};

const proposal: BriefBindingProposal = {
  nfrId: 'nfr-dur',
  mechanism: 'backups',
  nodeIds: ['n-1'],
  rationale: 'Backups are configured on the orders database.',
};

function call(overrides: Partial<LlmCall> = {}): LlmCall {
  return {
    model: 'claude-test',
    system: 'You are helping an engineer explain their own system design.',
    user: '# The design (canvas graph)\n  node n-1 kind=database',
    schema: { type: 'object' },
    maxTokens: 2048,
    startedAt: '2026-09-01T09:00:01.000Z',
    durationMs: 800,
    outcome: 'ok',
    stopReason: 'end_turn',
    usage: { inputTokens: 700, outputTokens: 90 },
    requestId: 'req_s',
    text: '{}',
    response: { proposals: [proposal] },
    error: null,
    ...overrides,
  };
}

function dumpFor(llmEnabled = true) {
  return startSuggestionDump({
    runId: makeRunId(NOW, 'suggestion', () => 0.5),
    sessionId: 'ses-1',
    now: NOW,
    llm: llmEnabled
      ? { enabled: true, model: 'claude-test', reason: null }
      : { enabled: false, model: null, reason: 'deterministic' },
    git: { branch: 'main', headSha: 'abc' },
  });
}

describe('buildSuggestionDump', () => {
  it('names itself a suggestion run, so a listing distinguishes all three pipelines', () => {
    const dump = dumpFor();
    dump.input({ promptId: 'pr-1', graph, narrative: null });
    const built = buildSuggestionDump(dump.state, NOW + 900);

    expect(built.runId).toMatch(/-suggestion$/);
    expect(JSON.parse(built.indexRow)).toMatchObject({
      kind: 'suggestion',
      sessionId: 'ses-1',
      promptId: 'pr-1',
    });
  });

  it('records what was sent, what came back, and what was offered', () => {
    const dump = dumpFor();
    dump.input({ promptId: 'pr-1', graph, narrative: 'The database is backed up nightly.' });
    dump.record(call());
    dump.offered([proposal]);

    const files = buildSuggestionDump(dump.state, NOW + 900).files;
    expect(files.map((file) => file.path)).toEqual([
      'manifest.json',
      'run.md',
      '01-submission.json',
      '02-llm/01.brief.suggest.system.txt',
      '02-llm/01.brief.suggest.user.txt',
      '02-llm/01.brief.suggest.response.json',
      '02-llm/01.brief.suggest.meta.json',
      '03-offered.json',
    ]);

    // The raw response sits beside the filtered list, so a reader can see what
    // admissibility dropped rather than only what survived it.
    const raw = files.find((file) => file.path.endsWith('.response.json'))?.content ?? '';
    expect(raw).toContain('nfr-dur');
    expect(files.find((file) => file.path === '01-submission.json')?.content).toContain(
      'backed up nightly',
    );
  });

  it('is honest that a deterministic run never asked anything', () => {
    const dump = dumpFor(false);
    dump.input({ promptId: 'pr-1', graph, narrative: null });
    dump.offered([]);

    const built = buildSuggestionDump(dump.state, NOW + 50);
    expect(built.files.some((file) => file.path.startsWith('02-llm/'))).toBe(false);
    const readme = built.files.find((file) => file.path === 'run.md')?.content ?? '';
    expect(readme).toContain('the model is off (deterministic)');
    expect(readme).toContain('writes the brief unaided');
  });

  it('says these were offered, not applied', () => {
    const dump = dumpFor();
    dump.input({ promptId: 'pr-1', graph, narrative: null });
    dump.offered([proposal]);
    const readme =
      buildSuggestionDump(dump.state, NOW + 10).files.find((file) => file.path === 'run.md')
        ?.content ?? '';
    expect(readme).toContain('offered, not applied');
  });

  it('survives a failed run and never records anything derived from the API key', () => {
    const dump = dumpFor();
    dump.input({ promptId: 'pr-1', graph, narrative: null });
    dump.failed(new Error('upstream exploded'));

    const built = buildSuggestionDump(dump.state, NOW + 30);
    const manifest = JSON.parse(
      built.files.find((file) => file.path === 'manifest.json')?.content ?? '{}',
    );
    expect(manifest.status).toBe('failed');
    expect(manifest.error.message).toBe('upstream exploded');
    expect(built.files.map((file) => file.content).join('\n')).not.toMatch(
      /ANTHROPIC|apiKey|api_key|sk-/i,
    );
  });
});
