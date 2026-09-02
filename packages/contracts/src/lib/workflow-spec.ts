import type { CanvasEdge, CanvasNode, NodeOperation, OperationKind } from './canvas';
import { INTERFACE_CAPABILITIES, resolveInterfaceOwner } from './interfaces';
import type { InterfaceRole } from './interfaces';
import type { MechanismGraph } from './mechanisms';
import { PROMPT_DIFFICULTIES } from './prompts';
import type { PromptDifficulty } from './prompts';

/**
 * The business half of a prompt, machine-readable: which API contracts,
 * domain events, ingestion paths, aggregations and entity lifecycles the
 * system under design must realize. A scale target says how hard the system
 * is hit; this says what the system is *for*.
 *
 * Everything here is an id the author covers BY REFERENCE — an operation on
 * the canvas sets `fulfills` to one of these ids, never a name the engine
 * would have to match as text. The corroboration below then checks the
 * typed graph, exactly as `mechanisms.ts` does for NFR bindings: stable
 * under paraphrase, unstable under falsity. `statement` and `name` fields
 * are display copy only — no predicate may ever read them.
 */

export const WORKFLOW_SPEC_VERSION = 1;

export const WORKFLOW_ID_MAX_LENGTH = 40;
export const WORKFLOW_STATEMENT_MAX_LENGTH = 200;
export const WORKFLOW_MAX_ENTITIES = 3;
export const WORKFLOW_MAX_STATES = 6;
export const WORKFLOW_MAX_TRANSITIONS = 12;
export const WORKFLOW_MAX_OPERATIONS = 8;
export const WORKFLOW_MAX_EVENTS = 8;
export const WORKFLOW_MAX_AGGREGATIONS = 4;
export const WORKFLOW_MAX_INGESTS = 4;
/** Cap on `NodeOperation.emits` — below the event count, so producer attribution spreads across ops. */
export const OPERATION_MAX_EMITS = 4;

export interface WorkflowTransition {
  /** Source state; null means this transition creates the entity. */
  from: string | null;
  to: string;
  /** Id of the operation, ingest or event that effects the transition. */
  via: string;
}

export interface WorkflowEntity {
  id: string;
  /** Display only — never read by a predicate. */
  name: string;
  states: readonly string[];
  transitions: readonly WorkflowTransition[];
}

export interface WorkflowEvent {
  id: string;
  /** Display only. */
  statement: string;
  /** Easiest difficulty that includes this event; absent = every difficulty. */
  minDifficulty?: PromptDifficulty;
}

export interface WorkflowOperation {
  id: string;
  kind: 'command' | 'query';
  /** Display only. */
  statement: string;
  /** Event ids published when the operation succeeds. */
  emits?: readonly string[];
  /** Event ids published on the failure path — the half designs forget. */
  onFailureEmits?: readonly string[];
  minDifficulty?: PromptDifficulty;
}

export interface WorkflowIngest {
  id: string;
  /** push = the source calls us (webhook); pull = we poll the source. */
  mode: 'push' | 'pull';
  /** Display only. */
  statement: string;
  /** The prompt NFR carrying this ingest's freshness budget (`freshness_seconds`). */
  nfrId: string;
  /** Event ids the ingestion lands. */
  emits: readonly string[];
}

export interface WorkflowAggregation {
  id: string;
  /** Display only. */
  statement: string;
  /** The events whose stream feeds this aggregate. */
  sourceEventIds: readonly string[];
  minDifficulty?: PromptDifficulty;
}

export interface WorkflowSpec {
  version: 1;
  entities: readonly WorkflowEntity[];
  operations: readonly WorkflowOperation[];
  events: readonly WorkflowEvent[];
  aggregations: readonly WorkflowAggregation[];
  ingests: readonly WorkflowIngest[];
}

/* ─── eligibility — the MECHANISM_KINDS analogue ──────────────────────── */

export const WORKFLOW_ITEM_CLASSES = [
  'operation-command',
  'operation-query',
  'event',
  'ingest-push',
  'ingest-pull',
] as const;
export type WorkflowItemClass = (typeof WORKFLOW_ITEM_CLASSES)[number];

