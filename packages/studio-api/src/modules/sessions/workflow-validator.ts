import {
  INTERFACE_CAPABILITIES,
  isApiLikeRole,
  type CanvasGraph,
  type WorkflowSpec,
} from '@sysdesign/contracts';

/**
 * Referential validation of the workflow claims on a graph whose shape
 * already passed the DTO layer. Pure and total, sibling of
 * `validateBriefReferences` — every problem in one 422.
 *
 * The IMPOSSIBLE/UNSUPPORTED line, restated for this layer: a `fulfills` or
 * `emits` naming an id the prompt's spec never declared is impossible — the
 * editor only offers spec ids, so a stranger id is a hand-crafted payload.
 * So is any workflow claim on a prompt with no spec, an emission from a node
 * whose role cannot produce events, or one node claiming the same item
 * twice. Everything else — a query op fulfilling a command item, a claim no
 * edge exercises, an emission on a query op, two NODES contending for one
 * contract — is merely unsupported: the evaluation grades it, because that
 * is where the author gets the finding that teaches why.
 */
export function validateWorkflowReferences(
  graph: CanvasGraph,
  spec: WorkflowSpec | null,
): string[] {
  const problems: string[] = [];

  const fulfillableIds = spec
    ? new Set([
        ...spec.operations.map((op) => op.id),
        ...spec.ingests.map((ingest) => ingest.id),
        ...spec.aggregations.map((agg) => agg.id),
        ...spec.events.map((event) => event.id),
      ])
    : new Set<string>();
  const eventIds = spec ? new Set(spec.events.map((event) => event.id)) : new Set<string>();

  for (const node of graph.nodes) {
    const role = INTERFACE_CAPABILITIES[node.kind].role;
    const claimed = new Set<string>();
    for (const op of node.operations ?? []) {
      if (op.fulfills !== undefined) {
        if (spec === null) {
          problems.push(
            `node ${node.id} fulfils '${op.fulfills}', but this prompt has no workflow spec`,
          );
        } else if (!fulfillableIds.has(op.fulfills)) {
          problems.push(`node ${node.id} fulfils unknown workflow item: ${op.fulfills}`);
        } else {
          if (claimed.has(op.fulfills)) {
            problems.push(`node ${node.id} fulfils '${op.fulfills}' twice`);
          }
          claimed.add(op.fulfills);
        }
      }

      for (const eventId of op.emits ?? []) {
        if (spec === null) {
          problems.push(`node ${node.id} emits '${eventId}', but this prompt has no workflow spec`);
        } else if (!eventIds.has(eventId)) {
          problems.push(`node ${node.id} emits unknown workflow event: ${eventId}`);
        }
      }
      if ((op.emits ?? []).length > 0 && !isApiLikeRole(role)) {
        problems.push(
          `node ${node.id} (${node.kind}) cannot emit events — only api and event-driven compute components produce`,
        );
      }
    }
  }

  return problems;
}
