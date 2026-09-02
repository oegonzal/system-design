/**
 * Interface rules: once a design declares operations — what each component
 * serves, what each channel carries — those declarations become graded
 * evidence. The ENTIRE pack is feature-gated on `index.declaresOperations()`
 * (the responsibility-overlap rule gates on declared responsibilities, and
 * op-kind-mismatch's own trigger implies the gate), so a canvas that never
 * opens the interface editors is graded exactly as before. Like the archetype
 * packs, every rule registers under the dimension its lesson belongs to.
 */
import {
  INTERFACE_CAPABILITIES,
  eventsTransportedInto,
  eventsTransportedOutOf,
  isApiLikeRole,
  type CanvasEdge,
  type InterfaceRole,
  type NodeOperation,
  type OperationKind,
  type Severity,
} from '@sysdesign/contracts';

import type { GraphIndex } from '../graph-index';
import type { EvalRule, RuleFinding } from '../types';
import { readsFraction, sortById, uniqueSorted } from './shared';

function roleOf(kind: keyof typeof INTERFACE_CAPABILITIES): InterfaceRole {
  return INTERFACE_CAPABILITIES[kind].role;
}

/** Edges grouped by the id of the node that owns their operation vocabulary. */
function edgesByOwner(index: GraphIndex): Map<string, CanvasEdge[]> {
  const result = new Map<string, CanvasEdge[]>();
  for (const edge of index.edges()) {
    const owner = index.interfaceOwnerOf(edge);
    if (!owner) continue;
    const bucket = result.get(owner.id);
    if (bucket) {
      bucket.push(edge);
    } else {
      result.set(owner.id, [edge]);
    }
  }
  return result;
}

/** The edge's carried names that resolve to an owner-declared operation. */
function resolvedCarries(
  index: GraphIndex,
  edge: CanvasEdge,
): Array<{ name: string; op: NodeOperation }> {
  return index
    .carriedOps(edge)
    .filter((entry): entry is { name: string; op: NodeOperation } => entry.op !== null);
}

const unspecifiedInterface: EvalRule = {
  id: 'hygiene.unspecified-interface',
  dimension: 'hygiene',
  check({ facts, index }) {
    if (!index.declaresOperations()) return [];
    if (facts.difficulty === 'intro') return [];
    const severity: Severity = facts.difficulty === 'advanced' ? 'high' : 'medium';
    const owned = edgesByOwner(index);
    const findings: RuleFinding[] = [];
    for (const node of sortById(index.nodes())) {
      const role = roleOf(node.kind);
      // event-handler included: a silent event-driven node that owns a call edge
      // still owes an interface, exactly like an api that owns one.
      if (!isApiLikeRole(role) && role !== 'channel') continue;
      if ((node.operations?.length ?? 0) > 0) continue;
      const edges = owned.get(node.id) ?? [];
      if (edges.length === 0) continue;
      const noun = role === 'channel' ? 'message types' : 'operations';
      findings.push({
        ruleId: unspecifiedInterface.id,
        dimension: 'hygiene',
        severity,
        title: 'An interface everyone calls and nobody defines',
        message: `${edges.length} edge${edges.length > 1 ? 's' : ''} resolve${edges.length > 1 ? '' : 's'} to "${node.label}" as interface owner, yet it declares no ${noun} — the arrows say it is called, but not what can be asked of it. This design already names its ${noun} elsewhere, so the silent box reads as unfinished thinking, and an interface is a design decision no evaluator can make for you. Declare the ${noun} "${node.label}" serves; that surface is graded the same way the boxes and arrows are.`,
        affectedNodeIds: [node.id],
        affectedEdgeIds: uniqueSorted(edges.map((edge) => edge.id)),
        suggestion: null,
      });
    }
    return findings;
  },
};