export interface WorkflowFulfiller {
  /** Interface roles whose nodes may declare the fulfilling op. */
  roles: readonly InterfaceRole[];
  /** Operation kinds the fulfilling declaration may use. */
  opKinds: readonly OperationKind[];
}

/**
 * Which declarations may fulfil which spec item class. Role-based rather
 * than kind-lists on purpose: `INTERFACE_CAPABILITIES` already files every
 * palette kind under a role, so a future kind is automatically eligible or
 * not without touching this table. Eligibility, not proof.
 *
 * Aggregations are absent because serving one IS an `operation-query`-shaped
 * claim: a query op with `fulfills` set to the aggregation id.
 */
export const WORKFLOW_FULFILLERS = {
  'operation-command': { roles: ['api'], opKinds: ['command'] },
  'operation-query': { roles: ['api'], opKinds: ['query'] },
  event: { roles: ['channel'], opKinds: ['event', 'stream'] },
  'ingest-push': { roles: ['api'], opKinds: ['command'] },
  'ingest-pull': { roles: ['api'], opKinds: ['command'] },
} as const satisfies Record<WorkflowItemClass, WorkflowFulfiller>;

/** One row in the editor's Fulfills select. */
export interface FulfillableItem {
  id: string;
  /** The spec statement — the words the author chooses by. */
  label: string;
}

/**
 * What an operation row may legally claim, given its node's interface role
 * and the row's own kind. The select offers nothing else, which is how an
 * ineligible claim stays unrepresentable in the editor (a hand-crafted
 * payload is the validator's business).
 */
export function fulfillableItems(
  spec: WorkflowSpec,
  role: InterfaceRole,
  opKind: OperationKind,
): FulfillableItem[] {
  if (role === 'api' && opKind === 'command') {
    return [
      ...spec.operations
        .filter((op) => op.kind === 'command')
        .map((op) => ({ id: op.id, label: op.statement })),
      ...spec.ingests.map((ingest) => ({ id: ingest.id, label: ingest.statement })),
    ];
  }
  if (role === 'api' && opKind === 'query') {
    return [
      ...spec.operations
        .filter((op) => op.kind === 'query')
        .map((op) => ({ id: op.id, label: op.statement })),
      ...spec.aggregations.map((agg) => ({ id: agg.id, label: agg.statement })),
    ];
  }
  if (role === 'channel' && (opKind === 'event' || opKind === 'stream')) {
    return spec.events.map((event) => ({ id: event.id, label: event.statement }));
  }
  return [];
}

/* ─── difficulty ladder ───────────────────────────────────────────────── */

const DIFFICULTY_RANK: Record<PromptDifficulty, number> = Object.fromEntries(
  PROMPT_DIFFICULTIES.map((difficulty, index) => [difficulty, index]),
) as Record<PromptDifficulty, number>;

function included(minDifficulty: PromptDifficulty | undefined, at: PromptDifficulty): boolean {
  return minDifficulty === undefined || DIFFICULTY_RANK[minDifficulty] <= DIFFICULTY_RANK[at];
}

/**
 * The spec as a given difficulty sees it. A bank authors ONE spec with
 * `minDifficulty` markers; this filter derives each tier's view, keeping it
 * closed: emits lists drop filtered events, transitions drop with their
 * `via` item, states drop when no surviving transition touches them, and an
 * aggregation whose sources all vanished drops entirely.
 */
