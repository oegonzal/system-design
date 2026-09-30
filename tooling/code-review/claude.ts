import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { query as sdkQuery } from '@anthropic-ai/claude-agent-sdk';
import {
  assertSubscriptionLogin,
  readClaudeAccount,
  subscriptionEnv,
  type ClaudeQuery,
} from '@sysdesign/llm';

const HERE = __dirname;

export interface ClaudeCall {
  /** Replaces Claude Code's own system prompt rather than appending to it. */
  systemPrompt: string;
  userPrompt: string;
  /** Parsed JSON Schema object, enforced by the API as the turn's output format. */
  schema: unknown;
  model: string;
  budgetUsd: number;
  timeoutMs: number;
}

export interface ClaudeResult<T> {
  data: T;
  costUsd: number;
}

/**
 * How the review reaches Claude Code: the Agent SDK's `query` (injectable, so
 * a spec never spawns the CLI) and the environment every call starts from
 * (`ReviewConfig.claudeEnv`).
 */
export interface ClaudeRuntime {
  query: ClaudeQuery;
  env: NodeJS.ProcessEnv;
}

export const defaultRuntime = (env: NodeJS.ProcessEnv): ClaudeRuntime => ({ query: sdkQuery, env });

/**
 * Raised when a call stopped for a reason that says nothing about the code —
 * the spend cap or a timeout. Callers treat this as "not reviewed" rather than
 * "review failed", because refusing a commit over cost would be indefensible.
 */
export class ReviewUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReviewUnavailableError';
  }
}

export const readPrompt = (relativePath: string): string =>
  readFileSync(join(HERE, relativePath), 'utf8');

export const readSchema = (relativePath: string): unknown =>
  JSON.parse(readFileSync(join(HERE, relativePath), 'utf8'));

/** The part of the SDK's closing `result` message this file reads. */
export interface TurnResult {
  subtype: string;
  is_error: boolean;
  result?: string;
  structured_output?: unknown;
  total_cost_usd?: number;
  errors?: string[];
}

function tryParse(text: string | undefined): unknown {
  if (text === undefined) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * Turns the end of a turn into data or the right kind of error.
 *
 * Exported because this decides whether a review *blocks* a change or merely
 * stands aside, which makes it as gate-critical as the merge policy itself:
 * a budget stop says nothing about the code, so it is a ReviewUnavailableError
 * and the caller stands aside; anything else that is not a schema-shaped
 * answer is a genuine failure and surfaces with the CLI's own reason.
 */
export function classifyResult<T>(
  result: TurnResult | null,
  assistantError: string | null,
  budgetUsd: number,
): ClaudeResult<T> {
  if (result === null) throw new Error('claude ended the turn without a result');
  const costUsd = result.total_cost_usd ?? 0;

  if (result.subtype === 'error_max_budget_usd') {
    return reject(
      new ReviewUnavailableError(
        `the $${budgetUsd.toFixed(2)} budget was reached ($${costUsd.toFixed(4)} spent). ` +
          'Reduce the change set, or raise the budget for this profile.',
      ),
    );
  }
  if (result.is_error || result.subtype !== 'success') {
    const detail =
      (result.subtype === 'success' ? result.result : result.errors?.join('; '))?.trim() ||
      result.subtype;
    return reject(
      new Error(
        `claude reported an error: ${assistantError ? `${assistantError}: ` : ''}${detail}`,
      ),
    );
  }

  const data = result.structured_output ?? tryParse(result.result);
  if (data === undefined) {
    return reject(
      new Error(
        `claude returned no structured output despite a schema being supplied:\n${String(
          result.result ?? '',
        ).slice(0, 500)}`,
      ),
    );
  }
  return { data: data as T, costUsd };
}

const reject = (error: Error): never => {
  throw error;
};

/**
 * One bounded reasoning step.
 *
 * The pipeline's rule is that deterministic code owns workflow control and the
 * model only performs bounded steps, so this offers no tools, no settings, no
 * session continuity and no way to read the repository — the caller supplies
 * every byte of context the model sees. The system prompt *replaces* Claude
 * Code's own, and the JSON Schema is enforced by the API as the output format,
 * so there is no validator or retry loop here.
 */
export async function runClaude<T>(
  call: ClaudeCall,
  runtime: ClaudeRuntime,
): Promise<ClaudeResult<T>> {
  const abort = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    abort.abort();
  }, call.timeoutMs);

  let result: TurnResult | null = null;
  let assistantError: string | null = null;
  try {
    const turn = runtime.query({
      prompt: call.userPrompt,
      options: {
        systemPrompt: call.systemPrompt,
        model: call.model,
        outputFormat: { type: 'json_schema', schema: call.schema as Record<string, unknown> },
        maxBudgetUsd: call.budgetUsd,
        tools: [],
        settingSources: [],
        persistSession: false,
        abortController: abort,
        env: subscriptionEnv(runtime.env),
      },
    });
    for await (const message of turn) {
      if (message.type === 'assistant' && message.error) assistantError = message.error;
      if (message.type === 'result') result = message as TurnResult;
    }
  } catch (error) {
    if (timedOut) throw new ReviewUnavailableError(`claude timed out after ${call.timeoutMs}ms`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
  if (timedOut && result === null) {
    throw new ReviewUnavailableError(`claude timed out after ${call.timeoutMs}ms`);
  }
  return classifyResult<T>(result, assistantError, call.budgetUsd);
}

/**
 * Why the critics cannot reach Claude Code on the subscription, or undefined
 * when they can — the same check, and the same idea of "the subscription",
 * the quality loop boots on.
 */
export async function subscriptionProblem(runtime: ClaudeRuntime): Promise<string | undefined> {
  try {
    await assertSubscriptionLogin(() => readClaudeAccount(runtime.env, runtime.query));
    return undefined;
  } catch (error) {
    return (error as Error).message;
  }
}

export interface CriticGateInput {
  /** Reviewable code files in the change set. */
  reviewableFiles: number;
  /** `await subscriptionProblem(runtime)`. */
  subscriptionProblem: string | undefined;
}

/**
 * Why the critics will not run, or `undefined` when they will.
 *
 * Pure and exported so the skip messages are testable: each reason is a
 * different fix — a fork PR has no secrets, a laptop may not be logged in, and
 * a docs-only change needs neither. Failing instead of skipping would be
 * indistinguishable from finding a real problem, so the review says plainly
 * that the critics did not look, runs the deterministic rules regardless, and
 * lets the exit code reflect what the rules found.
 */
export function criticGate({
  reviewableFiles,
  subscriptionProblem: problem,
}: CriticGateInput): string | undefined {
  if (reviewableFiles === 0) {
    return 'critics skipped: no reviewable code in the change set';
  }
  if (problem !== undefined) {
    return `critics skipped: ${problem} — deterministic rules only`;
  }
  return undefined;
}
