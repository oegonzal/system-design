/**
 * The studio's canvas as an artifact: the diagram the author drew, the brief
 * that binds each criterion to the components holding it (and, where a
 * request travels, the path of edges), and the narrative keyed to nodes and
 * criteria. The schema is the one in `@sysdesign/contracts` — the studio API
 * validates a submission with it, and the coach's change set is written in
 * its element schemas — so there is nothing here to drift.
 *
 * A coached revision is a CHANGE SET against the best (`revise`: the
 * contract's `canvasChangeSchema`, applied by the loop with the contract's
 * `applyCanvasChange` and judged whole), never the canvas redrawn. Measured
 * 2026-11-07 on coach chain 4 (session 2681e7b0), where every revision was a
 * redraw: 34–64% of each 82–120 KB reply re-emitted elements no remediation
 * had named, 22–31 of 34 bindings were rewritten a round, and the reasoning
 * dimension swung 90 → 50 as the parts nobody criticised were re-rolled.
 *
 * Location ids are positional (`node.3`, `binding.1`), never the author's own
 * canvas ids: a lens may cite only what the render printed, and the render
 * prints the author's id beside every positional one so a reader can join
 * them. The numbering is the contract's `submissionLocations`, so the studio
 * joins a finding back onto the stored revision with the same function.
 *
 * The two numberings look alike and are not: an author's `e-4` is whichever
 * edge was drawn fourth, and may sit at `edge.5`. So a binding's path is
 * printed on a line of its own, every hop led by the id to cite with the
 * author's id and the two nodes it joins beside it, and the line says where
 * the walk starts and ends — nothing about a path is left to be counted or
 * joined by eye. Under the path, a second line states what the lifecycle
 * declares for it — where the request enters, which block or hop serves each
 * stage of its way in, and where it comes to rest — and the brief closes
 * with how every component is reached by the traced paths; both are read
 * from the contract's tables, so every lens reads the same facts the
 * studio's tracer showed the author.
 */
import {
  applyCanvasChange,
  canvasChangeSchema,
  designSubmissionSchema,
  nodeReach,
  pathStages,
  renderEdgeLine,
  renderNodeLine,
  repairSubmission,
  roleNames,
  submissionLocations,
  type CanvasChange,
  type CanvasGraph,
  type DesignSubmission,
  type PathTracing,
  type TracedStage,
} from '@sysdesign/contracts';

import { readArtifact, type OutputShape } from '../../core/contracts';

export type CanvasSubmission = DesignSubmission;

/** `n-7 (node.3)` — the author's id with the positional id a lens must cite. */
function positional<I extends { id: string }>(items: readonly I[], prefix: string) {
  const byId = new Map(items.map((item, index) => [item.id, `${prefix}.${index + 1}`]));
  return (id: string): string => {
    const position = byId.get(id);
    return position === undefined ? id : `${id} (${position})`;
  };
}

/** What the brief's hops read from: each edge by the author's id, with the positional id a lens cites. */
function edgeIndex(graph: CanvasGraph) {
  return new Map(
    graph.edges.map((item, index) => [item.id, { ref: `edge.${index + 1}`, edge: item }]),
  );
}

/**
 * A binding's traced path, as its own line: `path, 2 edges, n-1 (node.1) to
 * n-3 (node.3): edge.1 (e-1: n-1 -> n-2, sync) → edge.4 (e-3: n-2 -> n-3, async)`.
 * Each hop leads with the id to cite, repeats the Edges section's own words
 * for it and names its call style, so a flow reads as the sequence of calls
 * it is. A hop naming no drawn edge says so and the summary is left out — where
 * a broken walk starts and ends is not the render's to guess.
 */
function renderPath(
  path: readonly string[],
  edges: ReturnType<typeof edgeIndex>,
  node: (id: string) => string,
): string {
  const hops = path.map((id) => edges.get(id));
  const first = hops[0];
  const last = hops[hops.length - 1];
  const span =
    first !== undefined && last !== undefined
      ? `, ${node(first.edge.source)} to ${node(last.edge.target)}`
      : '';
  const walk = path.map((id, index) => {
    const hop = hops[index];
    return hop === undefined
      ? `${id} (no such edge)`
      : `${hop.ref} (${id}: ${hop.edge.source} -> ${hop.edge.target}, ${hop.edge.kind})`;
  });
  return `    path, ${path.length} ${path.length === 1 ? 'edge' : 'edges'}${span}: ${walk.join(' → ')}`;
}

/** What serves one stage of the way in, by the ids a lens cites — or `none`. */
function renderStage(
  item: TracedStage,
  edges: ReturnType<typeof edgeIndex>,
  node: (id: string) => string,
): string {
  const { covered } = item;
  const served =
    covered === null
      ? item.conditional
        ? 'none (where the response is static or media)'
        : 'none'
      : covered.by === 'hop'
        ? `${edges.get(covered.edgeId)?.ref ?? covered.edgeId} (${covered.edgeId}, ${covered.key})`
        : covered.beside === null
          ? node(covered.nodeId)
          : `${node(covered.nodeId)}, beside ${node(covered.beside)}`;
  return `${item.stage.label} — ${served}`;
}