const danglingCarries: EvalRule = {
  id: 'hygiene.dangling-carries',
  dimension: 'hygiene',
  check({ index }) {
    if (!index.declaresOperations()) return [];
    const findings: RuleFinding[] = [];
    for (const edge of sortById(index.edges())) {
      const dangling = index.carriedOps(edge).filter((entry) => entry.op === null);
      if (dangling.length === 0) continue;
      const owner = index.interfaceOwnerOf(edge);
      if (!owner) continue;
      const names = dangling.map((entry) => `"${entry.name}"`).join(', ');
      findings.push({
        ruleId: danglingCarries.id,
        dimension: 'hygiene',
        severity: 'low',
        title: 'An edge carries operations its owner never declared',
        message: `This edge references ${names}, but "${owner.label}" declares no operation by that name — a carried name is a contract reference, and this one points at a contract that does not exist. Declare the operation on "${owner.label}" so the reference lands, or drop it from the edge so the diagram stops promising an API that is not there.`,
        affectedNodeIds: [],
        affectedEdgeIds: [edge.id],
        suggestion: null,
      });
    }
    return findings;
  },
};

const unreferencedOperation: EvalRule = {
  id: 'hygiene.unreferenced-operation',
  dimension: 'hygiene',
  check({ facts, index, graph }) {
    if (!index.declaresOperations()) return [];
    // Only meaningful once the author annotates edges at all — a design that
    // declares operations but never uses carries has not opted into this.
    if (!index.edges().some((edge) => (edge.carries?.length ?? 0) > 0)) return [];
    const spec = facts.workflow;
    const findings: RuleFinding[] = [];
    for (const node of sortById(index.nodes())) {
      const declared = node.operations ?? [];
      if (declared.length === 0) continue;
      const carried = new Set<string>();
      for (const edge of [...index.inEdges(node.id), ...index.outEdges(node.id)]) {
        for (const name of edge.carries ?? []) carried.add(name);
      }
      // An api operation is exercised by being CALLED — its name carried on an
      // adjacent edge. An event-handler operation is exercised by the message
      // FLOW instead: it emits an event that is transported out, or consumes one
      // (per the workflow spec) that is transported in. Its own name is never
      // carried (the channel's message-type names are), so the name check alone
      // would false-flag every event-driven or scheduled operation — the ones
      // the product dimension simultaneously requires declared.
      const eventDriven = roleOf(node.kind) === 'event-handler';
      const exercised = (op: NodeOperation): boolean => {
        if (carried.has(op.name)) return true;
        if (!eventDriven) return false;
        if (
          (op.emits ?? []).length > 0 &&
          eventsTransportedOutOf(graph, node.id, op.emits ?? []).length > 0
        ) {
          return true;
        }
        const consumes = spec?.operations.find((item) => item.id === op.fulfills)?.consumes ?? [];
        return consumes.length > 0 && eventsTransportedInto(graph, node.id, consumes).length > 0;
      };
      const unreferenced = declared.filter((op) => !exercised(op));
      if (unreferenced.length === 0) continue;
      const names = unreferenced.map((op) => `"${op.name}"`).join(', ');
      const them = unreferenced.length > 1 ? 'them' : 'it';
      const howExercised = eventDriven
        ? `no edge carries ${them} and neither the events ${them === 'them' ? 'they emit' : 'it emits'} nor the ones ${them === 'them' ? 'they consume' : 'it consumes'} are wired`
        : `no edge touching it carries ${them}`;
      findings.push({
        ruleId: unreferencedOperation.id,
        dimension: 'hygiene',
        severity: 'low',
        title: 'Declared operations no edge exercises',
        message: `"${node.label}" declares ${names}, yet ${howExercised}. This design annotates its edges with the calls and events they carry, so an unexercised operation reads as either dead surface or a missing arrow — wire the flow that uses it, or prune it.`,
        affectedNodeIds: [node.id],
        affectedEdgeIds: [],
        suggestion: null,
      });
    }
    return findings;
  },
};

