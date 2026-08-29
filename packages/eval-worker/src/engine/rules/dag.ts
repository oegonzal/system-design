/**
 * Orchestration misuse: the control plane decides, the data plane works, and
 * dispatch between them is buffered. No archetype gate — each rule iterates
 * scheduler/workflow-engine nodes, so any design without an orchestrator is
 * untouched. The rules register under the dimension each lesson belongs to
 * (scalability or messaging), not under a dimension of their own.
 */
import type { CanvasNode } from '@sysdesign/contracts';

import type { GraphIndex } from '../graph-index';
import type { EvalRule, RuleFinding } from '../types';
import { sortById, SuggestedIds, uniqueSorted } from './shared';

/** The tier that owns the tick: a scheduler or a workflow engine. */
function orchestrators(index: GraphIndex): CanvasNode[] {
  return sortById([...index.byKind('scheduler'), ...index.byKind('workflow-engine')]);
}

/**
 * Data-plane targets only: an external API call or an object-store write is
 * step work. A scheduler writing run-state to a database is correct — that
 * checkpoint IS the control plane's job — so database is deliberately absent.
 */
const DATA_PLANE_TARGETS = new Set(['external-api', 'object-store']);

const schedulerDoesTheWork: EvalRule = {
  id: 'dag.scheduler-does-the-work',
  dimension: 'scalability',
  check({ index }) {
    const findings: RuleFinding[] = [];
    for (const owner of orchestrators(index)) {
      const workEdges = sortById(
        index.outEdges(owner.id).filter((edge) => {
          const kind = index.byId(edge.target)?.kind;
          return (
            index.edgeKind(edge) === 'sync' && kind !== undefined && DATA_PLANE_TARGETS.has(kind)
          );
        }),
      );
      if (workEdges.length === 0) continue;
      findings.push({
        ruleId: schedulerDoesTheWork.id,
        dimension: 'scalability',
        severity: 'high',
        title: 'The scheduler executes the steps itself',
        message: `"${owner.label}" makes synchronous data-plane calls — fetching from APIs, touching object storage — which means the component that owns the tick is also doing the work. One slow step now stalls dispatch for every workflow on the platform, and the scheduler scales with the workload instead of with the schedule. Keep the split: the control plane decides what runs, workers run it.`,
        affectedNodeIds: uniqueSorted([owner.id, ...workEdges.map((edge) => edge.target)]),
        affectedEdgeIds: uniqueSorted(workEdges.map((edge) => edge.id)),
        suggestion: null,
      });
    }
    return findings;
  },
};

const syncDispatch: EvalRule = {
  id: 'dag.sync-dispatch',
  dimension: 'messaging',
  check({ index }) {
    const findings: RuleFinding[] = [];
    const ids = new SuggestedIds(index);
    for (const owner of orchestrators(index)) {
      const directDispatch = sortById(
        index
          .outEdges(owner.id)
          .filter(
            (edge) => index.edgeKind(edge) === 'sync' && index.byId(edge.target)?.kind === 'worker',
          ),
      );
      for (const edge of directDispatch) {
        const worker = index.byId(edge.target);
        if (!worker) continue;
        const queueId = ids.next('queue');
        findings.push({
          ruleId: syncDispatch.id,
          dimension: 'messaging',
          severity: 'medium',
          title: 'Steps dispatch as synchronous calls',
          message: `"${owner.label}" calls "${worker.label}" synchronously, marrying the tick to worker liveness: a busy pool blocks dispatch, and a worker that crashes mid-call takes the step down with it. Dispatch through a queue — the scheduler enqueues and moves on, workers claim work when ready, and an unclaimed step is redelivered instead of lost.`,
          affectedNodeIds: uniqueSorted([owner.id, worker.id]),
          affectedEdgeIds: [edge.id],
          suggestion: {
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
                edge: {
                  id: ids.next('edge-claim'),
                  source: queueId,
                  target: worker.id,
                  kind: 'async',
                },
              },
              { op: 'remove-edge', edgeId: edge.id },
            ],
          },
        });
      }
    }
    return findings;
  },
};

const dynamicFanoutSync: EvalRule = {
  id: 'dag.dynamic-fanout-sync',
  dimension: 'scalability',
  check({ facts, index }) {
    if (facts.difficulty !== 'advanced') return [];
    const findings: RuleFinding[] = [];
    const ids = new SuggestedIds(index);
    for (const worker of sortById(index.byKind('worker'))) {
      const syncOut = sortById(
        index.outEdges(worker.id).filter((edge) => index.edgeKind(edge) === 'sync'),
      );
      if (syncOut.length <= 4) continue;
      const streamId = ids.next('event-stream');
      findings.push({
        ruleId: dynamicFanoutSync.id,
        dimension: 'scalability',
        severity: 'medium',
        title: 'A step fans out synchronously',
        message: `"${worker.label}" makes ${syncOut.length} synchronous calls, so a mapped step's width is bounded by what one worker can hold open at once — and dynamic fan-out is exactly the case where that width is decided at runtime. Publish the fan-out to a stream instead: each branch becomes its own message, the pool absorbs whatever width the run produces, and one slow branch stalls nothing.`,
        affectedNodeIds: [worker.id],
        affectedEdgeIds: syncOut.map((edge) => edge.id),
        suggestion: {
          description:
            'Publish fan-out branches to a stream so width is absorbed by the pool, not one call stack.',
          ops: [
            {
              op: 'add-node',
              node: { id: streamId, kind: 'event-stream', label: 'Fan-out stream' },
            },
            {
              op: 'add-edge',
              edge: {
                id: ids.next('edge-fanout'),
                source: worker.id,
                target: streamId,
                kind: 'async',
              },
            },
          ],
        },
      });
    }
    return findings;
  },
};

export const dagRules: EvalRule[] = [schedulerDoesTheWork, syncDispatch, dynamicFanoutSync];
