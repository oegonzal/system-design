/**
 * DAG orchestration: what a pipeline scheduler must demonstrate. Intro asks
 * for the load-bearing shapes (a scheduler, a worker pool, checkpointed run
 * state, queued dispatch); standard adds the operating discipline (step DLQs,
 * orphan reclaim, a fast status read path, observability); advanced demands
 * idempotent steps, scheduler HA and scale-to-zero economics.
 */
import type { CanvasNode, PatchOp } from '@sysdesign/contracts';

import type { GraphIndex } from '../../../graph-index';
import {
  configNumber,
  formatInt,
  sortById,
  SuggestedIds,
  uniqueSorted,
} from '../../../rules/shared';
import type { Expectation } from '../types';
import { met, unmet } from '../types';
import {
  dlqCoverage,
  monitoringPresence,
  onClientReadPath,
  suggestDlq,
  suggestMonitoring,
  suggestReadCache,
} from './shared';

const DAG_ORCHESTRATION = ['dag-orchestration'] as const;

/** The tier that owns the tick: a scheduler or a workflow engine. */
function orchestrators(index: GraphIndex): CanvasNode[] {
  return sortById([...index.byKind('scheduler'), ...index.byKind('workflow-engine')]);
}

function dispatchChannels(index: GraphIndex): CanvasNode[] {
  return sortById([...index.byKind('queue'), ...index.byKind('event-stream')]);
}

const schedulerPresent: Expectation = {
  id: 'exp.dag.scheduler-present',
  dimension: 'reliability',
  weight: 2,
  severityIfUnmet: 'critical',
  minDifficulty: 'intro',
  archetypes: DAG_ORCHESTRATION,
  title: 'Nothing owns the schedule',
  teach: (facts) =>
    `A DAG platform starts with the component that decides what runs next: something has to resolve dependencies, notice a run is due, and keep dispatching under ${formatInt(facts.scaleTargets.requestsPerSecond)} req/s of platform traffic. Without a scheduler (or workflow engine) the "orchestration" is whoever remembers to click run.`,
  satisfiedBy: ({ index }) => {
    const owners = orchestrators(index);
    if (owners.length > 0) return met(owners.map((node) => node.id));
    return unmet();
  },
  suggest: ({ index }) => {
    const ids = new SuggestedIds(index);
    const target =
      sortById(index.byKind('queue'))[0] ??
      sortById(index.byKind('worker'))[0] ??
      sortById(index.byKind('service'))[0];
    const schedulerId = ids.next('scheduler');
    return {
      description: 'Add the scheduler that owns dependency resolution and the tick.',
      ops: [
        { op: 'add-node', node: { id: schedulerId, kind: 'scheduler', label: 'DAG scheduler' } },
        ...(target
          ? [
              {
                op: 'add-edge' as const,
                edge: {
                  id: ids.next('edge-tick'),
                  source: schedulerId,
                  target: target.id,
                  kind: 'async' as const,
                },
              },
            ]
          : []),
      ],
    };
  },
};