const SRP_MAX_RESPONSIBILITIES = 3;
const SRP_MAX_OPERATIONS = 8;

const srpOverload: EvalRule = {
  id: 'hygiene.srp-overload',
  dimension: 'hygiene',
  check({ index }) {
    if (!index.declaresOperations()) return [];
    const findings: RuleFinding[] = [];
    for (const node of sortById(index.nodes())) {
      // Overload applies to any operation-running node — an event-handler can be
      // just as overstuffed as an api.
      if (!isApiLikeRole(roleOf(node.kind))) continue;
      const responsibilities = node.responsibilities?.length ?? 0;
      const operations = node.operations?.length ?? 0;
      if (responsibilities <= SRP_MAX_RESPONSIBILITIES && operations <= SRP_MAX_OPERATIONS) {
        continue;
      }
      const loads: string[] = [];
      if (responsibilities > SRP_MAX_RESPONSIBILITIES) {
        loads.push(`${responsibilities} responsibilities`);
      }
      if (operations > SRP_MAX_OPERATIONS) loads.push(`${operations} operations`);
      findings.push({
        ruleId: srpOverload.id,
        dimension: 'hygiene',
        severity: 'low',
        title: 'One component wearing too many hats',
        message: `"${node.label}" declares ${loads.join(' and ')} — a surface that broad means every change lands here, every deploy risks all of it, and the component scales as one lump whichever duty is actually hot. Single responsibility is the split rule: carve the surface along its responsibilities until each component owns one reason to change.`,
        affectedNodeIds: [node.id],
        affectedEdgeIds: [],
        suggestion: null,
      });
    }
    return findings;
  },
};

const responsibilityOverlap: EvalRule = {
  id: 'hygiene.responsibility-overlap',
  dimension: 'hygiene',
  check({ index }) {
    // Gated on declared responsibilities rather than operations: overlap is
    // provable the moment two boxes claim the same job, ops declared or not.
    const byStatement = new Map<string, { statement: string; nodeIds: string[] }>();
    for (const node of index.nodes()) {
      const seen = new Set<string>(); // a node repeating itself is not cross-node overlap
      for (const responsibility of node.responsibilities ?? []) {
        const key = responsibility.trim().toLowerCase();
        if (key.length === 0 || seen.has(key)) continue;
        seen.add(key);
        const bucket = byStatement.get(key);
        if (bucket) {
          bucket.nodeIds.push(node.id);
        } else {
          byStatement.set(key, { statement: responsibility.trim(), nodeIds: [node.id] });
        }
      }
    }
    const findings: RuleFinding[] = [];
    for (const [, { statement, nodeIds }] of [...byStatement.entries()].sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    )) {
      if (nodeIds.length < 2) continue;
      findings.push({
        ruleId: responsibilityOverlap.id,
        dimension: 'hygiene',
        severity: 'low',
        title: 'Two components claim the same responsibility',
        message: `${nodeIds.length} components declare "${statement}" as their job, and a responsibility with two owners effectively has none — when it breaks, each owner assumes the other has it. Give the duty one home and let everyone else call that home.`,
        affectedNodeIds: uniqueSorted(nodeIds),
        affectedEdgeIds: [],
        suggestion: null,
      });
    }
    return findings;
  },
};

