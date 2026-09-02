import { z, type ZodType } from 'zod';

import type { LlmClient, StructuredRequest } from './llm-client';

/** A subscription call spawns a local agent turn — minutes, not milliseconds. */
export const CLAUDE_AGENT_TIMEOUT_MS = 180_000;

/**
 * Pull the one JSON object out of an agent's final text and validate it.
 * Agents narrate: the object may arrive bare, fenced, or wrapped in prose —
 * try the fenced block first, then the outermost brace span. Anything that
 * fails the schema maps to null, the port's deterministic path.
 */
export function extractStructured<T>(text: string, schema: ZodType<T>): T | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text)?.[1];
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  const candidates = [fenced, first >= 0 && last > first ? text.slice(first, last + 1) : undefined];

  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const parsed = schema.safeParse(JSON.parse(candidate));
      if (parsed.success) return parsed.data;
    } catch {
      // not JSON — try the next candidate
    }
  }
  return null;
}

/**
 * Structured calls through the local Claude Code login — the supported way to
 * run the coach on a Claude SUBSCRIPTION instead of an API key. The Agent SDK
 * spawns a tool-less, settings-less, single-turn agent using the credentials
 * `claude login` stored; no key ever enters this codebase or its env.
 *
 * Unlike `AnthropicLlmClient` there is no server-side output constraint, so
 * the schema rides in the prompt as JSON Schema and is enforced by
 * `extractStructured` on the way out — a miss is `null`, exactly the contract
 * every caller already handles. The improver additionally re-validates and
 * re-scores every proposal, so a malformed answer costs an iteration, never
 * correctness.
 */
export class ClaudeAgentLlmClient implements LlmClient {
  readonly enabled = true;
  readonly model: string;

  /** Only set when the caller pinned one; otherwise the CLI's default rules. */
  private readonly requestedModel: string | undefined;

  constructor(options: { model?: string } = {}) {
    this.requestedModel = options.model;
    this.model = options.model ?? 'claude-code/subscription';
  }

  async completeStructured<T>(request: StructuredRequest<T>): Promise<T | null> {
    const jsonSchema = JSON.stringify(z.toJSONSchema(request.schema));
    const prompt = [
      request.user,
      '',
      '# Output format',
      'Respond with ONLY one JSON object — no prose before or after, no markdown',
      'fence. It must validate against this JSON Schema:',
      jsonSchema,
    ].join('\n');

    try {
      // Deferred so merely constructing the client (availability checks,
      // tests) never touches the SDK or its bundled CLI.
      const { query } = await import('@anthropic-ai/claude-agent-sdk');
      const turn = query({
        prompt,
        options: {
          systemPrompt: request.system,
          ...(this.requestedModel ? { model: this.requestedModel } : {}),
          maxTurns: 1,
          allowedTools: [],
          // No filesystem settings: the surrounding project's CLAUDE.md,
          // skills or MCP servers must never leak into a scoring-adjacent call.
          settingSources: [],
        },
      });

      const timer = setTimeout(() => {
        void turn.interrupt().catch(() => undefined);
      }, CLAUDE_AGENT_TIMEOUT_MS);
      timer.unref?.();

      let resultText: string | null = null;
      try {
        for await (const message of turn) {
          if (message.type === 'result') {
            resultText = message.subtype === 'success' ? message.result : null;
          }
        }
      } finally {
        clearTimeout(timer);
      }

      if (resultText === null) return null;
      return extractStructured(resultText, request.schema);
    } catch {
      return null;
    }
  }
}
