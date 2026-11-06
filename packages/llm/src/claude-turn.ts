import type { SDKAssistantMessage, SDKMessage } from '@anthropic-ai/claude-agent-sdk';

import { subscriptionEnv, type ClaudeQuery } from './claude-account';
import type { LlmCall } from './exchange';

/**
 * One turn of the spawned agent: the options every structured call's turn
 * runs under, and how what it streams is read — whole, in arrival order,
 * whatever ended it.
 */

/**
 * Output-token ceiling for one API call of the spawned turn, thinking
 * included. Sized from recorded runs: the largest turns so far wrote 40,173
 * (a canvas coach, 2026-10-02), 26,054 (an agentic-design producer,
 * 2026-09-23) and 21,122 (a canvas coach, 2026-10-01) output tokens, and at
 * the old 16,000 each was cut and resumed in a second message. A cut is not
 * lossy — the turn's text is read whole, see `TurnTranscript`, and the
 * record counts the calls in `apiCalls` — but the CLI resumes a turn only so
 * many times: on 2026-11-06 a canvas coach redrawing a 33-block design wrote
 * past 32,000 on every call, reached five calls and ended `max_output_tokens`
 * four times running, with nothing judged. Raised to the current models'
 * own output limit so one call carries what the canvas producer declares
 * (`maxTokens: 50000`); a turn that still resumes is a declaration to revisit.
 */
export const OUTPUT_TOKEN_CEILING = 64_000;

/**
 * No tools at all. `tools: []` is the SDK's own "disable every built-in
 * tool" — unlike a list of names to deny, which went stale as the CLI grew
 * new tools (ToolSearch, Workflow, Monitor, SendMessage…) and left them on
 * offer: a model that reached for one used up its single turn, and the call
 * came back `error_max_turns`. Combined with `settingSources: []` (no
 * project/user config, no MCP servers) and single-turn `default`
 * permission, the model has nothing to call and no way to be granted one.
 */
const NO_TOOLS: string[] = [];

/** What a turn is asked under besides its prompt: whose system prompt, which model, and the abort that can end it. */
export interface TurnAsk {
  system: string;
  /** Only when the caller pinned one; otherwise the CLI's default rules. */
  model: string | undefined;
  /** Only when the ask declared one; otherwise the CLI's own, adaptive thinking. */
  thinkingBudget: number | undefined;
  abort: AbortController;
}

/** The options of one structured call's turn: tool-less, settings-less, single-turn, billed to the subscription alone. */
export const turnOptions = ({
  system,
  model,
  thinkingBudget,
  abort,
}: TurnAsk): NonNullable<Parameters<ClaudeQuery>[0]['options']> => ({
  systemPrompt: system,
  ...(model ? { model } : {}),
  // A declared budget is the SDK's fixed-budget mode; undeclared, the CLI
  // decides how much to think, as it does for every other ask.
  ...(thinkingBudget === undefined
    ? {}
    : { thinking: { type: 'enabled' as const, budgetTokens: thinkingBudget } }),
  maxTurns: 1,
  tools: NO_TOOLS,
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
    CLAUDE_CODE_MAX_OUTPUT_TOKENS: String(OUTPUT_TOKEN_CEILING),
  },
});

/**
 * What one turn wrote, and how many API calls it took. The CLI streams a
 * turn as several assistant messages — one per content block, and when a
 * reply runs past the output cap it resumes it in a further API call
 * mid-thought — while the closing `result` repeats only the last message's
 * text. A long answer read from `result` alone is its tail: no opening
 * brace, nothing to parse. So every top-level text block is kept in arrival
 * order and read as one; a message the CLI retracts (it names it in a later
 * message's `supersedes`) is dropped. The blocks of one API call share their
 * `message.id`, so the distinct ids are the calls.
 */
export class TurnTranscript {
  private readonly texts = new Map<string, string>();
  private readonly calls = new Set<string>();

  add(message: SDKAssistantMessage): void {
    this.calls.add(message.message.id);
    if (message.parent_tool_use_id) return;
    for (const retracted of message.supersedes ?? []) this.texts.delete(retracted);
    const text = message.message.content
      .flatMap((block) => (block.type === 'text' ? [block.text] : []))
      .join('');
    if (text.length > 0) this.texts.set(message.uuid ?? `#${this.texts.size}`, text);
  }

  get text(): string {
    return [...this.texts.values()].join('');
  }

  get apiCalls(): number {
    return this.calls.size;
  }
}

/** What one turn said, read to its end; its text is in the transcript the caller owns. */
export interface TurnRead {
  resultText: string | null;
  stopReason: string | null;
  /**
   * A turn that ended on an API error (an expired token, a rate limit) still
   * arrives as a result: the CLI's own reason, kept for the record.
   */
  failure: LlmCall['error'];
  assistantError: string | null;
  usage: LlmCall['usage'];
}

/**
 * Read a turn's messages to the end, feeding every assistant message to the
 * caller's transcript as it arrives — so what was streamed is in hand even
 * when the read never returns. It rejects only when the stream broke before
 * a result arrived: the CLI exits non-zero after an error result and the SDK
 * rethrows that exit, but the result already carries the reason worth
 * recording.
 */
export async function readTurn(
  turn: AsyncIterable<SDKMessage>,
  transcript: TurnTranscript,
): Promise<TurnRead> {
  const read: TurnRead = {
    resultText: null,
    stopReason: null,
    failure: null,
    assistantError: null,
    usage: null,
  };
  let sawResult = false;
  try {
    for await (const message of turn) {
      if (message.type === 'assistant') {
        transcript.add(message);
        if (message.error) read.assistantError = message.error;
      }
      if (message.type === 'result') {
        sawResult = true;
        read.stopReason = message.stop_reason ?? null;
        if (message.subtype === 'success' && !message.is_error) read.resultText = message.result;
        else
          read.failure = {
            name: read.assistantError ?? message.subtype,
            message:
              message.subtype === 'success'
                ? message.result
                : message.errors.join('; ') || message.subtype,
          };
        const u = (message as { usage?: { input_tokens?: number; output_tokens?: number } }).usage;
        if (u) {
          read.usage = { inputTokens: u.input_tokens ?? 0, outputTokens: u.output_tokens ?? 0 };
        }
      }
    }
  } catch (error) {
    if (!sawResult) throw error;
  }
  return read;
}