const eventOverSync: EvalRule = {
  id: 'messaging.event-over-sync',
  dimension: 'messaging',
  check({ index }) {
    if (!index.declaresOperations()) return [];
    const findings: RuleFinding[] = [];
    for (const edge of sortById(index.edges())) {
      if (index.edgeKind(edge) !== 'sync') continue;
      const facty = resolvedCarries(index, edge).filter(
        (entry) => entry.op.kind === 'event' || entry.op.kind === 'stream',
      );
      if (facty.length === 0) continue;
      const first = facty[0];
      const noun = first.op.kind === 'stream' ? 'a stream' : 'an event';
      findings.push({
        ruleId: eventOverSync.id,
        dimension: 'messaging',
        severity: 'medium',
        title: 'An event delivered as a blocking call',
        message: `This edge is synchronous, yet it carries "${first.name}" — declared as ${noun}: a fact to be announced, not a question to be awaited. Delivering it synchronously couples the publisher's latency and uptime to every listener, which is exactly the coupling the declaration says nobody wanted. Make the edge asynchronous so the fact is published and the caller moves on.`,
        affectedNodeIds: uniqueSorted([edge.source, edge.target]),
        affectedEdgeIds: [edge.id],
        suggestion: {
          description: 'Deliver the event asynchronously so publishing never waits on a listener.',
          ops: [{ op: 'update-edge', edgeId: edge.id, set: { kind: 'async' } }],
        },
      });
    }
    return findings;
  },
};

const queryOverAsync: EvalRule = {
  id: 'messaging.query-over-async',
  dimension: 'messaging',
  check({ index }) {
    if (!index.declaresOperations()) return [];
    const findings: RuleFinding[] = [];
    for (const edge of sortById(index.edges())) {
      if (index.edgeKind(edge) !== 'async') continue;
      const queries = resolvedCarries(index, edge).filter((entry) => entry.op.kind === 'query');
      if (queries.length === 0) continue;
      findings.push({
        ruleId: queryOverAsync.id,
        dimension: 'messaging',
        severity: 'low',
        title: 'A query answered over fire-and-forget transport',
        message: `This edge is asynchronous, yet it carries "${queries[0].name}" — a declared query, and a question needs its answer to come back to the asker. Async transport has no reply lane: the caller either blocks on a correlation dance that reinvents request/response, or never sees the result at all. Queries are synchronous by nature — make the edge match.`,
        affectedNodeIds: uniqueSorted([edge.source, edge.target]),
        affectedEdgeIds: [edge.id],
        suggestion: {
          description: 'Ask the question synchronously so the answer has a way back to the asker.',
          ops: [{ op: 'update-edge', edgeId: edge.id, set: { kind: 'sync' } }],
        },
      });
    }
    return findings;
  },
};

const nonIdempotentConsumer: EvalRule = {
  id: 'messaging.non-idempotent-consumer',
  dimension: 'messaging',
  check({ index }) {
    if (!index.declaresOperations()) return [];
    const findings: RuleFinding[] = [];
    const channels = sortById(index.nodes().filter((node) => roleOf(node.kind) === 'channel'));
    for (const channel of channels) {
      // Explicit at-most-once is the one delivery mode that never replays.
      if (channel.config?.['delivery'] === 'at-most-once') continue;
      for (const edge of sortById(index.outEdges(channel.id))) {
        if (index.interfaceOwnerOf(edge)?.id !== channel.id) continue;
        const consumer = index.byId(edge.target);
        if (!consumer) continue;
        const risky = resolvedCarries(index, edge).filter(
          (entry) =>
            (entry.op.kind === 'command' || entry.op.kind === 'event') &&
            entry.op.idempotent !== true,
        );
        if (risky.length === 0) continue;
        const proven = risky.find((entry) => entry.op.idempotent === false);
        const severity: Severity = proven ? 'high' : 'info';
        const exemplar = proven ?? risky[0];
        findings.push({
          ruleId: nonIdempotentConsumer.id,
          dimension: 'messaging',
          severity,
          title: 'Redelivery lands on a non-idempotent consumer',
          message: `"${channel.label}" delivers at-least-once, so "${consumer.label}" WILL see "${exemplar.name}" more than once — every crash or timeout between receive and acknowledge replays it${proven ? ', and the operation is declared non-idempotent, so each replay repeats the side effect' : ', and nothing declares the operation idempotent, so each replay may repeat the side effect'}. Key the handler so the same message converges to one outcome, then declare it idempotent so the contract says so.`,
          affectedNodeIds: [consumer.id],
          affectedEdgeIds: [edge.id],
          suggestion: null,
        });
      }
    }
    return findings;
  },
};