export function specAtDifficulty(spec: WorkflowSpec, difficulty: PromptDifficulty): WorkflowSpec {
  const events = spec.events.filter((event) => included(event.minDifficulty, difficulty));
  const eventIds = new Set(events.map((event) => event.id));

  const operations = spec.operations
    .filter((op) => included(op.minDifficulty, difficulty))
    .map((op) => ({
      ...op,
      emits: op.emits?.filter((id) => eventIds.has(id)),
      onFailureEmits: op.onFailureEmits?.filter((id) => eventIds.has(id)),
    }))
    .map((op) => ({
      ...op,
      ...(op.emits === undefined || op.emits.length === 0 ? { emits: undefined } : {}),
      ...(op.onFailureEmits === undefined || op.onFailureEmits.length === 0
        ? { onFailureEmits: undefined }
        : {}),
    }));

  const ingests = spec.ingests.map((ingest) => ({
    ...ingest,
    emits: ingest.emits.filter((id) => eventIds.has(id)),
  }));

  const aggregations = spec.aggregations
    .filter((agg) => included(agg.minDifficulty, difficulty))
    .map((agg) => ({ ...agg, sourceEventIds: agg.sourceEventIds.filter((id) => eventIds.has(id)) }))
    .filter((agg) => agg.sourceEventIds.length > 0);

  const viaIds = new Set([
    ...operations.map((op) => op.id),
    ...ingests.map((ingest) => ingest.id),
    ...eventIds,
  ]);
  const entities = spec.entities
    .map((entity) => {
      const transitions = entity.transitions.filter((transition) => viaIds.has(transition.via));
      const touched = new Set(
        transitions.flatMap((transition) =>
          transition.from === null ? [transition.to] : [transition.from, transition.to],
        ),
      );
      return {
        ...entity,
        transitions,
        states: entity.states.filter((state) => touched.has(state)),
      };
    })
    .filter((entity) => entity.transitions.length > 0);

  return { version: spec.version, entities, operations, events, aggregations, ingests };
}

/* ─── closure validation ──────────────────────────────────────────────── */

/**
 * Every internal reference resolves, every id is unique and bounded. Pure
 * and total — collects all problems. Run by the generator's own spec against
 * every difficulty's filtered view, so a bank cannot ship a spec that quotes
 * an event it forgot to declare.
 */
export function validateWorkflowSpec(spec: WorkflowSpec): string[] {
  const problems: string[] = [];
  const ids = [
    ...spec.entities.map((entity) => entity.id),
    ...spec.operations.map((op) => op.id),
    ...spec.events.map((event) => event.id),
    ...spec.aggregations.map((agg) => agg.id),
    ...spec.ingests.map((ingest) => ingest.id),
  ];
  const seen = new Set<string>();
  for (const id of ids) {
    if (id.length === 0 || id.length > WORKFLOW_ID_MAX_LENGTH) {
      problems.push(`workflow id out of bounds: '${id}'`);
    }
    if (seen.has(id)) problems.push(`duplicate workflow id: '${id}'`);
    seen.add(id);
  }

  const eventIds = new Set(spec.events.map((event) => event.id));
  const viaIds = new Set([
    ...spec.operations.map((op) => op.id),
    ...spec.ingests.map((ingest) => ingest.id),
    ...eventIds,
  ]);

  for (const op of spec.operations) {
    for (const id of [...(op.emits ?? []), ...(op.onFailureEmits ?? [])]) {
      if (!eventIds.has(id)) problems.push(`operation '${op.id}' emits unknown event '${id}'`);
    }
  }
  for (const ingest of spec.ingests) {
    if (ingest.nfrId.length === 0) problems.push(`ingest '${ingest.id}' names no NFR`);
    for (const id of ingest.emits) {
      if (!eventIds.has(id)) problems.push(`ingest '${ingest.id}' emits unknown event '${id}'`);
    }
  }
  for (const agg of spec.aggregations) {
    if (agg.sourceEventIds.length === 0) problems.push(`aggregation '${agg.id}' has no sources`);
    for (const id of agg.sourceEventIds) {
      if (!eventIds.has(id)) problems.push(`aggregation '${agg.id}' sources unknown event '${id}'`);
    }
  }
  for (const entity of spec.entities) {
    const states = new Set(entity.states);
    for (const [index, transition] of entity.transitions.entries()) {
      if (transition.from !== null && !states.has(transition.from)) {
        problems.push(`entity '${entity.id}' transition ${index} leaves unknown state`);
      }
      if (!states.has(transition.to)) {
        problems.push(`entity '${entity.id}' transition ${index} enters unknown state`);
      }
      if (!viaIds.has(transition.via)) {
        problems.push(
          `entity '${entity.id}' transition ${index} via unknown item '${transition.via}'`,
        );
      }
    }
  }
  return problems;
}

