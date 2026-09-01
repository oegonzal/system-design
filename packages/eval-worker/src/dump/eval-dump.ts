/**
 * The run dump: everything one evaluation saw, decided and produced.
 *
 * The evaluation row keeps the verdict. It does not keep the prompts sent to
 * the model, the responses, the per-pass timing, the resolved profile, the
 * facts the engine actually read, which suppressions fired, or the arithmetic
 * behind each dimension — so "why did this design get this number, and what did
 * the critic read?" was unanswerable after the fact.
 *
 * Collection is pure and cheap: the methods below only push onto arrays. All
 * I/O happens once, in `write-dump`, from the structure `buildEvalDump`
 * returns — the same pure-builder / impure-writer split the code-review run
 * history uses.
 *
 * NOTE FOR READERS: these files contain the author's prose verbatim.
 */
import type { CanvasGraph, DesignBrief } from '@sysdesign/contracts';
import type { LlmCall, LlmExchange } from '@sysdesign/llm';

import type { AggregateResult } from '../engine/core/aggregator';
import type { EvidenceArtifact } from '../engine/core/artifacts';
import type { EvalProfile } from '../engine/core/profile';
import type { PassRecorder } from '../engine/core/orchestrator';
import type { EvalPass } from '../engine/core/types';
import type { PromptFacts } from '../engine/types';
import { capText, describeError, jsonSafe, type ErrorShape } from './serialize';

/** Bump when a field changes meaning, so a later reader can tell records apart. */
export const DUMP_SCHEMA_VERSION = 1;

export interface PassRecord {
  passId: string;
  mode: EvalPass['mode'];
  options: Record<string, unknown>;
  durationMs: number;
  /** Artifact kinds produced, in order — the shape of what the pass said. */
  produced: string[];
  /**
   * Artifacts `enforceMode` then dropped, verbatim. An LLM pass emitting
   * findings or coverage is a contract breach worth seeing in full, and the
   * diagnostic it turns into records only a count.
   */
  rejected: unknown[];
}

export interface EvalDumpInputs {
  revisionId: string;
  revisionNumber: number;
  sessionId: string;
  promptId: string;
  /** Projected to a plain object by the caller — never a live ORM entity. */
  prompt: unknown;
  graph: CanvasGraph;
  narrative: string | null;
  brief: DesignBrief | null;
  facts: PromptFacts;
  profile: EvalProfile;
  engineVersion: string;
}

export interface EvalDumpLlm {
  enabled: boolean;
  model: string | null;
  /** Why it is off, when it is. Never anything derived from the API key. */
  reason: 'deterministic' | 'no-key' | null;
}

/** Which labelled step had begun — the thing `lastError` cannot tell you. */
export type DumpPhase = 'loading' | 'evaluating' | 'persisting' | 'complete';

export interface EvalDumpState {
  runId: string;
  jobId: string;
  startedAt: number;
  finishedAt: number;
  phase: DumpPhase;
  llm: EvalDumpLlm;
  git: GitContext;
  inputs: EvalDumpInputs | null;
  passes: PassRecord[];
  exchanges: LlmExchange[];
  artifacts: EvidenceArtifact[] | null;
  result: AggregateResult | null;
  persisted: { evaluationId: string; findingCount: number } | null;
  error: ErrorShape | null;
}

export interface GitContext {
  branch: string;
  headSha: string;
}

/**
 * The live collector. Everything it exposes is a mutation on in-memory state;
 * it never touches the filesystem and never throws.
 */
export interface EvalDump {
  readonly state: EvalDumpState;
  /** The sink handed to a recording LLM client. */
  record: (call: LlmCall) => void;
  /** The observer handed to `runEvaluation`. */
  passes: PassRecorder;
  inputs(inputs: EvalDumpInputs): void;
  outcome(outcome: { artifacts: EvidenceArtifact[]; result: AggregateResult }): void;
  persisted(persisted: { evaluationId: string; findingCount: number }): void;
  failed(error: unknown): void;
}