const eventPublishedNowhere: EvalRule = {
  id: 'messaging.event-published-nowhere',
  dimension: 'messaging',
  check({ index }) {
    if (!index.declaresOperations()) return [];
    const findings: RuleFinding[] = [];
    const channels = sortById(index.nodes().filter((node) => roleOf(node.kind) === 'channel'));
    for (const channel of channels) {
      const announced = (channel.operations ?? []).filter(
        (op) => op.kind === 'event' || op.kind === 'stream',
      );
      if (announced.length === 0) continue;
      if (index.outEdges(channel.id).length > 0) continue;
      const names = announced.map((op) => `"${op.name}"`).join(', ');
      findings.push({
        ruleId: eventPublishedNowhere.id,
        dimension: 'messaging',
        severity: 'medium',
        title: 'Events declared on a channel nobody consumes',
        message: `"${channel.label}" declares ${names}, but not a single out-edge leaves it — the facts are published and then they stop. An event's entire value lives in its listeners; draw the consumers that react to it, or the channel is a write-only log wearing a topic's name.`,
        affectedNodeIds: [channel.id],
        affectedEdgeIds: [],
        suggestion: null,
      });
    }
    return findings;
  },
};

const commandFanout: EvalRule = {
  id: 'messaging.command-fanout',
  dimension: 'messaging',
  check({ index }) {
    if (!index.declaresOperations()) return [];
    const findings: RuleFinding[] = [];
    const channels = sortById(index.nodes().filter((node) => roleOf(node.kind) === 'channel'));
    for (const channel of channels) {
      const carriers = new Map<string, string[]>();
      for (const edge of index.outEdges(channel.id)) {
        if (index.interfaceOwnerOf(edge)?.id !== channel.id) continue;
        for (const entry of resolvedCarries(index, edge)) {
          if (entry.op.kind !== 'command') continue;
          const bucket = carriers.get(entry.name);
          if (bucket) {
            bucket.push(edge.id);
          } else {
            carriers.set(entry.name, [edge.id]);
          }
        }
      }
      for (const [name, edgeIds] of [...carriers.entries()].sort(([a], [b]) =>
        a < b ? -1 : a > b ? 1 : 0,
      )) {
        const distinct = uniqueSorted(edgeIds);
        if (distinct.length < 2) continue;
        findings.push({
          ruleId: commandFanout.id,
          dimension: 'messaging',
          severity: 'medium',
          title: 'One command consumed by multiple owners',
          message: `"${name}" is a command on "${channel.label}", and ${distinct.length} distinct consumer edges claim it — one instruction executed by ${distinct.length} components, each believing it owns the outcome. Commands have exactly one handler; events are the shape that fans out. Route the command to its single owner, or redeclare it as an event if every listener genuinely reacts independently.`,
          affectedNodeIds: [],
          affectedEdgeIds: distinct,
          suggestion: null,
        });
      }
    }
    return findings;
  },
};

const READ_HEAVY_FRACTION = 0.9;