const workerPool: Expectation = {
  id: 'exp.dag.worker-pool',
  dimension: 'scalability',
  weight: 2,
  severityIfUnmet: 'critical',
  minDifficulty: 'intro',
  archetypes: DAG_ORCHESTRATION,
  title: 'No worker pool runs the steps',
  teach: () =>
    'Steps are arbitrary compute — extracts, transforms, model runs — and the scheduler must never execute them itself, or one heavy step steals the tick from every other DAG. A worker pool consuming the dispatch channel runs steps in parallel and scales with the workload instead of with the scheduler.',
  satisfiedBy: ({ index }) => {
    const channels = dispatchChannels(index);
    const drains = channels.flatMap((channel) =>
      index.outEdges(channel.id).filter((edge) => index.byId(edge.target)?.kind === 'worker'),
    );
    if (drains.length > 0) {
      return {
        met: true,
        evidenceNodeIds: uniqueSorted(drains.map((edge) => edge.target)),
        evidenceEdgeIds: drains.map((edge) => edge.id).sort(),
      };
    }
    return unmet(sortById(index.byKind('worker')).map((node) => node.id));
  },
  suggest: ({ index }) => {
    const ids = new SuggestedIds(index);
    const channel = dispatchChannels(index)[0];
    const workerId = ids.next('worker');
    if (channel) {
      return {
        description: 'Add a worker pool that claims steps from the dispatch channel.',
        ops: [
          { op: 'add-node', node: { id: workerId, kind: 'worker', label: 'Step worker' } },
          {
            op: 'add-edge',
            edge: {
              id: ids.next('edge-claim'),
              source: channel.id,
              target: workerId,
              kind: 'async',
            },
          },
        ],
      };
    }
    const orchestrator = orchestrators(index)[0];
    const queueId = ids.next('queue');
    return {
      description: 'Dispatch steps through a queue into a worker pool that runs them.',
      ops: [
        {
          op: 'add-node',
          node: { id: queueId, kind: 'queue', label: 'Step queue', config: { dlq: true } },
        },
        { op: 'add-node', node: { id: workerId, kind: 'worker', label: 'Step worker' } },
        ...(orchestrator
          ? [
              {
                op: 'add-edge' as const,
                edge: {
                  id: ids.next('edge-dispatch'),
                  source: orchestrator.id,
                  target: queueId,
                  kind: 'async' as const,
                },
              },
            ]
          : []),
        {
          op: 'add-edge',
          edge: { id: ids.next('edge-claim'), source: queueId, target: workerId, kind: 'async' },
        },
      ],
    };
  },
};

const stateCheckpoint: Expectation = {
  id: 'exp.dag.state-checkpoint',
  dimension: 'data',
  weight: 2,
  severityIfUnmet: 'critical',
  minDifficulty: 'intro',
  archetypes: DAG_ORCHESTRATION,
  title: 'Run state is not checkpointed',
  teach: () =>
    'Recovery is the whole product: after any crash the platform must know which steps finished and resume from there, not rerun the DAG. That takes a run-state database both sides can reach — the scheduler to decide what is next, the workers to record what is done.',
  satisfiedBy: ({ index }) => {
    const databases = sortById(index.byKind('database'));
    if (databases.length === 0) return unmet();
    const owners = orchestrators(index);
    const workers = index.byKind('worker');
    const fromOrchestrator = databases.filter((db) =>
      owners.some((owner) => index.pathExists(owner.id, db.id)),
    );
    const fromWorker = databases.filter((db) =>
      workers.some((worker) => index.pathExists(worker.id, db.id)),
    );
    if (fromOrchestrator.length > 0 && fromWorker.length > 0) {
      return met(uniqueSorted([...fromOrchestrator, ...fromWorker].map((node) => node.id)));
    }
    return unmet(databases.map((node) => node.id));
  },
  suggest: ({ index }) => {
    const ids = new SuggestedIds(index);
    const owner = orchestrators(index)[0];
    const worker = sortById(index.byKind('worker'))[0];
    const existing = sortById(index.byKind('database'))[0];
    const ops: PatchOp[] = [];
    let databaseId: string;
    if (existing) {
      databaseId = existing.id;
    } else {
      databaseId = ids.next('database');
      ops.push({
        op: 'add-node',
        node: { id: databaseId, kind: 'database', label: 'Run-state DB' },
      });
    }
    if (owner && !(existing && index.pathExists(owner.id, existing.id))) {
      ops.push({
        op: 'add-edge',
        edge: {
          id: ids.next('edge-orch-state'),
          source: owner.id,
          target: databaseId,
          kind: 'sync',
        },
      });
    }
    if (worker && !(existing && index.pathExists(worker.id, existing.id))) {
      ops.push({
        op: 'add-edge',
        edge: {
          id: ids.next('edge-worker-state'),
          source: worker.id,
          target: databaseId,
          kind: 'sync',
        },
      });
    }
    if (ops.length === 0) return null;
    return {
      description: 'Checkpoint every step transition in a store both scheduler and workers reach.',
      ops,
    };
  },
};