export function startEvalDump(options: {
  runId: string;
  jobId: string;
  now: number;
  llm: EvalDumpLlm;
  git: GitContext;
}): EvalDump {
  const state: EvalDumpState = {
    runId: options.runId,
    jobId: options.jobId,
    startedAt: options.now,
    finishedAt: options.now,
    phase: 'loading',
    llm: options.llm,
    git: options.git,
    inputs: null,
    passes: [],
    exchanges: [],
    artifacts: null,
    result: null,
    persisted: null,
    error: null,
  };

  // Attribution comes from the open pass window, not from the caller — see
  // `PassRecorder`. Before any pass opens (or in the API, where there is no
  // orchestrator) calls fall to an explicit scope.
  let openPass: string | null = null;
  const ordinals = new Map<string, number>();

  return {
    state,
    record(call) {
      const scope = openPass ?? 'unscoped';
      const ordinal = (ordinals.get(scope) ?? 0) + 1;
      ordinals.set(scope, ordinal);
      state.exchanges.push({ ...call, scope, ordinal });
    },
    passes: {
      beginPass(passId, mode, passOptions) {
        openPass = passId;
        state.passes.push({
          passId,
          mode,
          options: passOptions,
          durationMs: 0,
          produced: [],
          rejected: [],
        });
      },
      endPass(passId, produced, durationMs) {
        const record = state.passes.find((candidate) => candidate.passId === passId);
        openPass = null;
        if (!record) return;
        record.durationMs = durationMs;
        record.produced = produced.map((artifact) => artifact.kind);
        record.rejected =
          record.mode === 'llm'
            ? produced
                .filter((artifact) => artifact.kind === 'findings' || artifact.kind === 'coverage')
                .map(jsonSafe)
            : [];
      },
    },
    inputs(inputs) {
      state.inputs = inputs;
      state.phase = 'evaluating';
    },
    outcome({ artifacts, result }) {
      state.artifacts = artifacts;
      state.result = result;
      state.phase = 'persisting';
    },
    persisted(persisted) {
      state.persisted = persisted;
      state.phase = 'complete';
    },
    failed(error) {
      state.error = describeError(error);
    },
  };
}

export interface DumpFile {
  /** Relative to the run folder. */
  path: string;
  content: string;
}

export interface BuiltDump {
  runId: string;
  files: DumpFile[];
  /** One flat line for `index.jsonl`, appended only once the folder is whole. */
  indexRow: string;
}

const json = (value: unknown): string => `${JSON.stringify(jsonSafe(value), null, 2)}\n`;

/**
 * Pure: everything that lands on disk is decided here, so the layout can be
 * tested without a filesystem. The layout IS the contract — this is what future
 * analysis reads.
 */
