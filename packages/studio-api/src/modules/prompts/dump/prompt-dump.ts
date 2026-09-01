/**
 * The prompt-generation half of the run history.
 *
 * A prompt is deterministic machinery plus one optional LLM rewrite, and the
 * row records only that the rewrite happened (`llmEnriched`). What the model
 * was asked, what it sent back, and what the generator had produced before it
 * touched anything were all lost — which matters more here than it looks,
 * because enrichment is the one place prose reaching a candidate is not
 * reproducible from a seed.
 *
 * Written to the same tree as evaluation dumps and joined to them by
 * `promptId`, so a graded design can be read back to the scenario it answered.
 * The plumbing is shared; the record is not — an evaluation dump is typed
 * against the engine's vocabulary and this one against the generator's.
 */
import {
  capText,
  DUMP_SCHEMA_VERSION,
  jsonSafe,
  type BuiltDump,
  type DumpFile,
  type GitContext,
} from '@sysdesign/run-dump';
import type { LlmCall, LlmExchange } from '@sysdesign/llm';

import type { EnrichedFields } from '../generator/enrich-prompt';
import type { GeneratedPrompt } from '../generator/prompt-generator';

/** There is no orchestrator here, and exactly one call site. */
export const ENRICH_SCOPE = 'prompt.enrich';

export interface PromptDumpLlm {
  enabled: boolean;
  model: string | null;
  reason: 'deterministic' | 'no-key' | null;
}

export interface PromptDumpState {
  runId: string;
  startedAt: number;
  llm: PromptDumpLlm;
  git: GitContext;
  request: {
    experienceId: string;
    experienceSlug: string;
    difficulty: string;
    seed: number;
  } | null;
  generated: GeneratedPrompt | null;
  enriched: EnrichedFields | null;
  exchanges: LlmExchange[];
  persisted: { promptId: string; llmEnriched: boolean; generatorVersion: string } | null;
  error: { name: string; message: string } | null;
}

export interface PromptDump {
  readonly state: PromptDumpState;
  record: (call: LlmCall) => void;
  request(request: NonNullable<PromptDumpState['request']>): void;
  generated(generated: GeneratedPrompt): void;
  enriched(enriched: EnrichedFields): void;
  persisted(persisted: NonNullable<PromptDumpState['persisted']>): void;
  failed(error: unknown): void;
}

export function startPromptDump(options: {
  runId: string;
  now: number;
  llm: PromptDumpLlm;
  git: GitContext;
}): PromptDump {
  const state: PromptDumpState = {
    runId: options.runId,
    startedAt: options.now,
    llm: options.llm,
    git: options.git,
    request: null,
    generated: null,
    enriched: null,
    exchanges: [],
    persisted: null,
    error: null,
  };

  return {
    state,
    record(call) {
      state.exchanges.push({ ...call, scope: ENRICH_SCOPE, ordinal: state.exchanges.length + 1 });
    },
    request: (request) => void (state.request = request),
    generated: (generated) => void (state.generated = generated),
    enriched: (enriched) => void (state.enriched = enriched),
    persisted: (persisted) => void (state.persisted = persisted),
    failed(error) {
      state.error =
        error instanceof Error
          ? { name: error.name, message: error.message }
          : { name: 'UnknownError', message: String(error) };
    },
  };
}

const json = (value: unknown): string => `${JSON.stringify(jsonSafe(value), null, 2)}\n`;

/** Pure: the layout is the contract, so it is decided without touching disk. */
export function buildPromptDump(state: PromptDumpState, finishedAt: number): BuiltDump {
  const status = state.error ? 'failed' : 'complete';

  const manifest = {
    schemaVersion: DUMP_SCHEMA_VERSION,
    runId: state.runId,
    kind: 'prompt' as const,
    status,
    startedAt: new Date(state.startedAt).toISOString(),
    finishedAt: new Date(finishedAt).toISOString(),
    durationMs: finishedAt - state.startedAt,
    // The join key. An evaluation dump carries the same id, so the two halves
    // of one exercise find each other without a schema change.
    promptId: state.persisted?.promptId ?? null,
    experienceId: state.request?.experienceId ?? null,
    experienceSlug: state.request?.experienceSlug ?? null,
    difficulty: state.request?.difficulty ?? null,
    seed: state.request?.seed ?? null,
    generatorVersion: state.persisted?.generatorVersion ?? null,
    llmEnriched: state.persisted?.llmEnriched ?? state.enriched?.llmEnriched ?? null,
    llm: state.llm,
    git: state.git,
    exchangeCount: state.exchanges.length,
    error: state.error,
    note: 'Contains generated prompt prose verbatim.',
  };

  const files: DumpFile[] = [
    { path: 'manifest.json', content: json(manifest) },
    { path: 'run.md', content: renderPromptMarkdown(state, manifest) },
    { path: '01-request.json', content: json(state.request) },
    { path: '02-generated-prompt.json', content: json(state.generated) },
  ];

  state.exchanges.forEach((exchange, position) => {
    const stem = `03-llm/${String(position + 1).padStart(2, '0')}.${exchange.scope}`;
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
          text: capText(exchange.text ?? '').text,
        }),
      },
    );
  });

  if (state.enriched) {
    files.push({ path: '04-enriched.json', content: json(state.enriched) });
  }
  if (state.persisted) {
    files.push({ path: '05-persisted-prompt.json', content: json(state.persisted) });
  }

  return {
    runId: state.runId,
    files,
    indexRow: `${JSON.stringify({
      runId: state.runId,
      kind: 'prompt',
      at: manifest.finishedAt,
      status,
      promptId: manifest.promptId,
      experienceSlug: manifest.experienceSlug,
      difficulty: manifest.difficulty,
      seed: manifest.seed,
      llmEnriched: manifest.llmEnriched,
      exchangeCount: state.exchanges.length,
      durationMs: manifest.durationMs,
    })}\n`,
  };
}

export function renderPromptMarkdown(
  state: PromptDumpState,
  manifest: { status: string; durationMs: number; finishedAt: string },
): string {
  const lines = [
    `# Prompt run ${state.runId}`,
    ``,
    `${manifest.finishedAt} · ${manifest.status} · ${manifest.durationMs} ms`,
    ``,
  ];

  if (state.request) {
    lines.push(
      `\`${state.request.experienceSlug}\` · ${state.request.difficulty} · seed ${state.request.seed}`,
      ``,
    );
  }
  if (state.generated) {
    lines.push(`**${state.generated.title}**`, ``);
  }
  if (state.error) {
    lines.push(`## Failed`, ``, '```', state.error.message, '```', ``);
  }

  lines.push(`## Enrichment`, ``);
  if (state.exchanges.length === 0) {
    lines.push(
      state.llm.enabled
        ? `Not attempted.`
        : `Skipped: the model is off (${state.llm.reason}). The prompt is exactly what the seeded generator produced, which is the reproducible case.`,
      ``,
    );
  } else {
    lines.push(
      ...state.exchanges.map(
        (exchange) =>
          `- \`${exchange.scope}\` #${exchange.ordinal} — ${exchange.outcome}, ${exchange.durationMs} ms${exchange.usage ? `, ${exchange.usage.inputTokens} in / ${exchange.usage.outputTokens} out` : ''}`,
      ),
      ``,
      state.enriched?.llmEnriched
        ? `The scenario prose below the fold is the model's rewrite; scale targets and NFRs are untouched by design.`
        : `The call did not produce a usable rewrite, so the generated prompt stands unchanged.`,
      ``,
    );
  }

  return lines.join('\n');
}