const dispatchQueue: Expectation = {
  id: 'exp.dag.dispatch-queue',
  dimension: 'messaging',
  weight: 1.5,
  severityIfUnmet: 'high',
  minDifficulty: 'intro',
  archetypes: DAG_ORCHESTRATION,
  title: 'Steps dispatch as direct calls',
  teach: () =>
    'A scheduler that calls workers synchronously marries the tick to worker liveness: a busy pool blocks dispatch and a crashed worker takes the step down with it. Dispatch through a queue instead — the scheduler enqueues and moves on, workers claim work when ready, and an unclaimed step is redelivered rather than lost.',
  satisfiedBy: ({ index }) => {
    const owners = orchestrators(index);
    const syncDispatch = sortById(
      owners.flatMap((owner) =>
        index
          .outEdges(owner.id)
          .filter(
            (edge) => index.edgeKind(edge) === 'sync' && index.byId(edge.target)?.kind === 'worker',
          ),
      ),
    );
    const dispatchQueues = sortById(index.byKind('queue')).filter(
      (queue) =>
        owners.some((owner) => index.pathExists(owner.id, queue.id)) &&
        index.outEdges(queue.id).some((edge) => index.byId(edge.target)?.kind === 'worker'),
    );
    if (dispatchQueues.length > 0 && syncDispatch.length === 0) {
      return met(dispatchQueues.map((node) => node.id));
    }
    if (syncDispatch.length > 0) {
      return {
        met: false,
        evidenceNodeIds: uniqueSorted(syncDispatch.flatMap((edge) => [edge.source, edge.target])),
        evidenceEdgeIds: syncDispatch.map((edge) => edge.id).sort(),
      };
    }
    return unmet(owners.map((node) => node.id));
  },
  suggest: ({ index }) => {
    const owner = orchestrators(index)[0];
    const worker = sortById(index.byKind('worker'))[0];
    if (!owner || !worker) return null;
    const ids = new SuggestedIds(index);
    const direct = sortById(
      index
        .outEdges(owner.id)
        .filter((edge) => edge.target === worker.id && index.edgeKind(edge) === 'sync'),
    )[0];
    const queueId = ids.next('queue');
    return {
      description:
        'Insert a dispatch queue so a worker crash re-queues the step instead of losing it.',
      ops: [
        {
          op: 'add-node',
          node: { id: queueId, kind: 'queue', label: 'Step queue', config: { dlq: true } },
        },
        {
          op: 'add-edge',
          edge: {
            id: ids.next('edge-dispatch'),
            source: owner.id,
            target: queueId,
            kind: 'async',
          },
        },
        {
          op: 'add-edge',
          edge: { id: ids.next('edge-claim'), source: queueId, target: worker.id, kind: 'async' },
        },
        ...(direct ? [{ op: 'remove-edge' as const, edgeId: direct.id }] : []),
      ],
    };
  },
};

const stepDlq: Expectation = {
  id: 'exp.dag.step-dlq',
  dimension: 'messaging',
  weight: 1,
  severityIfUnmet: 'medium',
  minDifficulty: 'standard',
  archetypes: DAG_ORCHESTRATION,
  title: 'Failed steps have nowhere to go',
  teach: () =>
    'A step that fails deterministically — bad input file, broken transform — will fail on every retry, and without a dead-letter target it recycles through the dispatch queue in front of every healthy DAG. A DLQ quarantines the poison step for inspection while the rest of the platform keeps running.',
  satisfiedBy: dlqCoverage,
  suggest: suggestDlq,
};