const queryOnWritePath: EvalRule = {
  id: 'performance.query-on-write-path',
  dimension: 'performance',
  check({ facts, index }) {
    if (!index.declaresOperations()) return [];
    const reads = readsFraction(facts.scaleTargets.readWriteRatio);
    if (reads === null || reads < READ_HEAVY_FRACTION) return [];
    const shielded = (nodeId: string) =>
      index
        .neighbors(nodeId)
        .some((neighbor) => neighbor.kind === 'cache' || neighbor.kind === 'replica');
    const findings: RuleFinding[] = [];
    for (const node of sortById(index.nodes())) {
      // Deliberately api-only: this is about a read/write API surface sharing an
      // unshielded path. Event-handlers declare no query op, so the hasQuery gate
      // below is unreachable for them anyway — the lesson does not apply.
      if (roleOf(node.kind) !== 'api') continue;
      const ops = node.operations ?? [];
      const hasCommand = ops.some((op) => op.kind === 'command');
      const hasQuery = ops.some((op) => op.kind === 'query');
      if (!hasCommand || !hasQuery) continue;
      const dbEdges = sortById(
        index.outEdges(node.id).filter((edge) => index.byId(edge.target)?.kind === 'database'),
      );
      if (dbEdges.length === 0 || shielded(node.id)) continue;
      const bareEdge = dbEdges.find((edge) => !shielded(edge.target));
      if (!bareEdge) continue;
      const db = index.byId(bareEdge.target);
      if (!db) continue;
      findings.push({
        ruleId: queryOnWritePath.id,
        dimension: 'performance',
        severity: 'medium',
        title: 'Reads and writes share one unshielded path',
        message: `"${node.label}" declares both commands and queries and serves them all against "${db.label}" with no cache or replica anywhere beside either — at a ${facts.scaleTargets.readWriteRatio} read/write ratio, roughly ${Math.round(reads * 100)}% of traffic is reads competing with the writes for the same store. Split the read side, CQRS-lite: a cache or replica answers the queries, the primary keeps the commands, and the read flood can no longer crowd out the writes.`,
        affectedNodeIds: uniqueSorted([node.id, db.id]),
        affectedEdgeIds: [bareEdge.id],
        suggestion: null,
      });
    }
    return findings;
  },
};

const ungatedCommands: EvalRule = {
  id: 'security.ungated-commands',
  dimension: 'security',
  check({ index }) {
    if (!index.declaresOperations()) return [];
    if (!index.hasKind('gateway')) return [];
    const findings: RuleFinding[] = [];
    for (const edge of sortById(index.edges())) {
      if (index.byId(edge.source)?.kind !== 'client') continue;
      const owner = index.interfaceOwnerOf(edge);
      if (!owner || owner.kind === 'gateway') continue;
      const commands = resolvedCarries(index, edge).filter((entry) => entry.op.kind === 'command');
      if (commands.length === 0) continue;
      findings.push({
        ruleId: ungatedCommands.id,
        dimension: 'security',
        severity: 'medium',
        title: 'Mutations slip past the front door',
        message: `A gateway stands in this design, yet clients send "${commands[0].name}" straight to "${owner.label}" — a declared command bypassing the one place that authenticates, rate-limits and audits. A read through a side door leaks information; a write through one changes state anonymously. Mutations enter through the front door, always.`,
        affectedNodeIds: [],
        affectedEdgeIds: [edge.id],
        suggestion: null,
      });
    }
    return findings;
  },
};

const opKindMismatch: EvalRule = {
  id: 'hygiene.op-kind-mismatch',
  dimension: 'hygiene',
  check({ index }) {
    // No feature gate: a mismatched declaration is itself the evidence, and
    // declaring one already satisfies the gate the rest of the pack shares.
    const findings: RuleFinding[] = [];
    for (const node of sortById(index.nodes())) {
      // Widened from the per-kind tuple so `.includes` accepts any OperationKind.
      const allowed: readonly OperationKind[] = INTERFACE_CAPABILITIES[node.kind].operationKinds;
      const misfits = (node.operations ?? []).filter((op) => !allowed.includes(op.kind));
      if (misfits.length === 0) continue;
      const names = misfits.map((op) => `"${op.name}" (${op.kind})`).join(', ');
      const surface =
        allowed.length > 0
          ? `a ${node.kind} serves only ${allowed.join('/')} operations`
          : `a ${node.kind} is spoken to over a driver or protocol and declares no operations of its own`;
      findings.push({
        ruleId: opKindMismatch.id,
        dimension: 'hygiene',
        severity: 'low',
        title: 'Declared operations this node kind cannot serve',
        message: `"${node.label}" declares ${names}, but ${surface} — usually the residue of switching the node's kind after its interface was written. Move the declaration to a component that can serve it, or redeclare it as a kind this node supports.`,
        affectedNodeIds: [node.id],
        affectedEdgeIds: [],
        suggestion: null,
      });
    }
    return findings;
  },
};

