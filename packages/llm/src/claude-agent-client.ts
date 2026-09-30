import { z, type ZodIssue, type ZodType } from 'zod';

import { subscriptionEnv } from './claude-account';
import type { LlmCall, LlmCallSink, LlmRecordable } from './exchange';
import type { LlmClient, StructuredRequest } from './llm-client';

/** The model report when no model is pinned: the subscription's own choice. */
export const SUBSCRIPTION_MODEL_LABEL = 'claude-code/subscription';

/** A subscription call spawns a local agent turn — minutes, not milliseconds. */
export const CLAUDE_AGENT_TIMEOUT_MS = 300_000;

/**
 * Output-token ceiling for the spawned turn. The coach's proposal — a full
 * brief plus a per-component narrative plus graph ops in one object — runs
 * ~4–6k tokens; the CLI's default cap truncates that mid-JSON, which then
 * fails to parse. This gives the turn room to close the object.
 */
const MAX_OUTPUT_TOKENS = '16000';

/**
 * Every built-in Claude Code tool, denied by name. `allowedTools: []` does NOT
 * make an agent tool-less (the SDK treats it as "no extra allow rules", not
 * "deny all"), so a scoring-adjacent coach call must remove the tools
 * explicitly. Combined with `settingSources: []` (no project/user config, no
 * MCP servers) and single-turn `default` permission, the model has nothing to
 * call and no way to be granted one.
 */
const ALL_BUILTIN_TOOLS = [
  'Bash',
  'BashOutput',
  'KillShell',
  'Edit',
  'MultiEdit',
  'Write',
  'NotebookEdit',
  'Read',
  'Glob',
  'Grep',
  'LS',
  'WebFetch',
  'WebSearch',
  'Task',
  'TodoWrite',
  'ExitPlanMode',
  'Skill',
];

/**
 * Scan `text` for balanced, string-aware top-level `{...}` objects and yield
 * each complete span. Unlike first-`{`-to-last-`}`, this survives an agent that
 * narrates, echoes the JSON Schema it was given, or quotes the current brief —
 * each of which drops extra braces into the reply. Braces inside JSON strings
 * (and their escapes) are ignored.
 */
function* braceObjects(text: string): Generator<string> {
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === '}') {
      if (depth > 0) {
        depth--;
        if (depth === 0 && start >= 0) yield text.slice(start, i + 1);
      }
    }
  }
}

/**
 * Two kinds of schema issue are excess, not a wrong answer. A `too_big` on a
 * string or array is an overshoot: with no server-side constraint the model
 * writes past a `.max()` it was shown, and rejecting a whole pass for a
 * 900-character summary loses everything grounded in it. An
 * `unrecognized_keys` on a strict object is an aside: a `steps_note` beside
 * the `steps` the schema asked for. Clamp the one, strip the other, and let
 * the schema judge again — schema-driven, so no caller knows a cap or a key
 * list exists. Anything else is left for the schema to reject.
 */
const isRepairable = (issue: ZodIssue): boolean =>
  issue.code === 'unrecognized_keys' ||
  (issue.code === 'too_big' &&
    typeof issue.maximum === 'number' &&
    (issue.origin === 'string' || issue.origin === 'array'));

function repairExcess(value: unknown, issues: readonly ZodIssue[]): unknown {
  let next = value;
  for (const issue of issues) {
    const path = issue.path.filter(
      (key): key is string | number => typeof key === 'string' || typeof key === 'number',
    );
    if (issue.code === 'too_big') {
      const maximum = issue.maximum as number;
      next = updateAt(next, path, (current) =>
        typeof current === 'string' || Array.isArray(current) ? current.slice(0, maximum) : current,
      );
    } else if (issue.code === 'unrecognized_keys') {
      const unwanted = new Set(issue.keys);
      next = updateAt(next, path, (current) =>
        current !== null && typeof current === 'object' && !Array.isArray(current)
          ? Object.fromEntries(Object.entries(current).filter(([key]) => !unwanted.has(key)))
          : current,
      );
    }
  }
  return next;
}

function updateAt(
  value: unknown,
  path: readonly (string | number)[],
  fn: (v: unknown) => unknown,
): unknown {
  if (path.length === 0) return fn(value);
  const [head, ...rest] = path;
  if (Array.isArray(value) && typeof head === 'number') {
    const copy = [...value];
    copy[head] = updateAt(copy[head], rest, fn);
    return copy;
  }
  if (value !== null && typeof value === 'object' && typeof head === 'string') {
    const record = value as Record<string, unknown>;
    return { ...record, [head]: updateAt(record[head], rest, fn) };
  }
  return value;
}

/** Repairs can cascade (an array trimmed, then a member's string); a few rounds settle it. */
const REPAIR_ROUNDS = 3;

/**
 * Pull the one schema-valid JSON object out of an agent's final text.
 * Tries every fenced block, then every balanced brace span, returning the
 * first that both parses AND satisfies the schema — clamping length
 * overshoots and stripping unasked-for keys on the way. Anything else is `null`, the port's deterministic
 * path.
 */