/**
 * The line under a path: where it enters and, for a request from outside,
 * which block or hop serves each stage of its way in; then where it comes to
 * rest, or that it ends where the request is still in flight.
 */
function renderWayIn(
  tracing: PathTracing,
  edges: ReturnType<typeof edgeIndex>,
  node: (id: string) => string,
): string {
  const { entry, firstNodeId, rest } = tracing;
  const begins =
    firstNodeId === null
      ? 'way in: (no walk to trace)'
      : entry === null
        ? `way in: begins at ${node(firstNodeId)}, which is not where a request enters`
        : tracing.stages.length === 0
          ? `way in: begins ${entry.label} at ${node(firstNodeId)}; no way in to show`
          : `way in, as ${entry.label} from ${node(firstNodeId)}: ${tracing.stages
              .map((item) => renderStage(item, edges, node))
              .join('; ')}`;
  const ends =
    rest === null
      ? ''
      : rest.atRest
        ? `; comes to rest at ${node(rest.nodeId)}`
        : `; ends at ${node(rest.nodeId)} (${roleNames([rest.kind])}), which is not where a request comes to rest`;
  return `    ${begins}${ends}`;
}

/** How every component is reached by the brief's traced paths, the untraced ones named. */
function renderTracing(reach: ReturnType<typeof nodeReach>, node: (id: string) => string): string {
  const onPath = reach.filter((item) => item.reach === 'on-path').length;
  const beside = reach.filter((item) => item.reach === 'beside-path').length;
  const untraced = reach.filter((item) => item.reach === 'untraced');
  const named =
    untraced.length === 0
      ? 'none untraced'
      : `${untraced.length} untraced: ${untraced.map((item) => node(item.nodeId)).join(', ')}`;
  return `    tracing: ${onPath} of ${reach.length} components on a traced path, ${beside} beside one, ${named}`;
}

/**
 * An entity as the model critic reads it: who owns it, what identifies it,
 * what it holds and the rules and states it carries, with an empty slot
 * named so a model with no owner or no invariants is visible at a glance.
 */
function renderEntity(
  item: {
    id: string;
    name: string;
    ownerNodeId?: string;
    key?: string;
    fields: readonly { name: string; note?: string }[];
    invariants: readonly string[];
    states: readonly string[];
  },
  index: number,
  node: (id: string) => string,
): string {
  const fields = item.fields.map((field) =>
    field.note === undefined ? field.name : `${field.name} (${field.note})`,
  );
  return (
    `[entity.${index + 1}] ${item.name} (${item.id}): owned by ${item.ownerNodeId === undefined ? '(no owner)' : node(item.ownerNodeId)}; ` +
    `key: ${item.key ?? '(none given)'}; fields: ${fields.length === 0 ? '(none given)' : fields.join(', ')}; ` +
    `invariants: ${item.invariants.length === 0 ? '(none given)' : item.invariants.join('; ')}; ` +
    `states: ${item.states.length === 0 ? '(none)' : item.states.join(' → ')}`
  );
}

/**
 * A decision as the reasoning lenses read it: every slot printed, an empty
 * one named as such, so a choice with no alternative or no cost is visible
 * at a glance rather than inferred from silence.
 */
function renderDecision(
  item: {
    choice: string;
    alternative?: string;
    cost?: string;
    reconsiderWhen?: string;
    nodeIds?: readonly string[];
  },
  index: number,
  node: (id: string) => string,
): string {
  const concerns =
    item.nodeIds === undefined || item.nodeIds.length === 0
      ? ''
      : `; concerns ${item.nodeIds.map(node).join(', ')}`;
  return (
    `[decision.${index + 1}] chose: ${item.choice}; instead of: ${item.alternative ?? '(none given)'}; ` +
    `cost: ${item.cost ?? '(none given)'}; reconsider when: ${item.reconsiderWhen ?? '(none given)'}${concerns}`
  );
}