export function buildEvalDump(
  state: EvalDumpState,
  finishedAt: number,
  promptRunId: string | null = null,
): BuiltDump {
  const status = state.error ? 'failed' : 'complete';
  const { inputs, result } = state;

  const manifest = {
    schemaVersion: DUMP_SCHEMA_VERSION,
    runId: state.runId,
    kind: 'eval' as const,
    status,
    phase: state.phase,
    startedAt: new Date(state.startedAt).toISOString(),
    finishedAt: new Date(finishedAt).toISOString(),
    durationMs: finishedAt - state.startedAt,
    jobId: state.jobId,
    revisionId: inputs?.revisionId ?? null,
    revisionNumber: inputs?.revisionNumber ?? null,
    sessionId: inputs?.sessionId ?? null,
    promptId: inputs?.promptId ?? null,
    /** The prompt-generation run that produced this prompt, when one is indexed. */
    promptRunId,
    evaluationId: state.persisted?.evaluationId ?? null,
    engineVersion: inputs?.engineVersion ?? null,
    profile: inputs ? `${inputs.profile.id}@${inputs.profile.version}` : null,
    llm: state.llm,
    git: state.git,
    grade: result?.grade ?? null,
    overallScore: result?.overallScore ?? null,
    exchangeCount: state.exchanges.length,
    error: state.error,
    note: 'Contains the author’s prose verbatim.',
  };

  const files: DumpFile[] = [
    { path: 'manifest.json', content: json(manifest) },
    { path: 'run.md', content: renderRunMarkdown(state, manifest) },
  ];

  if (inputs) {
    files.push(
      { path: '01-prompt.json', content: json(inputs.prompt) },
      {
        path: '02-submission.json',
        content: json({
          graph: inputs.graph,
          narrative: inputs.narrative,
          brief: inputs.brief,
        }),
      },
      { path: '03-facts.json', content: json(inputs.facts) },
      {
        path: '04-profile.json',
        content: json({ engineVersion: inputs.engineVersion, profile: inputs.profile }),
      },
    );
  }

  files.push({ path: '05-passes.json', content: json(state.passes) });

  // Prompts as text, not JSON strings: a 4 KB system prompt with escaped
  // newlines is unreadable, and `grep -r` over this tree is the point.
  state.exchanges.forEach((exchange, position) => {
    const stem = `06-llm/${String(position + 1).padStart(2, '0')}.${exchange.scope}.${exchange.ordinal}`;
    const system = capText(exchange.system);
    const user = capText(exchange.user);
    files.push(
      { path: `${stem}.system.txt`, content: withTruncationNote(system) },
      { path: `${stem}.user.txt`, content: withTruncationNote(user) },
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

  if (state.artifacts) {
    files.push({ path: '07-artifacts.json', content: json(state.artifacts) });
  }
  if (result) {
    const { trace, ...rest } = result;
    files.push(
      { path: '08-scoring.json', content: json(trace) },
      { path: '09-result.json', content: json(rest) },
    );
  }

  return {
    runId: state.runId,
    files,
    indexRow: `${JSON.stringify({
      runId: state.runId,
      kind: 'eval',
      at: manifest.finishedAt,
      status,
      promptId: manifest.promptId,
      revisionId: manifest.revisionId,
      evaluationId: manifest.evaluationId,
      grade: manifest.grade,
      overallScore: manifest.overallScore,
      findingCount: state.persisted?.findingCount ?? null,
      exchangeCount: state.exchanges.length,
      durationMs: manifest.durationMs,
      llmEnabled: state.llm.enabled,
    })}\n`,
  };
}

function withTruncationNote(capped: ReturnType<typeof capText>): string {
  if (!capped.truncated) return capped.text;
  return `${capped.text}\n\n[truncated — original was ${capped.originalBytes} bytes]\n`;
}

/** The human entry point: what happened, in order, in one screen. */
export function renderRunMarkdown(
  state: EvalDumpState,
  manifest: { status: string; durationMs: number; finishedAt: string },
): string {
  const lines: string[] = [
    `# Evaluation run ${state.runId}`,
    ``,
    `${manifest.finishedAt} · ${manifest.status} · ${manifest.durationMs} ms`,
    ``,
  ];

  if (state.result) {
    lines.push(
      `**${state.result.grade} · ${state.result.overallScore}/100**`,
      ``,
      `| dimension | score | met/total | penalties |`,
      `| --- | --- | --- | --- |`,
      ...state.result.trace.dimensions.map(
        (dimension) =>
          `| ${dimension.dimension} | ${dimension.score ?? '—'} | ${dimension.met}/${dimension.total} | ${dimension.penalties.length} |`,
      ),
      ``,
    );
    if (state.result.capApplied) {
      lines.push(
        `Grade capped at ${state.result.capApplied.maxGrade} by ${state.result.capApplied.count} ${state.result.capApplied.severity} finding(s); bands alone gave ${state.result.bandGrade}.`,
        ``,
      );
    }
  }

  if (state.error) {
    lines.push(`## Failed during \`${state.phase}\``, ``, '```', state.error.message, '```', ``);
  }

  lines.push(
    `## Passes`,
    ``,
    ...state.passes.map(
      (pass) =>
        `- \`${pass.passId}\` (${pass.mode}) — ${pass.durationMs} ms, produced ${pass.produced.join(', ') || 'nothing'}${pass.rejected.length > 0 ? ` — ${pass.rejected.length} artifact(s) REJECTED by mode enforcement` : ''}`,
    ),
    ``,
    `## Model calls`,
    ``,
  );

  if (state.exchanges.length === 0) {
    lines.push(
      state.llm.enabled
        ? `None — no pass reached the model.`
        : `None: the model is off (${state.llm.reason}). Every LLM pass returns before assembling a prompt, so there is nothing to capture. The deterministic ledger above is complete.`,
      ``,
    );
  } else {
    lines.push(
      ...state.exchanges.map(
        (exchange) =>
          `- \`${exchange.scope}\` #${exchange.ordinal} — ${exchange.outcome}, ${exchange.durationMs} ms${exchange.usage ? `, ${exchange.usage.inputTokens} in / ${exchange.usage.outputTokens} out` : ''}`,
      ),
      ``,
    );
  }

  return lines.join('\n');
}