export function extractStructured<T>(text: string, schema: ZodType<T>): T | null {
  const candidates: string[] = [];
  const fence = /```(?:json)?\s*([\s\S]*?)```/g;
  for (let m = fence.exec(text); m !== null; m = fence.exec(text)) candidates.push(m[1]);
  for (const span of braceObjects(text)) candidates.push(span);

  for (const candidate of candidates) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(candidate);
    } catch {
      continue;
    }
    for (let round = 0; round <= REPAIR_ROUNDS; round++) {
      const result = schema.safeParse(parsed);
      if (result.success) return result.data;
      const { issues } = result.error;
      if (issues.length === 0 || !issues.every(isRepairable)) break;
      parsed = repairExcess(parsed, issues);
    }
  }
  return null;
}

/**
 * Structured calls through the Claude Code subscription login — the loop's
 * one model route. The Agent SDK spawns a tool-less, settings-less,
 * single-turn agent using the credentials `claude login` stored, or the
 * `CLAUDE_CODE_OAUTH_TOKEN` a container is given; an API key in the
 * environment is withheld from it, so nothing is ever billed outside the
 * subscription.
 *
 * There is no server-side output constraint, so the schema rides in the
 * prompt as JSON Schema and `extractStructured` enforces it on the way out —
 * a miss is `null`, exactly the contract every caller already handles.
 *
 * Implements `LlmRecordable` so a run dump captures the exchange.
 */
export class ClaudeAgentLlmClient implements LlmClient, LlmRecordable {
  readonly model: string;

  /** Only set when the caller pinned one; otherwise the CLI's default rules. */
  private readonly requestedModel: string | undefined;
  private readonly sink: LlmCallSink | null;

  constructor(options: { model?: string; sink?: LlmCallSink } = {}) {
    this.requestedModel = options.model;
    this.model = options.model ?? SUBSCRIPTION_MODEL_LABEL;
    this.sink = options.sink ?? null;
  }

  withRecorder(sink: LlmCallSink): LlmClient {
    return new ClaudeAgentLlmClient({ model: this.requestedModel, sink });
  }

  async completeStructured<T>(request: StructuredRequest<T>): Promise<T | null> {
    const maxTokens = request.maxTokens ?? 4096;
    const startedAt = new Date();
    const started = Date.now();
    let jsonSchema = '';

    const record = (
      outcome: LlmCall['outcome'],
      text: string | null,
      response: unknown,
      error: LlmCall['error'],
      usage: LlmCall['usage'],
    ): void => {
      this.sink?.({
        model: this.model,
        system: request.system,
        user: request.user,
        schema: jsonSchema ? safeJson(jsonSchema) : null,
        maxTokens,
        startedAt: startedAt.toISOString(),
        durationMs: Date.now() - started,
        outcome,
        stopReason: null,
        usage,
        requestId: null,
        text,
        response,
        error,
      });
    };

    try {
      // Inside the try: an unconvertible schema must yield null, not reject —
      // the LlmClient contract is "null on any failure".
      jsonSchema = JSON.stringify(z.toJSONSchema(request.schema));
      const prompt = [
        request.user,
        '',
        '# Output format',
        'Respond with ONLY one JSON object — no prose before or after, no markdown',
        'fence. It must validate against this JSON Schema:',
        jsonSchema,
      ].join('\n');

      const { query } = await import('@anthropic-ai/claude-agent-sdk');

      // A hard backstop: interrupt() is cooperative and cannot end a wedged
      // subprocess, so an AbortController drives the SDK's real kill path.
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), CLAUDE_AGENT_TIMEOUT_MS);
      timer.unref?.();

      const turn = query({
        prompt,
        options: {
          systemPrompt: request.system,
          ...(this.requestedModel ? { model: this.requestedModel } : {}),
          maxTurns: 1,
          disallowedTools: ALL_BUILTIN_TOOLS,
          permissionMode: 'default',
          // No project/user settings, skills or MCP servers leak into a
          // scoring-adjacent call; nothing about this run is persisted to disk.
          settingSources: [],
          persistSession: false,
          abortController: abort,
          // `env` REPLACES the subprocess environment, so spread the current
          // one and only raise the output cap — the login credentials the SDK
          // reads live in process.env / the config dir and must be preserved.
          env: {
            ...subscriptionEnv(process.env),
            CLAUDE_CODE_MAX_OUTPUT_TOKENS: MAX_OUTPUT_TOKENS,
          },
        },
      });

      let resultText: string | null = null;
      let usage: LlmCall['usage'] = null;
      try {
        for await (const message of turn) {
          if (message.type === 'result') {
            resultText = message.subtype === 'success' ? message.result : null;
            const u = (message as { usage?: { input_tokens?: number; output_tokens?: number } })
              .usage;
            if (u) {
              usage = { inputTokens: u.input_tokens ?? 0, outputTokens: u.output_tokens ?? 0 };
            }
          }
        }
      } finally {
        clearTimeout(timer);
      }

      if (resultText === null) {
        record('error', null, null, null, usage);
        return null;
      }
      const parsed = extractStructured(resultText, request.schema);
      record(parsed === null ? 'schema-miss' : 'ok', resultText, parsed, null, usage);
      return parsed;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      record('error', null, null, { name: err.name, message: err.message }, null);
      return null;
    }
  }
}

function safeJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
