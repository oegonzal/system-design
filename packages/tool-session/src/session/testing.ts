/**
 * The fakes a session is specced with. Pure — no vitest import — so a
 * program's own `bootApp` can take them too. The loop answers each start
 * with the next scripted shape, judged as a real run would have recorded it
 * and carrying the goal it was asked, so the read-back reads the index the
 * session wrote.
 */
import {
  judgedRun,
  TOOL_STEP_PIPELINE_ID,
  type DeriveCriteriaRequest,
  type DerivedCriteriaDto,
  type InteractionAnswer,
  type InteractionPrompt,
  type OrchestrationRunDto,
  type OrchestrationRunStartedDto,
  type PromptLibraryDocumentDto,
  type PromptLibraryEntryDto,
  type QualityLoopHealthDto,
  type QualityRunReadDto,
  type QualityRunStartedDto,
  type RetractedMemoryRunDto,
  type RunShape,
  type StartOrchestrationFromRunRequest,
  type StartOrchestrationRequest,
  type StartQualityRunRequest,
  type SuccessCriterion,
  type ToolOutcome,
} from '@sysdesign/contracts';
import { LoopClient } from '@sysdesign/loop-client';
import { PromptExpired } from '@sysdesign/notifications-client';
import { z } from 'zod';

import { defineTool, ToolCatalog, type RunnableTool } from '../catalog';
import type { OperatorPort, SessionDeps, SessionEventsPort, SessionLog } from './ports';
import type { ToolSessionSettings } from '../settings';

/** What the fake loop answers a start with: a shape, or one computed from the request it was given. */
export type ScriptedRun = RunShape | ((request: StartQualityRunRequest) => RunShape);

const notUsed = (what: string): never => {
  throw new Error(`the fake loop does not ${what}`);
};

export class FakeLoopClient extends LoopClient {
  readonly starts: StartQualityRunRequest[] = [];
  private readonly runs = new Map<string, QualityRunReadDto>();
  private next = 0;

  constructor(
    private readonly script: readonly ScriptedRun[],
    private readonly rubric: SuccessCriterion[] = [],
    /** Thrown by the derivation when set, so a spec can fault the start. */
    private readonly derivationError: Error | null = null,
  ) {
    super();
  }

  iterationEvidence(): never {
    return notUsed('read iteration evidence');
  }
  health(): Promise<QualityLoopHealthDto> {
    return Promise.resolve({
      status: 'ok',
      llm: { model: 'fake' },
      heartbeat: { heartbeatEveryMs: 1_000, staleAfterMs: 60_000 },
    } as QualityLoopHealthDto);
  }

  deriveCriteria(request: DeriveCriteriaRequest): Promise<DerivedCriteriaDto> {
    if (this.derivationError !== null) return Promise.reject(this.derivationError);
    return Promise.resolve({
      pipeline: request.pipeline,
      criteria: this.rubric,
      diagnostic: null,
      llm: { model: 'fake' },
      dumpRunId: null,
    });
  }

  startRun(request: StartQualityRunRequest): Promise<QualityRunStartedDto> {
    this.starts.push(request);
    const scripted = this.script[this.next];
    if (scripted === undefined)
      throw new Error(`the fake loop has no plan for run ${this.next + 1}`);
    this.next += 1;
    const shape = typeof scripted === 'function' ? scripted(request) : scripted;
    const run = judgedRun(TOOL_STEP_PIPELINE_ID, shape);
    const runId = `fake-run-${this.next}`;
    run.runId = runId;
    if (run.trace !== null) {
      run.trace.contract.goal = request.goal;
      run.trace.contract.criteria = [...(request.criteria ?? [])];
    }
    this.runs.set(runId, run);
    return Promise.resolve({ runId, status: 'complete' });
  }

  getRun(runId: string): Promise<QualityRunReadDto | null> {
    return Promise.resolve(this.runs.get(runId) ?? null);
  }

  listPrompts(): Promise<PromptLibraryEntryDto[]> {
    return notUsed('list prompts');
  }
  getPrompt(): Promise<PromptLibraryDocumentDto | null> {
    return notUsed('read prompts');
  }
  startOrchestration(
    _: string,
    __: StartOrchestrationRequest,
  ): Promise<OrchestrationRunStartedDto> {
    return notUsed('orchestrate');
  }
  startOrchestrationFromRun(
    _: string,
    __: StartOrchestrationFromRunRequest,
  ): Promise<OrchestrationRunStartedDto> {
    return notUsed('orchestrate');
  }
  getOrchestration(): Promise<OrchestrationRunDto | null> {
    return notUsed('read orchestrations');
  }
  retractMemory(): Promise<RetractedMemoryRunDto> {
    return notUsed('retract memory');
  }
}

