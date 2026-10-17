import {
  callLabel,
  composeToolGoalWithinBudget,
  GoalBudgetExceeded,
  routeToolPlan,
  stopsOf,
  TOOL_SESSION_TOPICS,
  TOOL_STEP_PIPELINE_ID,
  type QualityRunDto,
  type StepRecord,
  type SuccessCriterion,
  type ToolPlanReadout,
  type ToolSessionEnding,
  type ToolSessionFinished,
  type ToolSessionRecord,
  type ToolSessionStarted,
  type ToolSessionStepped,
} from '@sysdesign/contracts';
import {
  awaitRun,
  DerivationFailed,
  LoopRefused,
  LoopRunLost,
  LoopRunStale,
  LoopTimeout,
  LoopUnreachable,
} from '@sysdesign/loop-client';

import {
  describeError,
  emptyStep,
  freshState,
  pushHistory,
  pushObjections,
  settle,
  type LoopState,
  type SessionInput,
  type StepOutcome,
} from './loop-state';
import { summaryPrompt } from './operator-prompts';
import type { SessionDeps } from './ports';
import { railDetail, railEnding, trippedRail } from './rails';
import { askQuestion, executeCalls } from './step-execution';

export type { SessionInput } from './loop-state';

/** A run the loop recorded as failed decided nothing. */
class RunFailed extends Error {
  override readonly name = 'RunFailed';
}

/** A plan the loop could not give: the client's errors, a failed run, a goal that would not fit. */
const LOOP_FAULTS = [
  LoopUnreachable,
  LoopTimeout,
  LoopRunLost,
  LoopRunStale,
  LoopRefused,
  DerivationFailed,
  GoalBudgetExceeded,
  RunFailed,
] as const;

const isLoopFault = (error: unknown): boolean => LOOP_FAULTS.some((type) => error instanceof type);

/**
 * The session loop. It decides nothing of its own: every plan it acts on is
 * a quality-loop run it started and read back by the contracts' routing, and
 * what it adds is declared — the rails, the operator's say over a call its
 * tool declares approval for, and the bookkeeping of what each step did.
 */
export async function runSession(
  deps: SessionDeps,
  input: SessionInput,
): Promise<ToolSessionRecord> {
  const { record } = input;
  const startedAt = deps.clock();
  const state = freshState();
  const started: ToolSessionStarted = {
    service: record.service,
    sessionId: record.id,
    title: record.title,
    startedAt: record.startedAt,
  };
  await deps.events.publish(TOOL_SESSION_TOPICS.started, started);
  let ending: ToolSessionEnding;
  try {
    const criteria = await deriveOnce(deps, record);
    record.criteria = criteria;
    ending = await steps(deps, input, state, criteria, startedAt);
  } catch (error) {
    deps.log.warn(`session ${record.id} failed: ${describeError(error)}`);
    ending = railEnding('error', describeError(error));
  }
  return close(deps, record, ending);
}

/** The rubric, once; a loop that cannot derive one ends the session before any step. */
async function deriveOnce(
  deps: SessionDeps,
  record: ToolSessionRecord,
): Promise<SuccessCriterion[]> {
  const derived = await deps.loop.deriveCriteria({
    pipeline: TOOL_STEP_PIPELINE_ID,
    goal: record.mission,
  });
  return derived.criteria;
}

async function steps(
  deps: SessionDeps,
  input: SessionInput,
  state: LoopState,
  criteria: SuccessCriterion[],
  startedAt: Date,
): Promise<ToolSessionEnding> {
  for (let step = 1; ; step += 1) {
    const elapsedMs = deps.clock().getTime() - startedAt.getTime();
    const rail = trippedRail(state.counters, input.rails, step, elapsedMs);
    if (rail !== null) return railEnding(rail, railDetail(rail, state.counters, input.rails));
    if (input.signal.aborted) return railEnding('stop-signal', 'told to stop before the step');
    const outcome = await runStep(deps, input, state, criteria, step);
    if (outcome !== 'continue') return outcome;
  }
}

/** The loop asked for one plan: the goal composed within budget, the run started and awaited, the plan read back. */
async function decide(
  deps: SessionDeps,
  input: SessionInput,
  state: LoopState,
  criteria: SuccessCriterion[],
  step: number,
): Promise<{
  run: QualityRunDto;
  readout: ToolPlanReadout;
  composition: StepRecord['composition'];
}> {
  const { record, settings, signal } = input;
  const composed = composeToolGoalWithinBudget({
    mission: record.mission,
    tools: deps.catalog.declarations(),
    observations: state.observations,
    omittedObservations: state.droppedObservations,
    history: state.history,
    objections: state.objections,
    progress: { criteria, settled: state.settled },
    observed: state.observations.length > 0 || state.droppedObservations > 0,
    lastStep: state.lastStep,
    stepsLeft: input.rails.maxSteps - step + 1,
  });
  const { runId } = await deps.loop.startRun({
    pipeline: TOOL_STEP_PIPELINE_ID,
    goal: composed.goal,
    criteria: criteria.filter((criterion) => !state.settled.includes(criterion.id)),
    // On a state the last plan did not move there is no fresh observation
    // to beat a blind revise: the loop revises once from its own briefing.
    maxIterations: state.lastStep !== null && state.lastStep.ran === 0 ? 2 : 1,
  });
  const run = await awaitRun(deps.loop, runId, {
    pollEveryMs: settings.pollEveryMs,
    signal,
    ...(deps.sleep === undefined ? {} : { sleep: deps.sleep }),
  });
  if (run.status === 'failed') throw new RunFailed(run.error?.message ?? `run ${run.runId} failed`);
  return {
    run,
    readout: routeToolPlan(run, step),
    composition: {
      rung: composed.rung,
      bytes: composed.bytes,
      omittedObservations: composed.omittedObservations,
    },
  };
}

