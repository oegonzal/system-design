import { z } from 'zod';

import type { ClaudeQuery } from './claude-account';
import { DEFAULT_RETRY_POLICY } from './llm-failure';

/**
 * The SDK's turn as the Claude client's specs script it: a stand-in for
 * `query`, the frames a turn streams, and the one schema the calls ask in.
 * No vitest imports: a spec asserts, this only builds.
 */

/** A client that does not retry, for the specs that are about one call's record. */
export const ONCE = { ...DEFAULT_RETRY_POLICY, attempts: 1 };

/** A stand-in for the SDK's `query` that replays messages (then optionally throws, as the real SDK does on a non-zero exit) and records the options it got. */
export function scripted(messages: readonly unknown[], thenThrow?: Error) {
  const seen: { env?: NodeJS.ProcessEnv; options?: Record<string, unknown> } = {};
  const run = ((params: { options?: Record<string, unknown> & { env?: NodeJS.ProcessEnv } }) => {
    seen.env = params.options?.env;
    seen.options = params.options;
    return (async function* () {
      yield* messages;
      if (thenThrow) throw thenThrow;
    })();
  }) as unknown as ClaudeQuery;
  return { run, seen };
}

export const answer = z.object({ answer: z.string() });

/**
 * One streamed assistant frame: a single text block, top-level, as the CLI
 * emits it. `call` is the API message id the frame belongs to — one per API
 * call, shared by every block that call streamed; the frame's own by default.
 */
export const said = (
  uuid: string,
  text: string,
  extra: Record<string, unknown> = {},
  call: string = uuid,
) => ({
  type: 'assistant',
  uuid,
  parent_tool_use_id: null,
  message: { id: call, content: [{ type: 'text', text }], stop_reason: null },
  ...extra,
});

export const succeeded = (result: string, usage = { input_tokens: 2, output_tokens: 10 }) => ({
  type: 'result',
  subtype: 'success',
  is_error: false,
  result,
  stop_reason: 'end_turn',
  usage,
});
