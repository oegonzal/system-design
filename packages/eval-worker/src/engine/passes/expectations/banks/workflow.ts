/**
 * Workflow automation: what a multi-tenant trigger-and-action platform must
 * demonstrate. Intro asks for the load-bearing shapes (buffered trigger
 * intake, an executor pool, a run-state store, a governed front door);
 * standard adds the operating discipline (retry hygiene, delayed runs,
 * decoupled third parties, scoped credentials, observability); advanced
 * demands exactly-once actions, tenant isolation and regional redundancy.
 */
import { formatInt, sortById, SuggestedIds, uniqueSorted } from '../../../rules/shared';
import type { Expectation } from '../types';
import { met, unmet } from '../types';
import {
  dlqCoverage,
  monitoringPresence,
  regionSpread,
  suggestDlq,
  suggestMonitoring,
} from './shared';

const WORKFLOW_AUTOMATION = ['workflow-automation'] as const;

/**
 * The intake lesson is presence + feeding: triggers land on a buffer instead
 * of running inline. Whether anything drains the buffer is deliberately the
 * next expectation's lesson (executor-workers), so each finding teaches one
 * thing and its ghost fix — add the queue — actually resolves it.
 */
const triggerIntakeBuffer: Expectation = {
  id: 'exp.wfa.trigger-intake-buffer',
  dimension: 'messaging',
  weight: 2,
  severityIfUnmet: 'critical',
  minDifficulty: 'intro',
  archetypes: WORKFLOW_AUTOMATION,
  title: 'Triggers execute inline with the request',
  teach: (facts) =>
    `Every webhook and schedule tick across ${formatInt(facts.scaleTargets.concurrentUsers)} tenants arrives as a trigger, and this design runs the workflow inside the request that delivered it — one slow action and the intake stalls for everyone. Land triggers on a queue or stream first: accept instantly, execute at the platform's pace.`,
  satisfiedBy: ({ index }) => {
    const channels = sortById([...index.byKind('queue'), ...index.byKind('event-stream')]);
    const intakes = channels.filter((channel) =>
      index.inEdges(channel.id).some((edge) => {
        const kind = index.byId(edge.source)?.kind;
        return kind === 'client' || kind === 'gateway' || kind === 'service';
      }),
    );
    if (intakes.length > 0) return met(intakes.map((node) => node.id));
    return unmet(sortById(index.byKind('service')).map((node) => node.id));
  },
  suggest: ({ index }) => {
    const source =
      sortById(index.byKind('service'))[0] ??
      sortById(index.byKind('gateway'))[0] ??
      sortById(index.clients())[0];
    if (!source) return null;
    const ids = new SuggestedIds(index);
    const queueId = ids.next('queue');
    const worker = sortById(index.byKind('worker'))[0];
    return {
      description: 'Buffer triggers on a queue so intake accepts instantly and executes later.',
      ops: [
        {
          op: 'add-node',
          node: { id: queueId, kind: 'queue', label: 'Trigger queue', config: { dlq: true } },
        },
        {
          op: 'add-edge',
          edge: { id: ids.next('edge-intake'), source: source.id, target: queueId, kind: 'async' },
        },
        ...(worker
          ? [
              {
                op: 'add-edge' as const,
                edge: {
                  id: ids.next('edge-claim'),
                  source: queueId,
                  target: worker.id,
                  kind: 'async' as const,
                },
              },
            ]
          : []),
      ],
    };
  },
};