/** One step: compose, ask the loop, read the plan back, run what it allows, carry what it refused. */
async function runStep(
  deps: SessionDeps,
  input: SessionInput,
  state: LoopState,
  criteria: SuccessCriterion[],
  step: number,
): Promise<StepOutcome> {
  const { record, settings, signal } = input;
  let decided;
  try {
    decided = await decide(deps, input, state, criteria, step);
  } catch (error) {
    if (signal.aborted) return railEnding('stop-signal', 'told to stop while waiting on the loop');
    if (!isLoopFault(error)) throw error;
    state.counters.brainFaults += 1;
    const fault = describeError(error);
    deps.log.warn(`step ${step}: no plan — ${fault}`);
    const faulted = emptyStep(step, null, null, fault);
    record.steps.push(faulted);
    await announceStep(deps, record, faulted, false);
    return 'continue';
  }
  state.counters.brainFaults = 0;
  const { run, readout, composition } = decided;
  const entry: StepRecord = {
    ...emptyStep(step, run.runId, composition, null),
    finalDecision: run.trace?.finalDecision ?? null,
    executable: readout.executable,
    executePrefix: readout.executePrefix,
    objections: readout.objections,
  };
  record.steps.push(entry);
  pushObjections(state, readout.objections);
  const plan = readout.plan;
  if (!readout.executable || plan === null) {
    deps.log.info(`step ${step}: plan refused — ${readout.reason ?? 'no reason'}`);
    for (const call of plan?.calls ?? []) {
      pushHistory(state, settings, {
        call: callLabel(call.tool, call.argumentsJson),
        outcome: 'not-executed',
        note: readout.reason,
      });
    }
    state.counters.refusals += 1;
    state.lastStep = { ran: 0, calls: [] };
    await announceStep(deps, record, entry, false);
    return 'continue';
  }
  const executed = await executeCalls(deps, input, state, plan, readout.executePrefix, entry, step);
  if (executed !== 'continue') {
    await announceStep(deps, record, entry, false);
    return executed;
  }
  // Calls that ran, whatever they answered: a failure is the calls rail's to count, not the plans'.
  const ran = entry.calls.length;
  if (readout.executePrefix === plan.calls.length) settle(state, criteria, readout.passed);
  if (plan.ask !== null) {
    const asked = await askQuestion(deps, input, state, plan.ask, entry, step);
    if (asked !== 'continue') {
      await announceStep(deps, record, entry, false);
      return asked;
    }
  }
  let finished: ToolSessionEnding | null = null;
  if (plan.finish !== null) {
    entry.finish = plan.finish;
    finished = missionEnding(record.mission, plan.finish.cause, plan.finish.detail);
  }
  state.lastStep = {
    ran,
    calls: entry.calls.map((call) => ({
      tool: call.tool,
      argumentsJson: call.argumentsJson,
      outcome: call.outcome,
    })),
  };
  state.counters.refusals =
    ran === 0 && plan.ask === null && finished === null ? state.counters.refusals + 1 : 0;
  await announceStep(deps, record, entry, finished !== null);
  return finished ?? 'continue';
}

/** The mission's own stop: its cause word, what was observed, and the status the mission declares for it. */
function missionEnding(mission: string, cause: string, detail: string): ToolSessionEnding {
  const stop = stopsOf(mission).find((each) => each.cause === cause);
  return { cause, detail, status: stop?.ending ?? 'stopped' };
}

function announceStep(
  deps: SessionDeps,
  record: ToolSessionRecord,
  entry: StepRecord,
  finished: boolean,
): Promise<void> {
  const stepped: ToolSessionStepped = {
    service: record.service,
    sessionId: record.id,
    step: entry.step,
    loopRunId: entry.loopRunId,
    executable: entry.executable,
    calls: entry.calls.map((call) => ({ tool: call.tool, outcome: call.outcome })),
    asked: entry.ask !== null,
    finished,
  };
  return deps.events.publish(TOOL_SESSION_TOPICS.stepped, stepped);
}

/** The record closed, the end said on the bus, and the person told once. */
async function close(
  deps: SessionDeps,
  record: ToolSessionRecord,
  ending: ToolSessionEnding,
): Promise<ToolSessionRecord> {
  const now = deps.clock();
  record.status = ending.status;
  record.ending = ending;
  record.endedAt = now.toISOString();
  deps.log.info(`session ${record.id} ${ending.status}: ${ending.cause} — ${ending.detail}`);
  const finished: ToolSessionFinished = {
    service: record.service,
    sessionId: record.id,
    status: ending.status,
    cause: ending.cause,
    detail: ending.detail,
    steps: record.steps.length,
    endedAt: record.endedAt,
  };
  await deps.events.publish(TOOL_SESSION_TOPICS.finished, finished);
  await deps.operator.notify(summaryPrompt(record, now)).catch((error: unknown) => {
    deps.log.warn(`the session's notice was not published: ${describeError(error)}`);
  });
  return record;
}
