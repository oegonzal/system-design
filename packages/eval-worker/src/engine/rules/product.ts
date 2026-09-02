/**
 * Product↔diagram alignment rules. Where the product bank EARNS the
 * dimension (are the stated contracts, events and budgets realized?), these
 * SUBTRACT for specific business-layer defects: a read posing as the write
 * path, an event emitted into nowhere, an aggregate served but unfed, a
 * declared cadence that cannot meet the stated freshness bar.
 *
 * The entire pack gates on `ctx.facts.workflow` — no spec, no product
 * findings, and therefore no product dimension. Severity follows the
 * corroboration trichotomy: the canvas saying the OPPOSITE of a claim
 * (contradicted) outranks the canvas merely saying nothing (uncorroborated).
 */
import type { WorkflowItemVerdict, WorkflowReport } from '@sysdesign/contracts';

import { declaredPollIntervals, uniqueSorted } from './shared';
import { freshnessBudgetSeconds } from '../targets';
import type { EvalRule, RuleContext, RuleFinding } from '../types';
import { judgeGraphWorkflow, verdictById } from '../workflows';

/** The gate every rule in this pack shares. */
function reportFor(ctx: RuleContext): WorkflowReport | null {
  return judgeGraphWorkflow(ctx.index, ctx.facts.workflow);
}

const labelFor = (ctx: RuleContext, id: string) => ctx.index.byId(id)?.label ?? id;

const fulfillsKindMismatch: EvalRule = {
  id: 'product.fulfills-kind-mismatch',
  dimension: 'product',
  check(ctx) {
    const report = reportFor(ctx);
    if (!report) return [];
    const findings: RuleFinding[] = [];
    for (const item of report.items) {
      if (item.status !== 'contradicted' || !item.gaps.includes('ineligible-declaration')) continue;
      if (item.itemClass === 'transition' || item.itemClass === 'entity') continue;
      // A command item held only by query ops is a read posing as the write
      // path — the canvas states the opposite of the claim. Other mismatches
      // (role drift, kind-switch residue) are wrong but not inverted.
      const commandPosedAsRead =
        item.itemClass === 'operation-command' ||
        item.itemClass === 'ingest-push' ||
        item.itemClass === 'ingest-pull';
      findings.push({
        ruleId: fulfillsKindMismatch.id,
        dimension: 'product',
        severity: commandPosedAsRead ? 'high' : 'medium',
        title: `The declaration fulfilling ${item.itemId} cannot be that contract`,
        message: `${item.evidenceNodeIds.map((id) => `"${labelFor(ctx, id)}"`).join(', ')} claims to realize ${item.itemId}, but the declared operation's kind or its component's role is the wrong shape for it${commandPosedAsRead ? ' — a read cannot be the write path' : ''}. Change the operation's kind, move the claim to the component that actually owns it, or drop it.`,
        affectedNodeIds: [...item.evidenceNodeIds],
        affectedEdgeIds: [],
        suggestion: null,
      });
    }
    return findings;
  },
};

const fulfillsDuplicate: EvalRule = {
  id: 'product.fulfills-duplicate',
  dimension: 'product',
  check(ctx) {
    const workflow = ctx.facts.workflow;
    if (!workflow) return [];
    const findings: RuleFinding[] = [];
    const exclusive = new Set([
      ...workflow.operations.filter((op) => op.kind === 'command').map((op) => op.id),
      ...workflow.ingests.map((ingest) => ingest.id),
    ]);
    const owners = new Map<string, string[]>();
    for (const node of ctx.graph.nodes) {
      for (const op of node.operations ?? []) {
        if (op.fulfills !== undefined && exclusive.has(op.fulfills)) {
          owners.set(op.fulfills, [...(owners.get(op.fulfills) ?? []), node.id]);
        }
      }
    }
    for (const [itemId, nodeIds] of [...owners.entries()].sort()) {
      const distinct = uniqueSorted(nodeIds);
      if (distinct.length < 2) continue;
      findings.push({
        ruleId: fulfillsDuplicate.id,
        dimension: 'product',
        severity: 'medium',
        title: `Two components both claim to own ${itemId}`,
        message: `${distinct.map((id) => `"${labelFor(ctx, id)}"`).join(' and ')} each declare an operation fulfilling ${itemId}. A write contract has exactly one owner — two handlers for one command is how the same order gets processed twice. Queries may scale out; commands may not. Pick the owner and drop the other claim.`,
        affectedNodeIds: distinct,
        affectedEdgeIds: [],
        suggestion: null,
      });
    }
    return findings;
  },
};