export const canvasOutput: OutputShape<CanvasSubmission, CanvasChange> = {
  schema: designSubmissionSchema,

  /** The contract's one numbering, projected to what a lens may cite; the studio joins on the same ids. */
  locate: (submission) => submissionLocations(submission).map(({ id, label }) => ({ id, label })),

  /**
   * A coach revision is repaired the way the editor repairs a draft — a
   * binding to a criterion the rubric never listed, a duplicate, a broken
   * path are dropped, not refused — before `references` reads it. The graph
   * is never touched: an edge to nowhere stays a refusal. The studio stores
   * what was judged and repairs nothing. The revision is read as the seam
   * read it, so a claim past its size is no reason to skip the repair; a
   * value with a structural fault is returned as it came, for the schema
   * validator to report.
   */
  normalize: (submission, contract) => {
    const parsed = readArtifact(designSubmissionSchema, submission);
    return parsed.ok ? repairSubmission(parsed.value, contract.criteria) : submission;
  },

  render: (submission) => {
    const { graph, brief, narrative } = submission;
    const model = submission.model ?? null;
    const node = positional(graph.nodes, 'node');
    const entity = positional(model?.entities ?? [], 'entity');
    const edges = edgeIndex(graph);
    const overview = narrative?.overview?.trim() ?? '';
    const lines: string[] = [
      'Cite parts by the bracketed ids. The token after each bracket is the author’s own canvas id; the model, brief and narrative refer to those. An author’s id is a name, not a position: `e-4` need not be `edge.4`. A binding’s path is the line under it, each hop led by the id to cite, with its call style; the line under that states where the path enters, what serves each stage of its way in, and where it comes to rest. The brief closes with how every component is reached by the traced paths.',
      '',
      '## Nodes',
      ...graph.nodes.map((item, index) => `[node.${index + 1}] ${renderNodeLine(item).trim()}`),
      '',
      '## Edges',
      ...graph.edges.map((item, index) => `[edge.${index + 1}] ${renderEdgeLine(item).trim()}`),
      '',
      '## Model',
      ...(model === null || model.entities.length === 0
        ? ['(none submitted)']
        : [
            ...model.entities.map((item, index) => renderEntity(item, index, node)),
            ...model.relations.map(
              (item) =>
                `    relation: ${entity(item.from)} -> ${entity(item.to)} (${item.kind})${item.note === undefined ? '' : `: ${item.note}`}`,
            ),
          ]),
      '',
      '## Brief',
    ];
    if (brief === null || brief.bindings.length === 0) {
      lines.push('(none submitted)');
    } else {
      lines.push(
        ...brief.bindings.flatMap((binding, index) => [
          `[binding.${index + 1}] ${binding.criterionId} ← ${[...binding.nodeIds.map(node), ...(binding.entityIds ?? []).map(entity)].join(', ')}: ${JSON.stringify(binding.claim)}`,
          ...(binding.path !== undefined && binding.path.length > 0
            ? [
                renderPath(binding.path, edges, node),
                renderWayIn(pathStages(graph, binding.path), edges, node),
              ]
            : []),
          `    why this, not another: ${binding.tradeoff ?? '(none given)'}`,
        ]),
        renderTracing(nodeReach(graph, brief.bindings), node),
      );
    }
    lines.push('', '## Narrative');
    if (
      narrative === null ||
      (overview.length === 0 &&
        narrative.componentRationales.length === 0 &&
        narrative.criterionNarrations.length === 0 &&
        (narrative.assumptions ?? []).length === 0)
    ) {
      lines.push('(none submitted)');
    } else {
      if (overview.length > 0) lines.push(`[overview] ${overview}`);
      lines.push(
        ...(narrative.assumptions ?? []).map((text, index) => `[assumption.${index + 1}] ${text}`),
        ...narrative.componentRationales.map(
          (item, index) =>
            `[rationale.${index + 1}] ${node(item.nodeId)}: ${item.prose} — instead of: ${item.tradeoff ?? '(none given)'}`,
        ),
        ...narrative.criterionNarrations.map(
          (item, index) => `[narration.${index + 1}] ${item.criterionId}: ${item.prose}`,
        ),
      );
    }
    lines.push('', '## Decisions');
    const decisions = narrative?.decisions ?? [];
    if (decisions.length === 0) {
      lines.push('(none recorded)');
    } else {
      lines.push(...decisions.map((item, index) => renderDecision(item, index, node)));
    }
    // Only an interview session has one; printing an empty section would
    // invite a lens to grade its absence.
    const turns = submission.transcript?.turns ?? [];
    if (turns.length > 0) {
      lines.push(
        '',
        '## Transcript',
        ...turns.map(
          (turn, index) => `[turn.${index + 1}] ${turn.role} (${turn.phase}): ${turn.text}`,
        ),
      );
    }
    return lines.join('\n');
  },

  /**
   * How a revision is asked for: a change set against the artifact the coach
   * was shown, each list in the contract's own words, applied to the best by
   * the contract's own function — so what is judged, stored as the iteration's
   * artifact and shown to the studio is a whole canvas; the change set itself
   * survives only as the producer's recorded reply in the run dump.
   * How much a change set may name is the contract's to size (`canvas.ts`,
   * the `CHANGE_*` bounds); the list rules are the submission's.
   */
  revise: {
    schema: canvasChangeSchema,
    apply: applyCanvasChange,
    instruction:
      'Return only a change set against the artifact above: the nodes, edges, entities, bindings, rationales and narrations you add or rewrite — whole, by their ids — the ids you remove, and the decisions, assumptions, model relations or overview as they should read when you rewrite them. Apply every listed remediation. Everything you do not name stays exactly as it is.',
  },
};
