import { describe, expect, it } from 'vitest';
import type { ClaudeQuery } from '@sysdesign/llm';

import {
  classifyResult,
  criticGate,
  ReviewUnavailableError,
  runClaude,
  subscriptionProblem,
  type ClaudeCall,
  type TurnResult,
} from './claude';

const success = (over: Partial<TurnResult> = {}): TurnResult => ({
  subtype: 'success',
  is_error: false,
  total_cost_usd: 0.01,
  ...over,
});

/**
 * This decides whether a failed call *blocks* a change or merely stands aside,
 * which makes it as gate-critical as the merge policy. Getting it wrong in
 * either direction is bad: a budget stop that blocks refuses a commit over cost,
 * and a genuine failure that stands aside lets an unreviewed change through.
 */
describe('classifyResult', () => {
  it('returns the API-enforced structured output and the cost', () => {
    expect(classifyResult(success({ structured_output: { findings: [] } }), null, 0.25)).toEqual({
      data: { findings: [] },
      costUsd: 0.01,
    });
  });

  it('falls back to a JSON result string, and refuses a success with neither', () => {
    expect(classifyResult(success({ result: '{"ok":true}' }), null, 0.25).data).toEqual({
      ok: true,
    });
    expect(() => classifyResult(success({ result: 'prose' }), null, 0.25)).toThrow(
      /no structured output despite a schema/,
    );
  });

  it('treats reaching the spend cap as "not reviewed", not as a failure', () => {
    const run = () =>
      classifyResult(
        { subtype: 'error_max_budget_usd', is_error: true, total_cost_usd: 0.31, errors: [] },
        null,
        0.25,
      );
    expect(run).toThrow(ReviewUnavailableError);
    expect(run).toThrow(/\$0\.25 budget was reached \(\$0\.3100 spent\)/);
  });

  it('surfaces an API error with the CLI\'s own reason — never as "not reviewed"', () => {
    const run = () =>
      classifyResult(
        success({ is_error: true, result: 'Invalid bearer token' }),
        'authentication_failed',
        0.25,
      );
    expect(run).toThrow(/claude reported an error: authentication_failed: Invalid bearer token/);
    expect(run).not.toThrow(ReviewUnavailableError);
  });

  it('surfaces every other stop with its errors, and a turn with no result at all', () => {
    expect(() =>
      classifyResult(
        {
          subtype: 'error_max_structured_output_retries',
          is_error: true,
          errors: ['schema never met'],
        },
        null,
        0.25,
      ),
    ).toThrow(/schema never met/);
    expect(() => classifyResult(null, null, 0.25)).toThrow(/without a result/);
  });
});

const call: ClaudeCall = {
  systemPrompt: 'system',
  userPrompt: 'the diff',
  schema: { type: 'object' },
  model: 'claude-haiku-4-5-20251001',
  budgetUsd: 0.25,
  timeoutMs: 1_000,
};

/**
 * A stand-in for the SDK's `query`: records what it was given, then replays
 * messages, optionally throwing afterwards as the real SDK does when the CLI
 * exits non-zero after an error result — or hangs until aborted.
 */
function scripted(messages: readonly unknown[] | 'hang', thenThrow?: Error) {
  const seen: { prompt?: unknown; options?: Record<string, unknown> } = {};
  const query = ((params: { prompt: unknown; options: Record<string, unknown> }) => {
    seen.prompt = params.prompt;
    seen.options = params.options;
    const abort = params.options['abortController'] as AbortController;
    return (async function* () {
      if (messages === 'hang') {
        await new Promise((_, reject) =>
          abort.signal.addEventListener('abort', () => reject(new Error('aborted'))),
        );
      } else {
        yield* messages;
        if (thenThrow) throw thenThrow;
      }
    })();
  }) as unknown as ClaudeQuery;
  return { query, seen };
}

