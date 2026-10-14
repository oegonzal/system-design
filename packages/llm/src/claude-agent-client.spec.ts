import { bound, bounded } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { ClaudeAgentLlmClient } from './claude-agent-client';
import { answer, said, scripted, succeeded } from './testing';
import type { ClaudeQuery } from './claude-account';
import type { LlmCall } from './exchange';
import { InFlightGate } from './in-flight-gate';
import { DEFAULT_RETRY_POLICY } from './llm-failure';
import { FEEDBACK_HEADING, PREVIOUS_REPLY_HEADING } from './structured-reply';

/**
 * The Claude client's call: asked again when a reply is refused or the
 * provider strains, each attempt on the record, and admitted through the
 * process gate. How a turn is read is in `claude-turn.spec.ts`; how a call
 * runs out of time, in `claude-agent-client.limits.spec.ts`.
 */
describe('a call that failed once', () => {
  const good = '{"answer":"hi"}';
  const bad = '{"answer":42}';

  /** A transport whose successive calls replay successive scripts. */
  const sequence = (scripts: readonly (readonly unknown[])[]) => {
    const prompts: string[] = [];
    let call = 0;
    const run = ((params: { prompt?: string; options?: Record<string, unknown> }) => {
      prompts.push(String(params.prompt ?? ''));
      const messages = scripts[Math.min(call++, scripts.length - 1)];
      return (async function* () {
        yield* messages;
      })();
    }) as unknown as ClaudeQuery;
    return { run, prompts, calls: () => call };
  };

  const errored = (error: string) => [
    said('m-1', '', { error }),
    { type: 'result', subtype: 'error_during_execution', is_error: true, errors: [error] },
  ];

  it("[QL-28] [QL-59] a schema miss is asked again at once, both attempts are on the record, and the second ask names the first's faults", async () => {
    const calls: LlmCall[] = [];
    const script = sequence([[succeeded(bad)], [succeeded(good)]]);
    const answered = await new ClaudeAgentLlmClient({ query: script.run })
      .withRecorder((call) => calls.push(call))
      .completeStructured({ system: 's', user: 'u', schema: answer });

    expect(answered).toEqual({ answer: 'hi' });
    expect(calls.map((call) => [call.attempt, call.outcome])).toEqual([
      [1, 'schema-miss'],
      [2, 'ok'],
    ]);
    // The second ask names the first's faults, after the output format, with
    // the refused reply as written — a correction, not another independent draw.
    expect(script.prompts[1]).toBe(
      `${script.prompts[0]}\n\n${FEEDBACK_HEADING}\n- answer: Invalid input: expected string, received number\n\n${PREVIOUS_REPLY_HEADING}\n${bad}`,
    );
    expect(calls.map((call) => call.salvage?.feedback)).toEqual([false, true]);
    expect(calls[0]?.salvage?.issues).toMatchObject([{ path: 'answer', soft: false }]);
  });

  it('[QL-59] the second ask carries a small reply as written, and not a 160k-character one', async () => {
    // A key the schema ignores carries the bulk: the one fault is the same either way.
    const huge = JSON.stringify({ answer: 42, pad: 'x'.repeat(160_000) });
    const script = sequence([[succeeded(huge)], [succeeded(good)]]);
    await new ClaudeAgentLlmClient({ query: script.run }).completeStructured({
      system: 's',
      user: 'u',
      schema: answer,
    });
    expect(script.prompts[1]).toContain(FEEDBACK_HEADING);
    expect(script.prompts[1]).toContain(
      '- answer: Invalid input: expected string, received number',
    );
    expect(script.prompts[1]).not.toContain(PREVIOUS_REPLY_HEADING);
    expect(script.prompts[1].length).toBeLessThan(DEFAULT_RETRY_POLICY.feedback.replyMaxChars);

    // The policy can switch the feedback off: then the ask is the one it was.
    const silent = sequence([[succeeded(bad)], [succeeded(good)]]);
    await new ClaudeAgentLlmClient({
      query: silent.run,
      retry: { ...DEFAULT_RETRY_POLICY, feedback: { issues: false, replyMaxChars: 0 } },
    }).completeStructured({ system: 's', user: 'u', schema: answer });
    expect(silent.prompts[1]).toBe(silent.prompts[0]);
  });

  it('[QL-59] a soft overrun is kept on the first attempt and recorded, and never costs another', async () => {
    const bounded10 = z.object({ answer: bounded.text(bound(10)) });
    const calls: LlmCall[] = [];
    const script = sequence([[succeeded('{"answer":"fourteen chars"}')]]);
    const answered = await new ClaudeAgentLlmClient({ query: script.run })
      .withRecorder((call) => calls.push(call))
      .completeStructured({ system: 's', user: 'u', schema: bounded10 });

    expect(answered).toEqual({ answer: 'fourteen chars' });
    expect(script.calls()).toBe(1);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      attempt: 1,
      outcome: 'ok',
      error: null,
      salvage: {
        from: 'result',
        feedback: false,
        issues: [],
        repairs: [],
        overruns: [{ path: 'answer', target: 10, ceiling: 50, actual: 14, handling: 'accepted' }],
      },
    });
    // The model was asked for the target; the schema it is parsed with accepts the ceiling.
    expect(calls[0]?.schema).toMatchObject({ properties: { answer: { maxLength: 10 } } });
  });

  it('[QL-59] a list past its ceiling is trimmed by whole items, and the record says what was dropped', async () => {
    // Two asked, four accepted (the floor); six written.
    const listed = z.object({ items: bounded.list(bound(2, 'list'), z.string()) });
    const calls: LlmCall[] = [];
    const six = JSON.stringify({ items: ['a', 'b', 'c', 'd', 'e', 'f'] });
    const answered = await new ClaudeAgentLlmClient({ query: sequence([[succeeded(six)]]).run })
      .withRecorder((call) => calls.push(call))
      .completeStructured({ system: 's', user: 'u', schema: listed });

    expect(answered).toEqual({ items: ['a', 'b', 'c', 'd'] });
    expect(calls[0]?.salvage).toMatchObject({
      overruns: [
        {
          path: 'items',
          kind: 'list',
          target: 2,
          ceiling: 4,
          actual: 6,
          handling: 'trimmed',
          dropped: 2,
        },
      ],
      repairs: [{ path: 'items', action: 'trimmed', detail: '2 dropped' }],
    });
  });

  it('[QL-59] the detailed call reports the faults of the last refused reply, and every ask after the first carries feedback', async () => {
    const calls: LlmCall[] = [];
    const script = sequence([[succeeded(bad)]]);
    const reply = await new ClaudeAgentLlmClient({
      query: script.run,
      sleep: async () => undefined,
    })
      .withRecorder((call) => calls.push(call))
      .completeStructuredDetailed({ system: 's', user: 'u', schema: answer });

    expect(reply).toMatchObject({
      value: null,
      overruns: [],
      issues: [{ path: 'answer', code: 'invalid_type', soft: false }],
    });
    expect(calls.map((call) => call.salvage?.feedback)).toEqual([false, true, true]);
    expect(script.prompts.slice(1).every((prompt) => prompt.includes(FEEDBACK_HEADING))).toBe(true);

    // An attempt that failed some other way leaves the refusal standing: the
    // next ask still names it, and the caller is handed it when attempts run out.
    const strained = sequence([[succeeded(bad)], errored('overloaded')]);
    const afterStrain = await new ClaudeAgentLlmClient({
      query: strained.run,
      sleep: async () => undefined,
    }).completeStructuredDetailed({ system: 's', user: 'u', schema: answer });
    expect(strained.calls()).toBe(DEFAULT_RETRY_POLICY.attempts);
    expect(strained.prompts[2]).toContain(FEEDBACK_HEADING);
    expect(afterStrain).toMatchObject({ value: null, issues: [{ path: 'answer', soft: false }] });

    // The one-method port is the same call's value, and a value carries its overruns.
    const detailed = await new ClaudeAgentLlmClient({
      query: sequence([[succeeded(good)]]).run,
    }).completeStructuredDetailed({ system: 's', user: 'u', schema: answer });
    expect(detailed).toEqual({ value: { answer: 'hi' }, issues: [], overruns: [], cause: null });
  });

  it('[QL-28] the first attempt stays visible, so the miss rate is still measurable', async () => {
    const calls: LlmCall[] = [];
    await new ClaudeAgentLlmClient({ query: sequence([[succeeded(bad)], [succeeded(good)]]).run })
      .withRecorder((call) => calls.push(call))
      .completeStructured({ system: 's', user: 'u', schema: answer });

    expect(calls[0]).toMatchObject({ attempt: 1, outcome: 'schema-miss', response: null });
    expect(calls.filter((call) => call.outcome === 'schema-miss')).toHaveLength(1);
  });

  it('[QL-28] a refused credential is never asked twice', async () => {
    const calls: LlmCall[] = [];
    const script = sequence([errored('authentication_failed')]);
    const answered = await new ClaudeAgentLlmClient({ query: script.run })
      .withRecorder((call) => calls.push(call))
      .completeStructured({ system: 's', user: 'u', schema: answer });

    expect(answered).toBeNull();
    // One ask, because a credential does not become valid in a second.
    expect(script.calls()).toBe(1);
    expect(calls).toHaveLength(1);
  });

  it('[QL-28] a call the provider refuses says why: its reply carries the error its record keeps', async () => {
    const calls: LlmCall[] = [];
    const script = sequence([errored('oauth_org_not_allowed')]);
    const reply = await new ClaudeAgentLlmClient({ query: script.run })
      .withRecorder((call) => calls.push(call))
      .completeStructuredDetailed({ system: 's', user: 'u', schema: answer });

    expect(reply.value).toBeNull();
    // Refused for good — one ask — and the reason in the reply as on the record.
    expect(script.calls()).toBe(1);
    const recorded = calls[0]?.error;
    expect(recorded?.name).toBe('oauth_org_not_allowed');
    expect(reply.cause).toBe(`${recorded?.name}: ${recorded?.message}`);
  });

  it('[QL-28] a strained provider is asked again, after waiting', async () => {
    const waits: number[] = [];
    const script = sequence([errored('overloaded'), [succeeded(good)]]);
    const answered = await new ClaudeAgentLlmClient({
      query: script.run,
      sleep: async (ms) => void waits.push(ms),
    }).completeStructured({ system: 's', user: 'u', schema: answer });

    expect(answered).toEqual({ answer: 'hi' });
    expect(waits).toEqual([DEFAULT_RETRY_POLICY.backoffMs]);
  });

  it('[QL-28] the attempts are bounded, and the last failure is reported honestly', async () => {
    const calls: LlmCall[] = [];
    const script = sequence([[succeeded(bad)]]);
    const answered = await new ClaudeAgentLlmClient({
      query: script.run,
      sleep: async () => undefined,
    })
      .withRecorder((call) => calls.push(call))
      .completeStructured({ system: 's', user: 'u', schema: answer });

    expect(answered).toBeNull();
    expect(script.calls()).toBe(DEFAULT_RETRY_POLICY.attempts);
    expect(calls.map((call) => call.attempt)).toEqual([1, 2, 3]);
    expect(calls.every((call) => call.outcome === 'schema-miss')).toBe(true);
  });

  it('[QL-28] each attempt takes its own permit rather than holding one across the wait', async () => {
    const gate = new InFlightGate({ policy: { ceiling: 1 } });
    const held: number[] = [];
    const script = sequence([errored('overloaded'), [succeeded(good)]]);
    await new ClaudeAgentLlmClient({
      query: script.run,
      gate,
      sleep: async () => void held.push(gate.snapshot().inFlight),
    }).completeStructured({ system: 's', user: 'u', schema: answer });

    // Nothing is in flight while we wait out a strained provider.
    expect(held).toEqual([0]);
  });
});

