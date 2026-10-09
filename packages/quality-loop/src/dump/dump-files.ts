/**
 * The files every dump the loop writes shares: JSON and text as they land on
 * disk, and the `05-llm/` files one model exchange becomes — a run's dump and
 * a derived rubric's both write them, so both read the same.
 */
import type { LlmExchange } from '@sysdesign/llm';
import { capText, jsonSafe, type DumpFile } from '@sysdesign/run-dump';

export const json = (value: unknown): string => `${JSON.stringify(jsonSafe(value), null, 2)}\n`;
export const pad = (value: number): string => String(value).padStart(2, '0');

const withTruncationNote = (capped: ReturnType<typeof capText>): string =>
  capped.truncated
    ? `${capped.text}\n\n[truncated — original was ${capped.originalBytes} bytes]\n`
    : capped.text;

/** Text files end in a newline so `cat` and diffs behave; empty stays empty. */
export const withNewline = (text: string): string =>
  text.length === 0 || text.endsWith('\n') ? text : `${text}\n`;

/** `05-llm/NN.<scope>.<ordinal>.*`: prompts as text, not JSON strings — `grep -r` over this tree is the point. */
export function exchangeFiles(exchange: LlmExchange, position: number): DumpFile[] {
  const stem = `05-llm/${pad(position + 1)}.${exchange.scope}.${exchange.ordinal}`;
  const system = capText(exchange.system);
  const user = capText(exchange.user);
  return [
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
        // What the call waited for a permit, apart from what it took: a process
        // behind a single-request server shows its queue here, not as a slow model.
        queuedMs: exchange.queuedMs ?? null,
        outcome: exchange.outcome,
        attempt: exchange.attempt ?? 1,
        stopReason: exchange.stopReason,
        usage: exchange.usage,
        requestId: exchange.requestId,
        error: exchange.error,
        schema: exchange.schema,
        salvage: exchange.salvage ?? null,
        apiCalls: exchange.apiCalls ?? null,
        systemTruncated: system.truncated ? system.originalBytes : null,
        userTruncated: user.truncated ? user.originalBytes : null,
        text: capText(exchange.text ?? '').text,
      }),
    },
  ];
}