const orphanReclaim: Expectation = {
  id: 'exp.dag.orphan-reclaim',
  dimension: 'reliability',
  weight: 1.5,
  severityIfUnmet: 'high',
  nfrKind: 'availability',
  minDifficulty: 'standard',
  archetypes: DAG_ORCHESTRATION,
  title: 'A dead worker orphans its step',
  teach: () =>
    'A worker that dies mid-step leaves the step claimed but never finished, and downstream DAG nodes wait on it forever. Reclaim orphans through the transport — at-least-once delivery with bounded retries redelivers the unacknowledged step — or through a distributed lock whose expiring lease frees the claim.',
  satisfiedBy: ({ index }) => {
    const locks = sortById(index.byKind('distributed-lock'));
    const redelivering = sortById(
      index
        .byKind('queue')
        .filter(
          (queue) =>
            queue.config?.delivery === 'at-least-once' &&
            configNumber(queue, 'maxRetries') !== undefined,
        ),
    );
    const evidence = sortById([...redelivering, ...locks]);
    if (evidence.length > 0) return met(evidence.map((node) => node.id));
    return unmet(sortById(index.byKind('queue')).map((node) => node.id));
  },
  suggest: ({ index }) => {
    const queue = sortById(index.byKind('queue')).find(
      (candidate) =>
        !(
          candidate.config?.delivery === 'at-least-once' &&
          configNumber(candidate, 'maxRetries') !== undefined
        ),
    );
    if (!queue) return null;
    return {
      description: 'Redeliver unacknowledged steps so a dead worker cannot orphan its work.',
      ops: [
        {
          op: 'update-node',
          nodeId: queue.id,
          set: { config: { ...queue.config, delivery: 'at-least-once', maxRetries: 5 } },
        },
      ],
    };
  },
};

const statusReadPath: Expectation = {
  id: 'exp.dag.status-read-path',
  dimension: 'performance',
  weight: 1,
  severityIfUnmet: 'medium',
  nfrKind: 'latency',
  minDifficulty: 'standard',
  archetypes: DAG_ORCHESTRATION,
  title: 'Status pages query the run-state primary',
  teach: (facts) =>
    `Run-status dashboards poll, and every poll hitting the same store the workers checkpoint into makes visibility compete with progress. A replica, cache, or KV store on the read path keeps status inside the p99 ${formatInt(facts.scaleTargets.p99LatencyMs)}ms budget without taxing the checkpoint writes.`,
  satisfiedBy: ({ index }) => {
    const readSide = onClientReadPath(index, ['replica', 'cache', 'kv-store']);
    if (readSide.length > 0) return met(readSide.map((node) => node.id));
    return unmet(sortById(index.byKind('database')).map((node) => node.id));
  },
  suggest: suggestReadCache,
};

const runsObserved: Expectation = {
  id: 'exp.dag.runs-observed',
  dimension: 'reliability',
  weight: 1,
  severityIfUnmet: 'medium',
  nfrKind: 'observability',
  minDifficulty: 'standard',
  archetypes: DAG_ORCHESTRATION,
  title: 'Pipeline runs execute unobserved',
  teach: () =>
    'The prompt asks for observability, and a DAG platform fails by falling behind: queues deepen, runs miss their windows, and downstream data quietly goes stale. A monitoring block watching dispatch depth, step failure rate and run duration makes lateness an alert instead of a discovery.',
  satisfiedBy: monitoringPresence,
  suggest: (ctx) => suggestMonitoring(ctx, 'Run monitoring'),
};

const idempotentSteps: Expectation = {
  id: 'exp.dag.idempotent-steps',
  dimension: 'data',
  weight: 2,
  severityIfUnmet: 'critical',
  nfrKind: 'consistency',
  minDifficulty: 'advanced',
  archetypes: DAG_ORCHESTRATION,
  title: 'Replayed steps corrupt their outputs',
  teach: () =>
    'Orphan reclaim and retries both mean steps replay, and a non-idempotent step replayed is appended rows, doubled aggregates, a partial file written twice. Every worker must be idempotent — same step key, same single output — so redelivery is a safety mechanism instead of a corruption vector.',
  satisfiedBy: ({ index }) => {
    const workers = sortById(index.byKind('worker'));
    if (workers.length === 0) return unmet();
    const replayable = workers.filter((worker) => worker.config?.idempotent !== true);
    if (replayable.length > 0) return unmet(replayable.map((node) => node.id));
    return met(workers.map((node) => node.id));
  },
  suggest: ({ index }) => {
    const worker = sortById(index.byKind('worker')).find(
      (candidate) => candidate.config?.idempotent !== true,
    );
    if (!worker) return null;
    return {
      description: 'Make the step worker idempotent so replays converge on the same output.',
      ops: [
        {
          op: 'update-node',
          nodeId: worker.id,
          set: { config: { ...worker.config, idempotent: true } },
        },
      ],
    };
  },
};

