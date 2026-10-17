import {
  callLabel,
  parseArguments,
  type Ask,
  type StepRecord,
  type ToolCall,
  type ToolDeclaration,
  type ToolOutcome,
  type ToolPlan,
} from '@sysdesign/contracts';
import { BusCallAborted, PromptExpired } from '@sysdesign/notifications-client';

import {
  describeError,
  pushHistory,
  pushObservation,
  type LoopState,
  type SessionInput,
  type StepOutcome,
} from './loop-state';
import {
  approvalPrompt,
  approved,
  questionPrompt,
  questionReplyOf,
  sessionOrigin,
} from './operator-prompts';
import type { SessionDeps } from './ports';
import { railEnding } from './rails';

/**
 * What a step does once its plan is read back: the calls the read-back
 * allows, in order, each asked of the operator first when its tool declares
 * approval, stopping at the first that failed or was refused; and the
 * question a plan ends on, put to the operator and read back as an
 * observation.
 */

/** When an approval or a question stops waiting for the person. */
const expiry = (deps: SessionDeps, input: SessionInput): Date =>
  new Date(deps.clock().getTime() + input.settings.operator.expiresAfterMs);

const execute = (deps: SessionDeps, input: SessionInput, call: ToolCall): Promise<ToolOutcome> =>
  deps.catalog.execute(call.tool, parseArguments(call.argumentsJson) ?? {}, {
    signal: input.signal,
  });

/** The calls the read-back allows, in order, stopping at the first that failed or was refused. */
export async function executeCalls(
  deps: SessionDeps,
  input: SessionInput,
  state: LoopState,
  plan: ToolPlan,
  prefix: number,
  entry: StepRecord,
  step: number,
): Promise<StepOutcome> {
  const { settings } = input;
  let stoppedAt: string | null = null;
  for (const [position, call] of plan.calls.entries()) {
    if (position >= prefix || stoppedAt !== null) {
      pushHistory(state, settings, {
        call: callLabel(call.tool, call.argumentsJson),
        outcome: 'not-executed',
        note: stoppedAt ?? 'past the executable prefix',
      });
      continue;
    }
    const tool = deps.catalog.declaration(call.tool);
    const began = deps.clock();
    let outcome: ToolOutcome;
    if (tool === null) {
      outcome = { outcome: 'refused', summary: `no tool ${call.tool}`, data: null };
    } else if (tool.approval) {
      const verdict = await askApproval(deps, input, call, tool, step);
      if (verdict === 'unavailable') {
        return railEnding('operator-unavailable', `no answer to the approval of ${call.tool}`);
      }
      if (verdict === 'stopped') {
        return railEnding('stop-signal', 'told to stop while waiting for an approval');
      }
      outcome =
        verdict === 'yes'
          ? await execute(deps, input, call)
          : { outcome: 'refused', summary: 'the operator declined', data: null };
    } else {
      outcome = await execute(deps, input, call);
    }
    const durationMs = deps.clock().getTime() - began.getTime();
    entry.calls.push({
      tool: call.tool,
      argumentsJson: call.argumentsJson,
      outcome: outcome.outcome,
      summary: outcome.summary,
      durationMs,
    });
    pushObservation(state, settings, {
      step,
      tool: call.tool,
      argumentsJson: call.argumentsJson,
      outcome: outcome.outcome,
      result: outcome.summary,
    });
    pushHistory(state, settings, {
      call: callLabel(call.tool, call.argumentsJson),
      outcome: outcome.outcome,
      note: outcome.outcome === 'ok' ? null : outcome.summary,
    });
    deps.log.info(`step ${step}: ${call.tool} — ${outcome.outcome}`);
    if (outcome.outcome === 'ok') {
      state.counters.failedCalls = 0;
    } else {
      state.counters.failedCalls += 1;
      stoppedAt = `after ${call.tool} ${outcome.outcome === 'failed' ? 'failed' : 'was refused'} at call.${position + 1}`;
    }
  }
  return 'continue';
}

type ApprovalVerdict = 'yes' | 'no' | 'unavailable' | 'stopped';

async function askApproval(
  deps: SessionDeps,
  input: SessionInput,
  call: ToolCall,
  tool: ToolDeclaration,
  step: number,
): Promise<ApprovalVerdict> {
  const prompt = approvalPrompt(call, tool, sessionOrigin(input.record), expiry(deps, input));
  deps.log.info(`step ${step}: asking for approval of ${call.tool}`);
  try {
    const answer = await deps.operator.ask(prompt, input.signal);
    return approved(answer) ? 'yes' : 'no';
  } catch (error) {
    if (input.signal.aborted || error instanceof BusCallAborted) return 'stopped';
    deps.log.warn(`step ${step}: no approval — ${describeError(error)}`);
    return 'unavailable';
  }
}

/** The question a plan ends on, put to the operator; the answer becomes an observation the next plan reads. */
export async function askQuestion(
  deps: SessionDeps,
  input: SessionInput,
  state: LoopState,
  ask: Ask,
  entry: StepRecord,
  step: number,
): Promise<StepOutcome> {
  const { settings } = input;
  const asked = { ...ask, answer: null as string | null };
  entry.ask = asked;
  const prompt = questionPrompt(ask, sessionOrigin(input.record), expiry(deps, input));
  deps.log.info(`step ${step}: asking — ${ask.question}`);
  let reply;
  try {
    reply = questionReplyOf(ask, await deps.operator.ask(prompt, input.signal));
  } catch (error) {
    if (input.signal.aborted || error instanceof BusCallAborted) {
      return railEnding('stop-signal', 'told to stop while waiting for an answer');
    }
    const detail =
      error instanceof PromptExpired ? 'the question expired unanswered' : describeError(error);
    return railEnding('operator-unavailable', detail);
  }
  if (reply.kind === 'stop') return railEnding('stop-signal', 'the operator ended the session');
  asked.answer = reply.text;
  pushObservation(state, settings, {
    step,
    tool: 'ask',
    argumentsJson: JSON.stringify({ question: ask.question }),
    outcome: 'ok',
    result: `[operator] ${reply.text}`,
  });
  pushHistory(state, settings, {
    call: `ask ${JSON.stringify(ask.question)}`,
    outcome: 'ok',
    note: reply.text,
  });
  return 'continue';
}