const clientCommandNotIdempotent: EvalRule = {
  id: 'data.client-command-not-idempotent',
  dimension: 'data',
  check({ facts, index }) {
    if (facts.difficulty === 'intro') return [];
    if (!index.declaresOperations()) return [];
    const clientFedGateways = new Set(
      index
        .byKind('gateway')
        .filter((gateway) =>
          index.inEdges(gateway.id).some((edge) => index.byId(edge.source)?.kind === 'client'),
        )
        .map((gateway) => gateway.id),
    );
    const findings: RuleFinding[] = [];
    for (const edge of sortById(index.edges())) {
      const source = index.byId(edge.source);
      if (!source) continue;
      if (source.kind !== 'client' && !clientFedGateways.has(source.id)) continue;
      const risky = resolvedCarries(index, edge).filter(
        (entry) => entry.op.kind === 'command' && entry.op.idempotent !== true,
      );
      if (risky.length === 0) continue;
      findings.push({
        ruleId: clientCommandNotIdempotent.id,
        dimension: 'data',
        severity: 'medium',
        title: 'User-facing command with no idempotency declared',
        message: `"${risky[0].name}" rides a user-facing path without being declared idempotent, and retry storms arrive by design: spinners time out, users mash the button, gateways resend. Every one of those retries is the same command again — and again is a duplicated side effect. Key the command (an idempotency key per attempt) so retries converge on one outcome, then declare it idempotent.`,
        affectedNodeIds: uniqueSorted([edge.source, edge.target]),
        affectedEdgeIds: [edge.id],
        suggestion: null,
      });
    }
    return findings;
  },
};

const CHATTY_OPS_THRESHOLD = 6;

const chattyInterface: EvalRule = {
  id: 'hygiene.chatty-interface',
  dimension: 'hygiene',
  check({ index }) {
    if (!index.declaresOperations()) return [];
    const findings: RuleFinding[] = [];
    for (const edge of sortById(index.edges())) {
      const resolved = resolvedCarries(index, edge);
      if (resolved.length < CHATTY_OPS_THRESHOLD) continue;
      const kinds = new Set(resolved.map((entry) => entry.op.kind));
      if (kinds.size < 2) continue;
      findings.push({
        ruleId: chattyInterface.id,
        dimension: 'hygiene',
        severity: 'low',
        title: 'One edge carrying a whole API surface',
        message: `This edge carries ${resolved.length} operations spanning ${kinds.size} kinds — one dependency touching most of what its target serves. Interface segregation says a caller should depend on the slice it actually uses; a fat edge more often hides two callers' worth of concerns travelling as one, and it makes every interface change a change for this caller too.`,
        affectedNodeIds: uniqueSorted([edge.source, edge.target]),
        affectedEdgeIds: [edge.id],
        suggestion: null,
      });
    }
    return findings;
  },
};

const streamOpNoStream: EvalRule = {
  id: 'messaging.stream-op-no-stream',
  dimension: 'messaging',
  check({ index }) {
    if (!index.declaresOperations()) return [];
    if (index.hasKind('event-stream') || index.hasKind('websocket-gateway')) return [];
    const carrying: string[] = [];
    let exemplar: string | null = null;
    for (const edge of sortById(index.edges())) {
      const streams = resolvedCarries(index, edge).filter((entry) => entry.op.kind === 'stream');
      if (streams.length === 0) continue;
      carrying.push(edge.id);
      exemplar ??= streams[0].name;
    }
    if (carrying.length === 0 || exemplar === null) return [];
    return [
      {
        ruleId: streamOpNoStream.id,
        dimension: 'messaging',
        severity: 'medium',
        title: 'Streaming declared with no streaming substrate',
        message: `"${exemplar}" is declared as a stream and carried on ${carrying.length} edge${carrying.length > 1 ? 's' : ''}, but the graph has no event stream and no websocket gateway — nothing built to hold a continuous flow open. A stream is not a fast query: between systems it needs an event stream to buffer and replay it, and toward clients it needs a websocket gateway to keep the connection alive.`,
        affectedNodeIds: [],
        affectedEdgeIds: uniqueSorted(carrying),
        suggestion: null,
      },
    ];
  },
};