function eventFindings(ctx: RuleContext): RuleFinding[] {
  const report = reportFor(ctx);
  if (!report) return [];
  const byId = verdictById(report);
  const findings: RuleFinding[] = [];
  for (const event of ctx.facts.workflow?.events ?? []) {
    const item = byId.get(event.id);
    if (!item || item.status !== 'uncorroborated') continue;
    if (item.gaps.includes('no-producer') && !item.gaps.includes('no-transport')) {
      findings.push({
        ruleId: 'product.event-no-producer',
        dimension: 'product',
        severity: 'medium',
        title: `Nothing emits ${event.id}`,
        message: `A channel carries ${event.id} as a message type, but no command operation declares that it publishes the event and connects to that channel. A transport with no producer is a promise with no promiser — mark the emitting operation's "emits" and draw its edge into the channel.`,
        affectedNodeIds: [...item.evidenceNodeIds],
        affectedEdgeIds: [],
        suggestion: null,
      });
    }
    if (item.gaps.includes('no-consumer') && !item.gaps.includes('no-transport')) {
      findings.push({
        ruleId: 'product.event-no-consumer',
        dimension: 'product',
        severity: 'medium',
        title: `Nothing consumes ${event.id}`,
        message: `${event.id} reaches its channel and stops. An event nobody consumes changes nothing downstream — the refund never updates the page, the failure never reaches an operator. Draw the consuming edge, carrying the channel's message type, into the component that reacts.`,
        affectedNodeIds: [...item.evidenceNodeIds],
        affectedEdgeIds: [],
        suggestion: null,
      });
    }
  }
  return findings;
}

const eventNoProducer: EvalRule = {
  id: 'product.event-no-producer',
  dimension: 'product',
  check: (ctx) =>
    eventFindings(ctx).filter((finding) => finding.ruleId === 'product.event-no-producer'),
};

const eventNoConsumer: EvalRule = {
  id: 'product.event-no-consumer',
  dimension: 'product',
  check: (ctx) =>
    eventFindings(ctx).filter((finding) => finding.ruleId === 'product.event-no-consumer'),
};

const emitsNotPublished: EvalRule = {
  id: 'product.emits-not-published',
  dimension: 'product',
  check(ctx) {
    const workflow = ctx.facts.workflow;
    if (!workflow) return [];
    const findings: RuleFinding[] = [];
    const transportsOf = (eventId: string) =>
      ctx.graph.nodes.filter((node) =>
        (node.operations ?? []).some((op) => op.fulfills === eventId),
      );
    for (const node of ctx.graph.nodes) {
      for (const op of node.operations ?? []) {
        for (const eventId of op.emits ?? []) {
          const channels = transportsOf(eventId);
          if (channels.length === 0) continue; // no transport at all — the bank's lesson
          const connected = channels.some((channel) =>
            ctx.graph.edges.some((edge) => edge.source === node.id && edge.target === channel.id),
          );
          if (connected) continue;
          const writesToStore = ctx.graph.edges.some(
            (edge) => edge.source === node.id && ctx.index.byId(edge.target)?.kind === 'database',
          );
          findings.push({
            ruleId: emitsNotPublished.id,
            dimension: 'product',
            severity: writesToStore ? 'high' : 'medium',
            title: `"${node.label}" declares ${eventId} but never reaches its channel`,
            message: writesToStore
              ? `"${node.label}" writes its store and claims to emit ${eventId}, but has no edge into the channel that carries it — the dual-write shape, stated in the author's own declarations. When the process dies between the write and the publish, the event is silently lost. Route the emission through the channel (or an outbox) instead.`
              : `"${node.label}" declares that it emits ${eventId}, but no edge connects it to the channel carrying that event. The declaration and the drawing disagree; add the edge or drop the claim.`,
            affectedNodeIds: [node.id],
            affectedEdgeIds: [],
            suggestion: null,
          });
        }
      }
    }
    return findings;
  },
};