describe('the subscription client under the process gate', () => {
  const ok = [{ type: 'result', subtype: 'success', is_error: false, result: '{"answer":"hi"}' }];

  it('[QL-27] holds one permit for the span of a call and frees it afterwards', async () => {
    const gate = new InFlightGate({ policy: { ceiling: 1 } });
    const inside: number[] = [];
    const { run } = scripted(ok);
    const client = new ClaudeAgentLlmClient({
      query: run,
      gate,
      sink: () => inside.push(gate.snapshot().inFlight),
    });

    await client.completeStructured({ system: 's', user: 'u', schema: answer });
    expect(inside).toEqual([1]);
    expect(gate.snapshot()).toEqual({ ceiling: 1, inFlight: 0, waiting: 0 });
  });

  it('[QL-27] a wait for admission is recorded, never charged to the call', async () => {
    const gate = new InFlightGate({ policy: { ceiling: 1 } });
    const calls: LlmCall[] = [];
    const { run } = scripted(ok);
    const client = new ClaudeAgentLlmClient({ query: run, gate, sink: (call) => calls.push(call) });

    // One permit, two callers: the second cannot start until the first is done.
    await Promise.all([
      client.completeStructured({ system: 's', user: 'u', schema: answer }),
      client.completeStructured({ system: 's', user: 'u', schema: answer }),
    ]);

    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(call.outcome).toBe('ok');
      // Whatever it waited, the duration measures the model and nothing else.
      expect(call.durationMs).toBeGreaterThanOrEqual(0);
      expect(call.queuedMs).toBeGreaterThanOrEqual(0);
    }
  });

  it('[QL-27] a recording twin shares the gate rather than opening a second ceiling', async () => {
    const gate = new InFlightGate({ policy: { ceiling: 1 } });
    const { run } = scripted(ok);
    const seen: number[] = [];
    const twin = new ClaudeAgentLlmClient({ query: run, gate }).withRecorder(() =>
      seen.push(gate.snapshot().inFlight),
    );

    await twin.completeStructured({ system: 's', user: 'u', schema: answer });
    expect(seen).toEqual([1]);
  });
});
