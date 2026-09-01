import {
  capText,
  DUMP_SCHEMA_VERSION,
  jsonSafe,
  type BuiltDump,
  type DumpFile,
  type GitContext,
} from '@sysdesign/run-dump';
import type { BriefBindingProposal, CanvasGraph } from '@sysdesign/contracts';
import type { LlmCall, LlmExchange } from '@sysdesign/llm';

/**
 * The third pipeline that talks to a model, and therefore the third that leaves
 * a run folder.
 *
 * Prompt generation and evaluation both dump; a suggestion call that vanished
 * would be the one hole in "every model call is on the record". It matters more
 * here than it looks: these proposals become the author's graded claims the
 * moment they accept one, so what the model was shown and what it said back is
 * exactly the provenance a later reader wants.
 *
 * Joined to the other two by `sessionId` and `promptId` through `index.jsonl`.
 * The plumbing is shared; the record is not — this one is typed against
 * proposals, as the eval dump is against artifacts.
 *
 * NOTE FOR READERS: contains the author's diagram and prose verbatim.
 */
export const SUGGEST_SCOPE = 'brief.suggest';

export interface SuggestionDumpLlm {
  enabled: boolean;
  model: string | null;
  reason: 'deterministic' | 'no-key' | null;
}

export interface SuggestionDumpState {
  runId: string;
  startedAt: number;
  llm: SuggestionDumpLlm;
  git: GitContext;
  sessionId: string;
  promptId: string | null;
  graph: CanvasGraph | null;
  narrative: string | null;
  exchanges: LlmExchange[];
  /** What the model returned, before admissibility filtering. */
  raw: unknown;
  /** What survived — what the author was actually offered. */
  offered: BriefBindingProposal[] | null;
  error: { name: string; message: string } | null;
}

export interface SuggestionDump {
  readonly state: SuggestionDumpState;
  record: (call: LlmCall) => void;
  input(input: { promptId: string; graph: CanvasGraph; narrative: string | null }): void;
  offered(proposals: BriefBindingProposal[]): void;
  failed(error: unknown): void;
}

export function startSuggestionDump(options: {
  runId: string;
  sessionId: string;
  now: number;
  llm: SuggestionDumpLlm;
  git: GitContext;
}): SuggestionDump {
  const state: SuggestionDumpState = {
    runId: options.runId,
    startedAt: options.now,
    llm: options.llm,
    git: options.git,
    sessionId: options.sessionId,
    promptId: null,
    graph: null,
    narrative: null,
    exchanges: [],
    raw: null,
    offered: null,
    error: null,
  };

  return {
    state,
    record(call) {
      state.exchanges.push({
        ...call,
        scope: SUGGEST_SCOPE,
        ordinal: state.exchanges.length + 1,
      });
      // The parsed response, kept beside the filtered list so a reader can see
      // exactly what admissibility dropped and why it was worth dropping.
      state.raw = call.response;
    },
    input({ promptId, graph, narrative }) {
      state.promptId = promptId;
      state.graph = graph;
      state.narrative = narrative;
    },
    offered(proposals) {
      state.offered = proposals;
    },
    failed(error) {
      state.error =
        error instanceof Error
          ? { name: error.name, message: error.message }
          : { name: 'UnknownError', message: String(error) };
    },
  };
}

const json = (value: unknown): string => `${JSON.stringify(jsonSafe(value), null, 2)}\n`;

/** Pure: the layout is the contract, decided without touching disk. */
export function buildSuggestionDump(state: SuggestionDumpState, finishedAt: number): BuiltDump {
  const status = state.error ? 'failed' : 'complete';
  const offered = state.offered ?? [];

  const manifest = {
    schemaVersion: DUMP_SCHEMA_VERSION,
    runId: state.runId,
    kind: 'suggestion' as const,
    status,
    startedAt: new Date(state.startedAt).toISOString(),
    finishedAt: new Date(finishedAt).toISOString(),
    durationMs: finishedAt - state.startedAt,
    sessionId: state.sessionId,
    promptId: state.promptId,
    llm: state.llm,
    git: state.git,
    exchangeCount: state.exchanges.length,
    offeredCount: offered.length,
    error: state.error,
    note: 'Contains the author’s diagram and prose verbatim.',
  };

  const files: DumpFile[] = [
    { path: 'manifest.json', content: json(manifest) },
    { path: 'run.md', content: renderSuggestionMarkdown(state, manifest) },
    {
      path: '01-submission.json',
      content: json({ graph: state.graph, narrative: state.narrative }),
    },
  ];

  state.exchanges.forEach((exchange, position) => {
    const stem = `02-llm/${String(position + 1).padStart(2, '0')}.${exchange.scope}`;
    const system = capText(exchange.system);
    const user = capText(exchange.user);
    files.push(
      { path: `${stem}.system.txt`, content: system.text },
      { path: `${stem}.user.txt`, content: user.text },
      { path: `${stem}.response.json`, content: json(exchange.response) },
      {
        path: `${stem}.meta.json`,
        content: json({
          scope: exchange.scope,
          ordinal: exchange.ordinal,
          model: exchange.model,
          maxTokens: exchange.maxTokens,
          startedAt: exchange.startedAt,
          durationMs: exchange.durationMs,
          outcome: exchange.outcome,
          stopReason: exchange.stopReason,
          usage: exchange.usage,
          requestId: exchange.requestId,
          error: exchange.error,
          schema: exchange.schema,
          systemTruncated: system.truncated ? system.originalBytes : null,
          userTruncated: user.truncated ? user.originalBytes : null,
        }),
      },
    );
  });

  files.push({ path: '03-offered.json', content: json(offered) });

  return {
    runId: state.runId,
    files,
    indexRow: `${JSON.stringify({
      runId: state.runId,
      kind: 'suggestion',
      at: manifest.finishedAt,
      status,
      sessionId: state.sessionId,
      promptId: state.promptId,
      offeredCount: offered.length,
      exchangeCount: state.exchanges.length,
      durationMs: manifest.durationMs,
      llmEnabled: state.llm.enabled,
    })}\n`,
  };
}

export function renderSuggestionMarkdown(
  state: SuggestionDumpState,
  manifest: { status: string; durationMs: number; finishedAt: string },
): string {
  const offered = state.offered ?? [];
  const lines = [
    `# Binding suggestions ${state.runId}`,
    ``,
    `${manifest.finishedAt} · ${manifest.status} · ${manifest.durationMs} ms`,
    ``,
    `session ${state.sessionId}${state.promptId ? ` · prompt ${state.promptId}` : ''}`,
    ``,
  ];

  if (state.error) {
    lines.push(`## Failed`, ``, '```', state.error.message, '```', ``);
  }

  lines.push(`## Offered`, ``);
  if (offered.length === 0) {
    lines.push(
      state.llm.enabled
        ? `Nothing. The model either declined, returned nothing usable, or proposed only bindings the canvas could not accept.`
        : `Nothing: the model is off (${state.llm.reason}). Suggestions short-circuit before a prompt is assembled, so there is nothing to capture — the author writes the brief unaided, which is the deterministic path.`,
      ``,
    );
  } else {
    lines.push(
      ...offered.map(
        (proposal) =>
          `- \`${proposal.nfrId}\` → **${proposal.mechanism}** on ${proposal.nodeIds.join(', ')} — ${proposal.rationale}`,
      ),
      ``,
      `These were offered, not applied. Whether any became part of the brief is recorded on the revision the author submitted, not here.`,
      ``,
    );
  }

  return lines.join('\n');
}