/* ─── corroboration — one judge, two callers ──────────────────────────── */

export type WorkflowVerdictStatus =
  'corroborated' | 'uncorroborated' | 'contradicted' | 'unclaimed';

/** Stable gap codes — chip copy and finding messages both speak this vocabulary. */
export type WorkflowGap =
  | 'no-declaration'
  | 'ineligible-declaration'
  | 'not-exercised'
  | 'no-transport'
  | 'no-producer'
  | 'no-consumer'
  | 'no-external-source'
  | 'no-external-target'
  | 'no-periodic-driver'
  | 'not-fed'
  | 'not-served'
  | 'via-uncovered';

export interface WorkflowItemVerdict {
  itemId: string;
  itemClass: WorkflowItemClass | 'aggregation' | 'transition' | 'entity';
  status: WorkflowVerdictStatus;
  /** Sorted, unique. */
  evidenceNodeIds: string[];
  evidenceEdgeIds: string[];
  /** Empty when corroborated. */
  gaps: WorkflowGap[];
}

export interface WorkflowReport {
  items: WorkflowItemVerdict[];
}

/** Transitions have no authored id; the report addresses them by position. */
export function transitionItemId(entityId: string, index: number): string {
  return `${entityId}.t${index}`;
}

interface Declaration {
  node: CanvasNode;
  op: NodeOperation;
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}

