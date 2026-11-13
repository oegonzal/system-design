import { randomUUID } from 'node:crypto';

import { MemoryService } from '@sysdesign/agentic-memory';
import {
  InMemoryRecordStore,
  InMemorySpaceStore,
  InMemoryVectorIndex,
  tableEmbedder,
  TEST_POLICY,
} from '@sysdesign/agentic-memory/testing';
import {
  REGISTER_MEMORY_DIGEST_STEP,
  type OrchestrationRunDto,
  type OrchestrationStepDto,
  type QualityRunReadDto,
  type QualityRunStatus,
  type StartOrchestrationRequest,
} from '@sysdesign/contracts';
import type { LoopClient } from '@sysdesign/loop-client';

import type { Clock } from '../common/clock';
import { DigestsService } from './digests/digests.service';
import { InMemoryDigestLedger } from './digests/persistence/in-memory-digest-ledger.testing';
import { SpacesService } from './spaces.service';

/** Where the specs' spaces say their policy came from. */
export const SPEC_POLICY_SOURCE = 'memory/spec';

/** The one instant the specs' memory layer reads as now. */
export const SPEC_NOW = '2026-10-16T00:00:00.000Z';
const specClock: Clock = () => new Date(SPEC_NOW);

/** An orchestration a spec's code started, under the id the loop answered it with. */
interface StartedOrchestration {
  orchestrationRunId: string;
  orchestrator: string;
  request: StartOrchestrationRequest;
}

/**
 * A loop that has exactly the runs a spec names, records each orchestration
 * it is asked to start, and holds the orchestration records a spec sets — so
 * a spec settles a started orchestration by setting its record.
 */
export interface SpecLoop extends Pick<
  LoopClient,
  'getRun' | 'startOrchestration' | 'getOrchestration'
> {
  readonly started: StartedOrchestration[];
  readonly orchestrations: Map<string, OrchestrationRunDto>;
}

export function loopWith(runs: Readonly<Record<string, QualityRunReadDto>> = {}): SpecLoop {
  const started: StartedOrchestration[] = [];
  const orchestrations = new Map<string, OrchestrationRunDto>();
  return {
    started,
    orchestrations,
    getRun: (runId) => Promise.resolve(runs[runId] ?? null),
    startOrchestration: (orchestrator, request) => {
      const orchestrationRunId = randomUUID();
      started.push({ orchestrationRunId, orchestrator, request });
      return Promise.resolve({ orchestrationRunId, status: 'running' });
    },
    getOrchestration: (orchestrationRunId) =>
      Promise.resolve(orchestrations.get(orchestrationRunId) ?? null),
  };
}

/**
 * The record the loop holds for a started orchestration: the goal and budget
 * it was started on, ended as `status` says, and its digest step as a spec
 * scripts it — complete, under one digest run, reporting nothing unless the
 * spec says what.
 */
export function digestRecord(
  { orchestrationRunId, orchestrator, request }: StartedOrchestration,
  step: Partial<OrchestrationStepDto> = {},
  status: QualityRunStatus = 'complete',
): OrchestrationRunDto {
  return {
    orchestrationRunId,
    orchestrator,
    pipeline: null,
    status,
    startedAt: SPEC_NOW,
    finishedAt: status === 'running' ? null : SPEC_NOW,
    request: {
      goal: request.goal,
      outputProvided: false,
      criteriaProvided: false,
      acceptAt: null,
      adoptedFrom: null,
      maxIterations: request.maxIterations ?? 1,
      samples: null,
    },
    openedBy: null,
    context: {},
    steps: {
      [REGISTER_MEMORY_DIGEST_STEP]: {
        status: 'complete',
        reason: null,
        runIds: ['digest-run-1'],
        note: null,
        counts: {},
        report: null,
        startedAt: SPEC_NOW,
        finishedAt: SPEC_NOW,
        ...step,
      },
    },
    error: null,
  };
}

/**
 * The memory layer as the module composes it, over the runtime's in-memory
 * ports instead of Postgres and its vector table, under the runtime's own test policy:
 * the memory service, the space store it keeps spaces in, and the spaces
 * service reading runs from the loop a spec hands in.
 */
export function memoryUnderTest(loop: Pick<LoopClient, 'getRun'>) {
  const spaces = new InMemorySpaceStore();
  const embedder = tableEmbedder({ model: 'spec-embedder', dimensions: 4 });
  const memory = new MemoryService({
    records: new InMemoryRecordStore(),
    spaces,
    index: new InMemoryVectorIndex(`spec__${embedder.model}`),
    embedder,
    clock: specClock,
    ids: randomUUID,
    warn: () => undefined,
  });
  return {
    memory,
    spaces,
    service: new SpacesService(loop, memory, TEST_POLICY, SPEC_POLICY_SOURCE),
  };
}

/** The memory layer as `memoryUnderTest` composes it, and the digests service over it on the in-memory ledger. */
export function digestsUnderTest(loop: SpecLoop) {
  const layer = memoryUnderTest(loop);
  const ledger = new InMemoryDigestLedger();
  return { ...layer, ledger, digests: new DigestsService(loop, layer.memory, ledger, specClock) };
}