/** What the fake operator answers each prompt with, in order: a choice by id, words, a command, or silence until expiry. */
export type ScriptedAnswer =
  { choice: string } | { text: string } | { command: string } | { expires: true };

export class FakeOperator implements OperatorPort {
  readonly asked: InteractionPrompt[] = [];
  /** The source each ask went out under, in the order of `asked`; null for the program's own. */
  readonly sources: (string | null)[] = [];
  readonly notices: InteractionPrompt[] = [];
  private next = 0;

  constructor(private readonly answers: readonly ScriptedAnswer[] = []) {}

  ask(
    prompt: InteractionPrompt,
    signal?: AbortSignal,
    source?: string,
  ): Promise<InteractionAnswer> {
    this.asked.push(prompt);
    this.sources.push(source ?? null);
    const scripted = this.answers[this.next];
    this.next += 1;
    if (scripted === undefined) {
      // Nothing scripted: the person never answers; the session is what ends the wait.
      return new Promise((_, reject) => {
        signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      });
    }
    if ('expires' in scripted) return Promise.reject(new PromptExpired(prompt.id));
    const reply =
      'choice' in scripted
        ? { kind: 'choice' as const, choiceId: scripted.choice }
        : 'text' in scripted
          ? { kind: 'text' as const, text: scripted.text }
          : { kind: 'command' as const, commandId: scripted.command };
    return Promise.resolve({
      promptId: prompt.id,
      reply,
      via: { channel: 'fake', ref: `a${this.next}` },
    });
  }

  notify(prompt: InteractionPrompt): Promise<void> {
    this.notices.push(prompt);
    return Promise.resolve();
  }
}

export class FakeEvents implements SessionEventsPort {
  readonly published: { topic: string; payload: unknown }[] = [];
  flushed = 0;

  publish(topic: string, payload: unknown): Promise<void> {
    this.published.push({ topic, payload });
    return Promise.resolve();
  }

  flush(): Promise<void> {
    this.flushed += 1;
    return Promise.resolve();
  }
}

export const quietLog: SessionLog = { info: () => undefined, warn: () => undefined };

/** A tool whose run is scripted: what it answers, or the error it throws. */
export const fakeTool = (
  name: string,
  effect: 'read' | 'write' | 'irreversible',
  approval: boolean,
  run: (args: Record<string, unknown>) => Promise<ToolOutcome>,
  parameters: z.ZodObject = z.object({ id: z.string().optional() }),
): RunnableTool =>
  defineTool(
    {
      name,
      description: `The fake ${name}.`,
      parameters,
      effect,
      approval,
      run: (args) => run(args),
    },
    'fake',
  );

export const okTool = (name: string, effect: 'read' | 'write' = 'read'): RunnableTool =>
  fakeTool(name, effect, false, (args) =>
    Promise.resolve({
      outcome: 'ok',
      summary: `${name} ran with ${JSON.stringify(args)}`,
      data: args,
    }),
  );

/** Settings a spec runs under: tight rails, no waiting, everything kept. */
export const sampleSettings = (
  overrides: Partial<ToolSessionSettings['rails']> = {},
): ToolSessionSettings => ({
  rails: {
    maxSteps: 6,
    maxMinutes: 60,
    maxConsecutiveRefusals: 2,
    maxFailedCalls: 2,
    maxBrainFaults: 2,
    ...overrides,
  },
  loopRecovery: { windowMs: 0, pauseMs: 1 },
  busRecovery: { windowMs: 0, pauseMs: 1 },
  operator: { expiresAfterMs: 60_000, pullWaitMs: 1_000, eventsPerPull: 10 },
  observations: { keep: 8 },
  history: { keep: 12 },
  pollEveryMs: 1,
  timeZone: 'UTC',
});

/** The deps a spec runs a session with, each a fake it can read afterwards. */
export function fakeDeps(
  loop: FakeLoopClient,
  tools: readonly RunnableTool[],
  operator = new FakeOperator(),
): SessionDeps & { operator: FakeOperator; events: FakeEvents } {
  const events = new FakeEvents();
  let tick = 0;
  return {
    loop,
    catalog: new ToolCatalog(tools),
    operator,
    events,
    clock: () => new Date(Date.UTC(2026, 9, 16, 12, 0, tick++)),
    log: quietLog,
    sleep: () => Promise.resolve(),
  };
}