const commandIntoTwoStores: EvalRule = {
  id: 'data.command-into-two-stores',
  dimension: 'data',
  check({ index }) {
    if (!index.declaresOperations()) return [];
    const byCommand = new Map<string, { dbIds: Set<string>; edgeIds: string[] }>();
    for (const edge of index.edges()) {
      if (index.byId(edge.target)?.kind !== 'database') continue;
      for (const entry of resolvedCarries(index, edge)) {
        if (entry.op.kind !== 'command') continue;
        const bucket = byCommand.get(entry.name);
        if (bucket) {
          bucket.dbIds.add(edge.target);
          bucket.edgeIds.push(edge.id);
        } else {
          byCommand.set(entry.name, { dbIds: new Set([edge.target]), edgeIds: [edge.id] });
        }
      }
    }
    const findings: RuleFinding[] = [];
    for (const [name, { dbIds, edgeIds }] of [...byCommand.entries()].sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    )) {
      if (dbIds.size < 2) continue;
      findings.push({
        ruleId: commandIntoTwoStores.id,
        dimension: 'data',
        severity: 'high',
        title: 'The same command commits to two stores',
        message: `"${name}" is carried into ${dbIds.size} different databases — the interface declarations prove this dual write rather than merely suggesting it. The second commit can always fail after the first succeeds, and no retry loop makes two independent commits atomic. Pick one store as this command's system of record and derive the other from its commit log (CDC or an outbox).`,
        affectedNodeIds: [],
        affectedEdgeIds: uniqueSorted(edgeIds),
        suggestion: null,
      });
    }
    return findings;
  },
};

const replicaReceivesCommands: EvalRule = {
  id: 'data.replica-receives-commands',
  dimension: 'data',
  check({ index }) {
    if (!index.declaresOperations()) return [];
    const findings: RuleFinding[] = [];
    for (const edge of sortById(index.edges())) {
      const replica = index.byId(edge.target);
      if (replica?.kind !== 'replica') continue;
      const commands = resolvedCarries(index, edge).filter((entry) => entry.op.kind === 'command');
      if (commands.length === 0) continue;
      findings.push({
        ruleId: replicaReceivesCommands.id,
        dimension: 'data',
        severity: 'medium',
        title: 'Writes routed to a read replica',
        message: `"${commands[0].name}" — a declared command — is carried into "${replica.label}", and a replica is a follower: it applies the primary's log, it does not accept writes of its own. At best the write is rejected; at worst the replica diverges and reads disagree depending on which box answers. Point every command at the primary and let replication carry it down.`,
        affectedNodeIds: [replica.id],
        affectedEdgeIds: [edge.id],
        suggestion: null,
      });
    }
    return findings;
  },
};

export const interfaceRules: EvalRule[] = [
  unspecifiedInterface,
  danglingCarries,
  unreferencedOperation,
  srpOverload,
  responsibilityOverlap,
  eventOverSync,
  queryOverAsync,
  nonIdempotentConsumer,
  eventPublishedNowhere,
  commandFanout,
  queryOnWritePath,
  ungatedCommands,
  opKindMismatch,
  clientCommandNotIdempotent,
  chattyInterface,
  streamOpNoStream,
  commandIntoTwoStores,
  replicaReceivesCommands,
];
