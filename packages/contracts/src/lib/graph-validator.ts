import { CANVAS_MAX_TOTAL_OPERATIONS, type CanvasGraph } from './canvas';
import { configVocabularyProblems } from './node-config-fields';

/**
 * Referential validation of a graph whose *shape* already passed the DTO
 * layer. Pure and total: collects every problem rather than failing fast, so
 * the 422 the service raises lists all of them in one round trip. Shared here
 * because everything that persists a revision — the API's submit path and the
 * eval-worker's improvement loop — must hold the same line.
 *
 * A config key its node kind does not offer, or a value outside the field's
 * domain, is IMPOSSIBLE the same way an unknown edge target is: the editor
 * renders only `NODE_CONFIG_FIELDS`, so a stranger knob is a hand-crafted
 * payload — and one nothing grades, which is exactly why it must not be
 * silently stored. Callers that would rather discard than reject (a model
 * proposal, a stored design from before a knob was retired) run
 * `canonicalizeGraphConfig` first.
 *
 * Deliberately NOT a 422: a `carries` entry referencing a name its interface
 * owner never declared. That graph is semantically incomplete, not
 * impossible — an eval lesson for the critic to teach, never a save blocker.
 */
export function validateGraphReferences(graph: CanvasGraph): string[] {
  const problems: string[] = [...configVocabularyProblems(graph)];

  const nodeIds = new Set<string>();
  let totalOperations = 0;
  for (const node of graph.nodes) {
    if (nodeIds.has(node.id)) {
      problems.push(`duplicate node id: ${node.id}`);
    }
    nodeIds.add(node.id);

    const operations = node.operations ?? [];
    totalOperations += operations.length;
    const operationNames = new Set<string>();
    for (const operation of operations) {
      if (operationNames.has(operation.name)) {
        problems.push(`node ${node.id} declares duplicate operation name: ${operation.name}`);
      }
      operationNames.add(operation.name);
    }
  }

  if (totalOperations > CANVAS_MAX_TOTAL_OPERATIONS) {
    problems.push(
      `graph declares ${totalOperations} operations — the maximum is ${CANVAS_MAX_TOTAL_OPERATIONS}`,
    );
  }

  const edgeIds = new Set<string>();
  for (const edge of graph.edges) {
    if (edgeIds.has(edge.id)) {
      problems.push(`duplicate edge id: ${edge.id}`);
    }
    edgeIds.add(edge.id);

    if (!nodeIds.has(edge.source)) {
      problems.push(`edge ${edge.id} references unknown source node: ${edge.source}`);
    }
    if (!nodeIds.has(edge.target)) {
      problems.push(`edge ${edge.id} references unknown target node: ${edge.target}`);
    }
    if (edge.source === edge.target) {
      problems.push(`edge ${edge.id} is a self-loop on node: ${edge.source}`);
    }

    const carrySeen = new Set<string>();
    for (const carry of edge.carries ?? []) {
      if (carrySeen.has(carry)) {
        problems.push(`edge ${edge.id} lists duplicate carries entry: ${carry}`);
      }
      carrySeen.add(carry);
    }
  }

  return problems;
}