/**
 * Neither scheduler nor workflow-engine carries a replicas knob in the canvas
 * vocabulary, so HA is evidenced structurally: a second orchestrator node on
 * the canvas, or a distributed lock — the leader-election primitive that
 * makes running a standby safe.
 */
const schedulerHa: Expectation = {
  id: 'exp.dag.scheduler-ha',
  dimension: 'reliability',
  weight: 2,
  severityIfUnmet: 'critical',
  nfrKind: 'availability',
  minDifficulty: 'advanced',
  archetypes: DAG_ORCHESTRATION,
  title: 'The scheduler is a single point of failure',
  teach: (facts) =>
    `Every DAG stops when the scheduler dies, which makes it the one box the ${facts.scaleTargets.availabilityPct}% availability target cannot forgive. Run a standby orchestrator behind leader election — a distributed lock whose expiring lease hands the tick to the survivor — so scheduling outlives any single instance.`,
  satisfiedBy: ({ index }) => {
    const owners = orchestrators(index);
    const locks = sortById(index.byKind('distributed-lock'));
    if (owners.length >= 2) return met(owners.map((node) => node.id));
    if (locks.length > 0) return met(sortById([...owners, ...locks]).map((node) => node.id));
    return unmet(owners.map((node) => node.id));
  },
  suggest: ({ index }) => {
    const owner = orchestrators(index)[0];
    if (!owner) return null;
    const ids = new SuggestedIds(index);
    const lockId = ids.next('distributed-lock');
    return {
      description: 'Guard the scheduler with a leader-election lock so a standby can take over.',
      ops: [
        {
          op: 'add-node',
          node: { id: lockId, kind: 'distributed-lock', label: 'Leader election' },
        },
        {
          op: 'add-edge',
          edge: { id: ids.next('edge-lease'), source: owner.id, target: lockId, kind: 'sync' },
        },
      ],
    };
  },
};

/**
 * Workers carry no autoscaling knob in the canvas vocabulary (that knob lives
 * on services), so scale-to-zero economics are evidenced either by serverless
 * compute — which scales to zero by construction — or by every worker pool
 * declaring an explicit `concurrency` bound, the sizing decision that makes
 * idle capacity deliberate instead of default.
 */
const scaleToZero: Expectation = {
  id: 'exp.dag.scale-to-zero',
  dimension: 'scalability',
  weight: 1,
  severityIfUnmet: 'medium',
  nfrKind: 'cost',
  minDifficulty: 'advanced',
  archetypes: DAG_ORCHESTRATION,
  title: 'The step fleet is sized for the nightly peak',
  teach: () =>
    'Batch DAGs are bursty by nature — the fleet that clears the nightly window sits idle the rest of the day, and the prompt caps spend. Run steps on serverless compute that scales to zero, or bound each worker pool with an explicit concurrency budget, so capacity follows the schedule instead of the peak.',
  satisfiedBy: ({ index }) => {
    const functions = sortById(index.byKind('serverless-function'));
    if (functions.length > 0) return met(functions.map((node) => node.id));
    const workers = sortById(index.byKind('worker'));
    if (
      workers.length > 0 &&
      workers.every((worker) => configNumber(worker, 'concurrency') !== undefined)
    ) {
      return met(workers.map((node) => node.id));
    }
    return unmet(workers.map((node) => node.id));
  },
  suggest: ({ index }) => {
    const worker = sortById(index.byKind('worker')).find(
      (candidate) => configNumber(candidate, 'concurrency') === undefined,
    );
    if (!worker) return null;
    return {
      description:
        'Bound the worker pool with a concurrency budget so idle capacity is deliberate.',
      ops: [
        {
          op: 'update-node',
          nodeId: worker.id,
          set: { config: { ...worker.config, concurrency: 8 } },
        },
      ],
    };
  },
};

export const dagOrchestrationExpectations: Expectation[] = [
  schedulerPresent,
  workerPool,
  stateCheckpoint,
  dispatchQueue,
  stepDlq,
  orphanReclaim,
  statusReadPath,
  runsObserved,
  idempotentSteps,
  schedulerHa,
  scaleToZero,
];