describe('runClaude', () => {
  it('runs one bounded, tool-less turn with the schema enforced, the budget capped and no API key in its environment', async () => {
    const { query, seen } = scripted([
      { type: 'result', ...success({ structured_output: { ok: 1 } }) },
    ]);
    const env = { ANTHROPIC_API_KEY: 'sk-test', CODE_REVIEW_RUNNING: '1', HOME: '/h' };

    await expect(runClaude(call, { query, env })).resolves.toEqual({
      data: { ok: 1 },
      costUsd: 0.01,
    });
    expect(seen.prompt).toBe('the diff');
    expect(seen.options).toMatchObject({
      systemPrompt: 'system',
      model: 'claude-haiku-4-5-20251001',
      outputFormat: { type: 'json_schema', schema: { type: 'object' } },
      maxBudgetUsd: 0.25,
      tools: [],
      settingSources: [],
      persistSession: false,
    });
    expect(seen.options?.['env']).toEqual({ CODE_REVIEW_RUNNING: '1', HOME: '/h' });
  });

  it("keeps the assistant's error reason for a failed turn", async () => {
    const { query } = scripted([
      { type: 'assistant', error: 'rate_limit', message: { content: [] } },
      { type: 'result', ...success({ is_error: true, result: 'slow down' }) },
    ]);
    await expect(runClaude(call, { query, env: {} })).rejects.toThrow(/rate_limit: slow down/);
  });

  it("classifies the recorded result when the SDK then throws on the CLI's exit code", async () => {
    const exit = new Error('Claude Code returned an error result: Reached maximum budget ($0.25)');
    const budget = scripted(
      [
        {
          type: 'result',
          subtype: 'error_max_budget_usd',
          is_error: true,
          total_cost_usd: 0.27,
          errors: ['Reached maximum budget ($0.25)'],
        },
      ],
      exit,
    );
    const stopped = runClaude(call, { query: budget.query, env: {} });
    await expect(stopped).rejects.toBeInstanceOf(ReviewUnavailableError);
    await expect(
      runClaude(call, {
        query: scripted(
          [
            {
              type: 'result',
              subtype: 'error_max_budget_usd',
              is_error: true,
              total_cost_usd: 0.27,
              errors: [],
            },
          ],
          exit,
        ).query,
        env: {},
      }),
    ).rejects.toThrow(/\$0\.25 budget was reached/);

    const apiError = scripted(
      [
        { type: 'assistant', error: 'rate_limit', message: { content: [] } },
        { type: 'result', ...success({ is_error: true, result: 'slow down' }) },
      ],
      new Error('Claude Code returned an error result: slow down'),
    );
    await expect(runClaude(call, { query: apiError.query, env: {} })).rejects.toThrow(
      /rate_limit: slow down/,
    );

    const noResult = scripted([], new Error('spawn failed'));
    await expect(runClaude(call, { query: noResult.query, env: {} })).rejects.toThrow(
      'spawn failed',
    );
  });

  it('stands aside when the turn outlives its timeout', async () => {
    const { query } = scripted('hang');
    await expect(runClaude({ ...call, timeoutMs: 20 }, { query, env: {} })).rejects.toBeInstanceOf(
      ReviewUnavailableError,
    );
  });
});

describe('the subscription gate', () => {
  const account = (info: Record<string, unknown>) =>
    (() => ({ accountInfo: () => Promise.resolve(info) })) as unknown as ClaudeQuery;

  it('finds no problem with a machine login or a setup-token token, and names what it found otherwise', async () => {
    await expect(
      subscriptionProblem({
        query: account({ apiProvider: 'firstParty', subscriptionType: 'Claude Max' }),
        env: {},
      }),
    ).resolves.toBeUndefined();
    await expect(
      subscriptionProblem({
        query: account({ apiProvider: 'firstParty', tokenSource: 'CLAUDE_CODE_OAUTH_TOKEN' }),
        env: {},
      }),
    ).resolves.toBeUndefined();
    const problem = await subscriptionProblem({
      query: account({ apiProvider: 'firstParty', tokenSource: 'none' }),
      env: {},
    });
    expect(problem).toMatch(/found no subscription login/);
    expect(problem).toMatch(/claude setup-token/);
  });

  it('skips the critics with the reason — never an API key — and runs them when there is none', () => {
    expect(criticGate({ reviewableFiles: 3, subscriptionProblem: undefined })).toBeUndefined();
    expect(criticGate({ reviewableFiles: 0, subscriptionProblem: undefined })).toBe(
      'critics skipped: no reviewable code in the change set',
    );
    const skipped = criticGate({
      reviewableFiles: 3,
      subscriptionProblem: 'found no subscription login',
    });
    expect(skipped).toBe('critics skipped: found no subscription login — deterministic rules only');
    expect(skipped).not.toContain('ANTHROPIC_API_KEY');
  });
});