const executorWorkers: Expectation = {
  id: 'exp.wfa.executor-workers',
  dimension: 'scalability',
  weight: 2,
  severityIfUnmet: 'critical',
  minDifficulty: 'intro',
  archetypes: WORKFLOW_AUTOMATION,
  title: 'No executor tier drains the workflows',
  teach: () =>
    'A workflow platform is only as real as the tier that runs the steps: workers (or event-triggered functions) consuming the buffer are what turn "trigger accepted" into "actions executed". Without them the buffer is a place workflows go to wait forever, and scaling execution means scaling the API.',
  satisfiedBy: ({ index }) => {
    const channels = sortById([...index.byKind('queue'), ...index.byKind('event-stream')]);
    const drains = channels.flatMap((channel) =>
      index.outEdges(channel.id).filter((edge) => {
        const kind = index.byId(edge.target)?.kind;
        return kind === 'worker' || kind === 'serverless-function';
      }),
    );
    if (drains.length > 0) {
      return {
        met: true,
        evidenceNodeIds: uniqueSorted(drains.map((edge) => edge.target)),
        evidenceEdgeIds: drains.map((edge) => edge.id).sort(),
      };
    }
    return unmet(channels.map((node) => node.id));
  },
  suggest: ({ index }) => {
    const ids = new SuggestedIds(index);
    const channel = sortById([...index.byKind('queue'), ...index.byKind('event-stream')])[0];
    const workerId = ids.next('worker');
    if (channel) {
      return {
        description: 'Add an executor pool that drains the workflow buffer.',
        ops: [
          { op: 'add-node', node: { id: workerId, kind: 'worker', label: 'Action executor' } },
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
    const service = sortById(index.byKind('service'))[0];
    if (!service) return null;
    const queueId = ids.next('queue');
    return {
      description: 'Add a queue and an executor pool so workflows run off the request path.',
      ops: [
        {
          op: 'add-node',
          node: { id: queueId, kind: 'queue', label: 'Trigger queue', config: { dlq: true } },
        },
        { op: 'add-node', node: { id: workerId, kind: 'worker', label: 'Action executor' } },
        {
          op: 'add-edge',
          edge: { id: ids.next('edge-intake'), source: service.id, target: queueId, kind: 'async' },
        },
        {
          op: 'add-edge',
          edge: { id: ids.next('edge-claim'), source: queueId, target: workerId, kind: 'async' },
        },
      ],
    };
  },
};

const runStateStore: Expectation = {
  id: 'exp.wfa.run-state-store',
  dimension: 'data',
  weight: 2,
  severityIfUnmet: 'critical',
  minDifficulty: 'intro',
  archetypes: WORKFLOW_AUTOMATION,
  title: 'Run state lives nowhere durable',
  teach: () =>
    'A workflow run is state: which step finished, what each action returned, where to resume after a crash. If the executors cannot reach a database, that state lives in process memory — and an executor restart silently abandons every run it was carrying.',
  satisfiedBy: ({ index }) => {
    const databases = sortById(index.byKind('database'));
    const executors = [...index.byKind('worker'), ...index.byKind('serverless-function')];
    const stateStores = databases.filter((db) =>
      executors.some((executor) => index.pathExists(executor.id, db.id)),
    );
    if (stateStores.length > 0) return met(stateStores.map((node) => node.id));
    return unmet(databases.map((node) => node.id));
  },
  suggest: ({ index }) => {
    const executor =
      sortById(index.byKind('worker'))[0] ?? sortById(index.byKind('serverless-function'))[0];
    if (!executor) return null;
    const ids = new SuggestedIds(index);
    const existing = sortById(index.byKind('database'))[0];
    if (existing) {
      return {
        description: 'Wire the executors to the run-state store so progress survives a restart.',
        ops: [
          {
            op: 'add-edge',
            edge: {
              id: ids.next('edge-run-state'),
              source: executor.id,
              target: existing.id,
              kind: 'sync',
            },
          },
        ],
      };
    }
    const databaseId = ids.next('database');
    return {
      description: 'Checkpoint every run in a state store so progress survives a restart.',
      ops: [
        { op: 'add-node', node: { id: databaseId, kind: 'database', label: 'Run-state DB' } },
        {
          op: 'add-edge',
          edge: {
            id: ids.next('edge-run-state'),
            source: executor.id,
            target: databaseId,
            kind: 'sync',
          },
        },
      ],
    };
  },
};

const edgeFrontDoor: Expectation = {
  id: 'exp.wfa.edge-front-door',
  dimension: 'security',
  weight: 1.5,
  severityIfUnmet: 'high',
  minDifficulty: 'intro',
  archetypes: WORKFLOW_AUTOMATION,
  title: 'No governed front door for tenants',
  teach: (facts) =>
    `${formatInt(facts.scaleTargets.concurrentUsers)} tenants deliver webhooks and console traffic straight onto internal components — today every service is the front door. A gateway or load balancer at the edge is where tenant authentication, rate limiting and abuse shedding live; without one, each internal component reimplements them or skips them.`,
  satisfiedBy: ({ index }) => {
    const edgeTier = sortById([...index.byKind('gateway'), ...index.byKind('load-balancer')]);
    if (edgeTier.length === 0) return unmet(sortById(index.clients()).map((node) => node.id));
    const internals = [
      ...index.byKind('service'),
      ...index.byKind('worker'),
      ...index.byKind('database'),
    ];
    const exposed = sortById(index.clients()).filter((client) =>
      internals.some((internal) =>
        index.pathExists(client.id, internal.id, { avoidKinds: ['gateway', 'load-balancer'] }),
      ),
    );
    if (exposed.length > 0) return unmet(exposed.map((node) => node.id));
    return met(edgeTier.map((node) => node.id));
  },
  suggest: ({ index }) => {
    const client = sortById(index.clients())[0];
    const reachable = index.reachableFrom(index.clients().map((node) => node.id));
    const service = sortById(index.byKind('service')).find((node) => reachable.has(node.id));
    if (!client || !service) return null;
    const ids = new SuggestedIds(index);
    const gatewayId = ids.next('gateway');
    const direct = sortById(
      index.outEdges(client.id).filter((edge) => edge.target === service.id),
    )[0];
    return {
      description: 'Put an API gateway in front so tenant traffic has one governed entrance.',
      ops: [
        { op: 'add-node', node: { id: gatewayId, kind: 'gateway', label: 'API gateway' } },
        {
          op: 'add-edge',
          edge: {
            id: ids.next('edge-client-gw'),
            source: client.id,
            target: gatewayId,
            kind: 'sync',
          },
        },
        {
          op: 'add-edge',
          edge: {
            id: ids.next('edge-gw-service'),
            source: gatewayId,
            target: service.id,
            kind: 'sync',
          },
        },
        ...(direct ? [{ op: 'remove-edge' as const, edgeId: direct.id }] : []),
      ],
    };
  },
};

const retryDlq: Expectation = {
  id: 'exp.wfa.retry-dlq',
  dimension: 'messaging',
  weight: 1.5,
  severityIfUnmet: 'high',
  nfrKind: 'durability',
  minDifficulty: 'standard',
  archetypes: WORKFLOW_AUTOMATION,
  title: 'Failed workflow steps have nowhere to go',
  teach: () =>
    'Third-party actions fail routinely — expired credentials, changed APIs, tenant misconfiguration — and a step that fails forever must not block every other tenant queued behind it. A dead-letter queue quarantines the poison run for inspection and replay while the rest of the backlog keeps draining.',
  satisfiedBy: dlqCoverage,
  suggest: suggestDlq,
};

const schedulerForDelays: Expectation = {
  id: 'exp.wfa.scheduler-for-delays',
  dimension: 'reliability',
  weight: 1,
  severityIfUnmet: 'medium',
  minDifficulty: 'standard',
  archetypes: WORKFLOW_AUTOMATION,
  // Only a prompt that asks for delayed/scheduled steps grades this bar —
  // never fail a design for timer support no requirement requested.
  appliesWhen: (facts) => /delay|wait|schedul|timer/.test(facts.functionalText),
  title: 'Nothing owns time-based execution',
  teach: () =>
    '"Wait three days, then send the follow-up" is half of workflow automation, and sleeping inside an executor does not survive a deploy. A scheduler (or workflow engine) owns durable timers: the delay is a row, not a process, and firing it is a tick nothing has to stay alive for.',
  satisfiedBy: ({ index }) => {
    const timers = sortById([...index.byKind('scheduler'), ...index.byKind('workflow-engine')]);
    if (timers.length > 0) return met(timers.map((node) => node.id));
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
      description: 'Own delays with a scheduler so timers survive deploys and restarts.',
      ops: [
        { op: 'add-node', node: { id: schedulerId, kind: 'scheduler', label: 'Delay scheduler' } },
        ...(target
          ? [
              {
                op: 'add-edge' as const,
                edge: {
                  id: ids.next('edge-fire'),
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

const thirdPartyDecoupled: Expectation = {
  id: 'exp.wfa.third-party-decoupled',
  dimension: 'scalability',
  weight: 1.5,
  severityIfUnmet: 'high',
  minDifficulty: 'standard',
  archetypes: WORKFLOW_AUTOMATION,
  title: 'Third-party calls ride the execution path synchronously',
  teach: () =>
    'The platform calls APIs it does not control, and a synchronous call chains your throughput to the slowest third party any tenant configured. Reach external APIs asynchronously — enqueue the action, call from the executor, absorb their bad minute in your buffer instead of your latency.',
  satisfiedBy: ({ index }) => {
    const syncExternal = sortById(
      [...index.byKind('service'), ...index.byKind('worker')].flatMap((caller) =>
        index
          .outEdges(caller.id)
          .filter(
            (edge) =>
              index.edgeKind(edge) === 'sync' && index.byId(edge.target)?.kind === 'external-api',
          ),
      ),
    );
    if (syncExternal.length > 0) {
      return {
        met: false,
        evidenceNodeIds: uniqueSorted(syncExternal.map((edge) => edge.source)),
        evidenceEdgeIds: syncExternal.map((edge) => edge.id).sort(),
      };
    }
    return met(sortById(index.byKind('external-api')).map((node) => node.id));
  },
  suggest: ({ index }) => {
    const offending = sortById(
      [...index.byKind('service'), ...index.byKind('worker')].flatMap((caller) =>
        index
          .outEdges(caller.id)
          .filter(
            (edge) =>
              index.edgeKind(edge) === 'sync' && index.byId(edge.target)?.kind === 'external-api',
          ),
      ),
    )[0];
    if (!offending) return null;
    const ids = new SuggestedIds(index);
    const queueId = ids.next('queue');
    return {
      description: 'Buffer the third-party call so its bad minute cannot stall the platform.',
      ops: [
        {
          op: 'add-node',
          node: { id: queueId, kind: 'queue', label: 'Action queue', config: { dlq: true } },
        },
        {
          op: 'add-edge',
          edge: {
            id: ids.next('edge-enqueue'),
            source: offending.source,
            target: queueId,
            kind: 'async',
          },
        },
        {
          op: 'add-edge',
          edge: {
            id: ids.next('edge-call'),
            source: queueId,
            target: offending.target,
            kind: 'async',
          },
        },
        { op: 'remove-edge', edgeId: offending.id },
      ],
    };
  },
};

const credentialsScoped: Expectation = {
  id: 'exp.wfa.credentials-scoped',
  dimension: 'security',
  weight: 1,
  severityIfUnmet: 'medium',
  nfrKind: 'security',
  minDifficulty: 'standard',
  archetypes: WORKFLOW_AUTOMATION,
  title: 'Tenant credentials have no guarded home',
  teach: () =>
    "The platform holds every tenant's API keys and OAuth grants — the most radioactive data it owns — and nothing in this design guards them. A secrets manager (or auth service) scopes each credential to its tenant, rotates it, and keeps it out of the run-state store and executor environment.",
  satisfiedBy: ({ index }) => {
    const guards = sortById([...index.byKind('secrets-manager'), ...index.byKind('auth-service')]);
    if (guards.length > 0) return met(guards.map((node) => node.id));
    return unmet(
      sortById([...index.byKind('service'), ...index.byKind('worker')]).map((node) => node.id),
    );
  },
  suggest: ({ index }) => {
    const reader = sortById(index.byKind('worker'))[0] ?? sortById(index.byKind('service'))[0];
    if (!reader) return null;
    const ids = new SuggestedIds(index);
    const vaultId = ids.next('secrets-manager');
    return {
      description:
        'Keep tenant credentials in a secrets manager, fetched per action, never stored inline.',
      ops: [
        {
          op: 'add-node',
          node: { id: vaultId, kind: 'secrets-manager', label: 'Credentials vault' },
        },
        {
          op: 'add-edge',
          edge: { id: ids.next('edge-fetch'), source: reader.id, target: vaultId, kind: 'sync' },
        },
      ],
    };
  },
};

const tenantObservability: Expectation = {
  id: 'exp.wfa.tenant-observability',
  dimension: 'reliability',
  weight: 1,
  severityIfUnmet: 'medium',
  nfrKind: 'observability',
  minDifficulty: 'standard',
  archetypes: WORKFLOW_AUTOMATION,
  title: 'Workflow runs execute unobserved',
  teach: () =>
    'The prompt asks for observability, and in a multi-tenant platform a silent failure mode is a tenant-facing outage nobody sees. A monitoring block watching queue depth, run failure rate and per-tenant error spikes is what turns "workflows stopped" into a page instead of a support ticket.',
  satisfiedBy: monitoringPresence,
  suggest: (ctx) => suggestMonitoring(ctx, 'Run monitoring'),
};

const exactlyOnceActions: Expectation = {
  id: 'exp.wfa.exactly-once-actions',
  dimension: 'data',
  weight: 2,
  severityIfUnmet: 'critical',
  nfrKind: 'consistency',
  minDifficulty: 'advanced',
  archetypes: WORKFLOW_AUTOMATION,
  title: 'Redelivery replays tenant actions',
  teach: () =>
    "At-least-once delivery means every crash replays actions, and a replayed action is a duplicate email, a double charge, a second ticket — visible to the tenant's customers, not just the tenant. Make every queue-consuming executor idempotent: same run key, same single outcome, however many times the message arrives.",
  satisfiedBy: ({ index }) => {
    const queues = index.byKind('queue');
    const consumers = sortById(
      index
        .byKind('worker')
        .filter((worker) =>
          queues.some((queue) =>
            index.outEdges(queue.id).some((edge) => edge.target === worker.id),
          ),
        ),
    );
    if (consumers.length === 0) return unmet(sortById(queues).map((node) => node.id));
    const replayable = consumers.filter((worker) => worker.config?.idempotent !== true);
    if (replayable.length > 0) return unmet(replayable.map((node) => node.id));
    return met(consumers.map((node) => node.id));
  },
  suggest: ({ index }) => {
    const queues = index.byKind('queue');
    const worker = sortById(index.byKind('worker')).find(
      (candidate) =>
        candidate.config?.idempotent !== true &&
        queues.some((queue) =>
          index.outEdges(queue.id).some((edge) => edge.target === candidate.id),
        ),
    );
    if (!worker) return null;
    return {
      description: 'Make the executor idempotent so redelivered runs cannot repeat their actions.',
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

const tenantIsolation: Expectation = {
  id: 'exp.wfa.tenant-isolation',
  dimension: 'scalability',
  weight: 1.5,
  severityIfUnmet: 'high',
  minDifficulty: 'advanced',
  archetypes: WORKFLOW_AUTOMATION,
  title: 'One noisy tenant starves the rest',
  teach: () =>
    "One tenant importing a million rows will happily fill a shared FIFO queue while everyone else's workflows wait behind it. Keying the queue per tenant (or partitioning the stream) bounds the blast radius: a noisy tenant delays itself, and fairness becomes a property of the transport.",
  satisfiedBy: ({ index }) => {
    const keyedQueues = index
      .byKind('queue')
      .filter((queue) => queue.config?.ordering === 'per-key');
    const partitioned = index
      .byKind('event-stream')
      .filter((stream) => ((stream.config?.partitions as number | undefined) ?? 0) >= 2);
    const evidence = sortById([...keyedQueues, ...partitioned]);
    if (evidence.length > 0) return met(evidence.map((node) => node.id));
    return unmet(
      sortById([...index.byKind('queue'), ...index.byKind('event-stream')]).map((node) => node.id),
    );
  },
  suggest: ({ index }) => {
    const queue = sortById(index.byKind('queue')).find(
      (candidate) => candidate.config?.ordering !== 'per-key',
    );
    if (!queue) return null;
    return {
      description: 'Key the queue per tenant so a noisy tenant only delays itself.',
      ops: [
        {
          op: 'update-node',
          nodeId: queue.id,
          set: { config: { ...queue.config, ordering: 'per-key' } },
        },
      ],
    };
  },
};

/**
 * Workers carry no region knob in the canvas vocabulary, so regional spread
 * is read off the service/database tier the executors run beside — the same
 * evidence every bank's multi-region expectation accepts.
 */
const multiRegionWorkers: Expectation = {
  id: 'exp.wfa.multi-region-workers',
  dimension: 'reliability',
  weight: 2,
  severityIfUnmet: 'critical',
  nfrKind: 'availability',
  minDifficulty: 'advanced',
  archetypes: WORKFLOW_AUTOMATION,
  title: "One region runs every tenant's workflows",
  teach: (facts) =>
    `Tenants build their businesses on these workflows, and the ${facts.scaleTargets.availabilityPct}% availability target stops being achievable in one region — a regional outage pauses every automation for every tenant at once. Run the platform tier in at least two regions and decide, explicitly, how run state follows.`,
  satisfiedBy: (ctx) => regionSpread(ctx.index),
};

export const workflowAutomationExpectations: Expectation[] = [
  triggerIntakeBuffer,
  executorWorkers,
  runStateStore,
  edgeFrontDoor,
  retryDlq,
  schedulerForDelays,
  thirdPartyDecoupled,
  credentialsScoped,
  tenantObservability,
  exactlyOnceActions,
  tenantIsolation,
  multiRegionWorkers,
];