export function judgeWorkflow(graph: MechanismGraph, spec: WorkflowSpec): WorkflowReport {
  const roleOf = (node: CanvasNode): InterfaceRole => INTERFACE_CAPABILITIES[node.kind].role;
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));

  const ownerOf = (edge: CanvasEdge): CanvasNode | undefined => {
    const source = byId.get(edge.source);
    const target = byId.get(edge.target);
    if (!source || !target) return undefined;
    const side = resolveInterfaceOwner(source.kind, target.kind);
    return side === 'source' ? source : side === 'target' ? target : undefined;
  };

  const declarationsOf = (itemId: string): Declaration[] =>
    graph.nodes.flatMap((node) =>
      (node.operations ?? []).filter((op) => op.fulfills === itemId).map((op) => ({ node, op })),
    );

  /** Edges whose carries resolve the named op against this node. */
  const carryingEdges = (node: CanvasNode, opName: string): CanvasEdge[] =>
    graph.edges.filter(
      (edge) => ownerOf(edge)?.id === node.id && (edge.carries ?? []).includes(opName),
    );

  /** The wired-async-consumer branch: an in-edge owned by a channel whose carries resolve there. */
  const consumesFromChannel = (node: CanvasNode): CanvasEdge[] =>
    graph.edges.filter((edge) => {
      if (edge.target !== node.id) return false;
      const owner = ownerOf(edge);
      if (!owner || owner.id === node.id || roleOf(owner) !== 'channel') return false;
      const declared = new Set((owner.operations ?? []).map((op) => op.name));
      return (edge.carries ?? []).some((name) => declared.has(name));
    });

  const eligible = (declaration: Declaration, itemClass: WorkflowItemClass): boolean => {
    // Annotated: the `as const` table's per-class literal tuples would
    // otherwise collapse `.includes` parameters to `never`.
    const rule: WorkflowFulfiller = WORKFLOW_FULFILLERS[itemClass];
    return (
      rule.roles.includes(roleOf(declaration.node)) && rule.opKinds.includes(declaration.op.kind)
    );
  };

  const items: WorkflowItemVerdict[] = [];
  const verdictOf = new Map<string, WorkflowItemVerdict>();
  const push = (item: WorkflowItemVerdict): void => {
    items.push(item);
    verdictOf.set(item.itemId, item);
  };

  /* operations (aggregation serving is judged with the aggregation itself) */
  for (const op of spec.operations) {
    const itemClass: WorkflowItemClass =
      op.kind === 'command' ? 'operation-command' : 'operation-query';
    const declarations = declarationsOf(op.id);
    if (declarations.length === 0) {
      push({
        itemId: op.id,
        itemClass,
        status: 'unclaimed',
        evidenceNodeIds: [],
        evidenceEdgeIds: [],
        gaps: ['no-declaration'],
      });
      continue;
    }
    const fit = declarations.filter((declaration) => eligible(declaration, itemClass));
    if (fit.length === 0) {
      push({
        itemId: op.id,
        itemClass,
        status: 'contradicted',
        evidenceNodeIds: uniqueSorted(declarations.map((d) => d.node.id)),
        evidenceEdgeIds: [],
        gaps: ['ineligible-declaration'],
      });
      continue;
    }
    const exercised = fit.flatMap((declaration) => {
      const carried = carryingEdges(declaration.node, declaration.op.name);
      const consumed = op.kind === 'command' ? consumesFromChannel(declaration.node) : [];
      const edges = [...carried, ...consumed];
      return edges.length > 0 ? [{ declaration, edges }] : [];
    });
    if (exercised.length === 0) {
      push({
        itemId: op.id,
        itemClass,
        status: 'uncorroborated',
        evidenceNodeIds: uniqueSorted(fit.map((d) => d.node.id)),
        evidenceEdgeIds: [],
        gaps: ['not-exercised'],
      });
      continue;
    }
    push({
      itemId: op.id,
      itemClass,
      status: 'corroborated',
      evidenceNodeIds: uniqueSorted(exercised.map((entry) => entry.declaration.node.id)),
      evidenceEdgeIds: uniqueSorted(
        exercised.flatMap((entry) => entry.edges.map((edge) => edge.id)),
      ),
      gaps: [],
    });
  }

  /* ingests */
  for (const ingest of spec.ingests) {
    const itemClass: WorkflowItemClass = ingest.mode === 'push' ? 'ingest-push' : 'ingest-pull';
    const declarations = declarationsOf(ingest.id);
    if (declarations.length === 0) {
      push({
        itemId: ingest.id,
        itemClass,
        status: 'unclaimed',
        evidenceNodeIds: [],
        evidenceEdgeIds: [],
        gaps: ['no-declaration'],
      });
      continue;
    }
    const fit = declarations.filter((declaration) => eligible(declaration, itemClass));
    if (fit.length === 0) {
      push({
        itemId: ingest.id,
        itemClass,
        status: 'contradicted',
        evidenceNodeIds: uniqueSorted(declarations.map((d) => d.node.id)),
        evidenceEdgeIds: [],
        gaps: ['ineligible-declaration'],
      });
      continue;
    }

    const gaps = new Set<WorkflowGap>();
    const evidenceNodes: string[] = [];
    const evidenceEdges: string[] = [];
    let proven = false;

    for (const { node, op } of fit) {
      if (ingest.mode === 'push') {
        const fromWebhookSource = graph.edges.filter((edge) => {
          if (edge.target !== node.id) return false;
          const source = byId.get(edge.source);
          return (
            source?.kind === 'external-api' &&
            source.config?.['webhooks'] === true &&
            (edge.carries ?? []).includes(op.name)
          );
        });
        if (fromWebhookSource.length > 0) {
          proven = true;
          evidenceNodes.push(node.id, ...fromWebhookSource.map((edge) => edge.source));
          evidenceEdges.push(...fromWebhookSource.map((edge) => edge.id));
        } else {
          gaps.add('no-external-source');
        }
      } else {
        const toExternal = graph.edges.filter(
          (edge) => edge.source === node.id && byId.get(edge.target)?.kind === 'external-api',
        );
        const schedulerDrives = graph.edges.filter(
          (edge) => edge.target === node.id && byId.get(edge.source)?.kind === 'scheduler',
        );
        const hasDriver = node.kind === 'batch-job' || schedulerDrives.length > 0;
        if (toExternal.length === 0) gaps.add('no-external-target');
        if (!hasDriver) gaps.add('no-periodic-driver');
        if (toExternal.length > 0 && hasDriver) {
          proven = true;
          evidenceNodes.push(node.id, ...toExternal.map((edge) => edge.target));
          evidenceNodes.push(...schedulerDrives.map((edge) => edge.source));
          evidenceEdges.push(...toExternal.map((edge) => edge.id));
          evidenceEdges.push(...schedulerDrives.map((edge) => edge.id));
        }
      }
    }

    push({
      itemId: ingest.id,
      itemClass,
      status: proven ? 'corroborated' : 'uncorroborated',
      evidenceNodeIds: uniqueSorted(proven ? evidenceNodes : fit.map((d) => d.node.id)),
      evidenceEdgeIds: uniqueSorted(proven ? evidenceEdges : []),
      gaps: proven ? [] : [...gaps],
    });
  }

  /* events */
  for (const event of spec.events) {
    const declarations = declarationsOf(event.id);
    const transports = declarations.filter((declaration) => eligible(declaration, 'event'));

    /** Producers: command ops on api-role nodes declaring the emission. */
    const producers = graph.nodes.flatMap((node) =>
      roleOf(node) === 'api'
        ? (node.operations ?? [])
            .filter((op) => op.kind === 'command' && (op.emits ?? []).includes(event.id))
            .map((op) => ({ node, op }))
        : [],
    );

    if (declarations.length === 0 && producers.length === 0) {
      push({
        itemId: event.id,
        itemClass: 'event',
        status: 'unclaimed',
        evidenceNodeIds: [],
        evidenceEdgeIds: [],
        gaps: ['no-declaration'],
      });
      continue;
    }
    if (declarations.length > 0 && transports.length === 0) {
      push({
        itemId: event.id,
        itemClass: 'event',
        status: 'contradicted',
        evidenceNodeIds: uniqueSorted(declarations.map((d) => d.node.id)),
        evidenceEdgeIds: [],
        gaps: ['ineligible-declaration'],
      });
      continue;
    }

    const gaps = new Set<WorkflowGap>();
    if (transports.length === 0) gaps.add('no-transport');

    const producerEdges = transports.flatMap((transport) =>
      producers.flatMap(({ node }) =>
        graph.edges.filter((edge) => edge.source === node.id && edge.target === transport.node.id),
      ),
    );
    if (producerEdges.length === 0) gaps.add('no-producer');

    const consumerEdges = transports.flatMap((transport) =>
      graph.edges.filter((edge) => {
        if (edge.source !== transport.node.id) return false;
        const target = byId.get(edge.target);
        return (
          target !== undefined &&
          roleOf(target) === 'api' &&
          (edge.carries ?? []).includes(transport.op.name)
        );
      }),
    );
    if (consumerEdges.length === 0) gaps.add('no-consumer');

    if (gaps.size === 0) {
      push({
        itemId: event.id,
        itemClass: 'event',
        status: 'corroborated',
        evidenceNodeIds: uniqueSorted([
          ...transports.map((d) => d.node.id),
          ...producers.map((d) => d.node.id),
          ...consumerEdges.map((edge) => edge.target),
        ]),
        evidenceEdgeIds: uniqueSorted([...producerEdges, ...consumerEdges].map((edge) => edge.id)),
        gaps: [],
      });
    } else {
      push({
        itemId: event.id,
        itemClass: 'event',
        status: 'uncorroborated',
        evidenceNodeIds: uniqueSorted([
          ...transports.map((d) => d.node.id),
          ...producers.map((d) => d.node.id),
        ]),
        evidenceEdgeIds: [],
        gaps: [...gaps],
      });
    }
  }

  /* aggregations */
  for (const agg of spec.aggregations) {
    const declarations = declarationsOf(agg.id);
    const servers = declarations.filter((declaration) => eligible(declaration, 'operation-query'));
    const sourceVerdicts = agg.sourceEventIds.map((id) => verdictOf.get(id));
    const sourcesUnclaimed = sourceVerdicts.every((verdict) => verdict?.status === 'unclaimed');

    if (declarations.length === 0 && sourcesUnclaimed) {
      push({
        itemId: agg.id,
        itemClass: 'aggregation',
        status: 'unclaimed',
        evidenceNodeIds: [],
        evidenceEdgeIds: [],
        gaps: ['no-declaration'],
      });
      continue;
    }
    if (declarations.length > 0 && servers.length === 0) {
      push({
        itemId: agg.id,
        itemClass: 'aggregation',
        status: 'contradicted',
        evidenceNodeIds: uniqueSorted(declarations.map((d) => d.node.id)),
        evidenceEdgeIds: [],
        gaps: ['ineligible-declaration'],
      });
      continue;
    }

    const gaps = new Set<WorkflowGap>();
    const served = servers.flatMap((server) => {
      const edges = carryingEdges(server.node, server.op.name);
      return edges.length > 0 ? [{ server, edges }] : [];
    });
    if (served.length === 0) gaps.add('not-served');

    /** Fed: every source corroborated, and each source's transport reaches the
     *  serving node — or a node the serving node reads (its out-neighbors). */
    let fedEvidence: string[] = [];
    const allSourcesCorroborated = sourceVerdicts.every(
      (verdict) => verdict?.status === 'corroborated',
    );
    if (!allSourcesCorroborated) {
      gaps.add('not-fed');
    } else if (served.length > 0) {
      const servingNode = served[0].server.node;
      const readTargets = graph.edges
        .filter((edge) => edge.source === servingNode.id)
        .map((edge) => edge.target);
      const transportsOf = (eventId: string): string[] =>
        graph.nodes
          .filter(
            (node) =>
              roleOf(node) === 'channel' &&
              (node.operations ?? []).some((op) => op.fulfills === eventId),
          )
          .map((node) => node.id);
      const fed = agg.sourceEventIds.every((eventId) =>
        transportsOf(eventId).some(
          (channelId) =>
            graph.reaches(channelId, servingNode.id) ||
            readTargets.some((target) => channelId === target || graph.reaches(channelId, target)),
        ),
      );
      if (!fed) gaps.add('not-fed');
      else fedEvidence = agg.sourceEventIds.flatMap((eventId) => transportsOf(eventId));
    }

    if (gaps.size === 0) {
      push({
        itemId: agg.id,
        itemClass: 'aggregation',
        status: 'corroborated',
        evidenceNodeIds: uniqueSorted([
          ...served.map((entry) => entry.server.node.id),
          ...fedEvidence,
        ]),
        evidenceEdgeIds: uniqueSorted(
          served.flatMap((entry) => entry.edges.map((edge) => edge.id)),
        ),
        gaps: [],
      });
    } else {
      push({
        itemId: agg.id,
        itemClass: 'aggregation',
        status: 'uncorroborated',
        evidenceNodeIds: uniqueSorted(servers.map((d) => d.node.id)),
        evidenceEdgeIds: [],
        gaps: [...gaps],
      });
    }
  }

  /* transitions + entities, derived from their via items */
  for (const entity of spec.entities) {
    const transitionVerdicts: WorkflowItemVerdict[] = entity.transitions.map(
      (transition, index) => {
        const via = verdictOf.get(transition.via);
        const status = via?.status ?? 'unclaimed';
        return {
          itemId: transitionItemId(entity.id, index),
          itemClass: 'transition',
          status,
          evidenceNodeIds: via?.evidenceNodeIds ?? [],
          evidenceEdgeIds: via?.evidenceEdgeIds ?? [],
          gaps: status === 'corroborated' ? [] : ['via-uncovered'],
        };
      },
    );
    for (const verdict of transitionVerdicts) push(verdict);

    const statuses = new Set(transitionVerdicts.map((verdict) => verdict.status));
    const entityStatus: WorkflowVerdictStatus = statuses.has('contradicted')
      ? 'contradicted'
      : statuses.size === 1 && statuses.has('corroborated')
        ? 'corroborated'
        : [...statuses].every((status) => status === 'unclaimed')
          ? 'unclaimed'
          : 'uncorroborated';
    push({
      itemId: entity.id,
      itemClass: 'entity',
      status: entityStatus,
      evidenceNodeIds: uniqueSorted(transitionVerdicts.flatMap((v) => v.evidenceNodeIds)),
      evidenceEdgeIds: uniqueSorted(transitionVerdicts.flatMap((v) => v.evidenceEdgeIds)),
      gaps: entityStatus === 'corroborated' ? [] : ['via-uncovered'],
    });
  }

  return { items };
}