const aggregationUnfed: EvalRule = {
  id: 'product.aggregation-unfed',
  dimension: 'product',
  check(ctx) {
    const report = reportFor(ctx);
    if (!report) return [];
    const byId = verdictById(report);
    const findings: RuleFinding[] = [];
    for (const agg of ctx.facts.workflow?.aggregations ?? []) {
      const item = byId.get(agg.id);
      if (!item || item.status !== 'uncorroborated') continue;
      if (!item.gaps.includes('not-fed') || item.gaps.includes('not-served')) continue;
      findings.push({
        ruleId: aggregationUnfed.id,
        dimension: 'product',
        severity: 'high',
        title: `${agg.id} is served but nothing feeds it`,
        message: `A query serves this aggregate, but its source events (${agg.sourceEventIds.join(', ')}) do not demonstrably flow to anything the serving component reads. A dashboard total that no stream feeds is a number that drifts from the truth the moment traffic moves. Wire the source events through their channels into the store the query reads.`,
        affectedNodeIds: [...item.evidenceNodeIds],
        affectedEdgeIds: [],
        suggestion: null,
      });
    }
    return findings;
  },
};

const freshnessUnachievable: EvalRule = {
  id: 'product.freshness-unachievable',
  dimension: 'product',
  nfrKind: 'consistency',
  check(ctx) {
    const workflow = ctx.facts.workflow;
    if (!workflow) return [];
    const findings: RuleFinding[] = [];
    for (const ingest of workflow.ingests) {
      if (ingest.mode !== 'pull') continue;
      const budget = freshnessBudgetSeconds(ctx.facts, ingest);
      if (budget === null) continue;
      const fulfillers = ctx.graph.nodes.filter((node) =>
        (node.operations ?? []).some((op) => op.fulfills === ingest.id),
      );
      for (const node of fulfillers) {
        const over = declaredPollIntervals(ctx.index, node.id).filter(
          (interval) => interval.seconds > budget,
        );
        for (const interval of over) {
          findings.push({
            ruleId: freshnessUnachievable.id,
            dimension: 'product',
            severity: 'high',
            title: `pollIntervalSeconds=${interval.seconds} cannot meet the ≤${budget}s freshness bar`,
            message: `The prompt promises this source's orders are visible within ${budget}s, but "${labelFor(ctx, interval.nodeId)}" polls every ${interval.seconds}s — by the author's own number, an order can wait ${interval.seconds}s before ingestion even begins. The declared cadence contradicts the stated budget: shorten the interval or contest the requirement.`,
            affectedNodeIds: [interval.nodeId],
            affectedEdgeIds: [],
            suggestion: {
              description: `Poll inside the budget: every ${Math.max(1, Math.floor(budget / 2))}s leaves room for the fetch and the indexing that follow.`,
              ops: [
                {
                  op: 'update-node',
                  nodeId: interval.nodeId,
                  // `set.config` replaces wholesale — carry the rest forward.
                  set: {
                    config: {
                      ...ctx.index.byId(interval.nodeId)?.config,
                      pollIntervalSeconds: Math.max(1, Math.floor(budget / 2)),
                    },
                  },
                },
              ],
            },
          });
        }
      }
    }
    return findings;
  },
};

const emitsIneligible: EvalRule = {
  id: 'product.emits-ineligible',
  dimension: 'product',
  check(ctx) {
    if (!ctx.facts.workflow) return [];
    const findings: RuleFinding[] = [];
    for (const node of ctx.graph.nodes) {
      for (const op of node.operations ?? []) {
        if ((op.emits ?? []).length === 0 || op.kind === 'command') continue;
        findings.push({
          ruleId: emitsIneligible.id,
          dimension: 'product',
          severity: 'medium',
          title: `A ${op.kind} operation on "${node.label}" claims to emit events`,
          message: `"${op.name}" is a ${op.kind}, but declares emissions (${(op.emits ?? []).join(', ')}). Reads that publish are writes in disguise — the judge ignores the claim, so the events still count as unproduced. Move the emission to the command that actually causes it.`,
          affectedNodeIds: [node.id],
          affectedEdgeIds: [],
          suggestion: null,
        });
      }
    }
    return findings;
  },
};

export const productRules: EvalRule[] = [
  fulfillsKindMismatch,
  fulfillsDuplicate,
  eventNoProducer,
  eventNoConsumer,
  emitsNotPublished,
  aggregationUnfed,
  freshnessUnachievable,
  emitsIneligible,
];
