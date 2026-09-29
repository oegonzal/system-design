import { CANVAS_MAX_TOTAL_OPERATIONS } from './canvas';
import type { CanvasGraph } from './canvas.schema';

/**
 * Referential validation of a graph whose *shape* already passed the schema.
 * Pure and total: collects every problem rather than failing fast, so the 422
 * the service raises lists all of them in one round trip.
 *
 * The line this file holds: it rejects what is IMPOSSIBLE — an edge to a node
 * that is not there, a carry naming an operation neither endpoint declares,
 * two entries under one config key — and says nothing about what is merely
 * unwise. Whether the design is any good is the quality loop's to judge.
 */
export function validateGraphReferences(graph: CanvasGraph): string[] {
  const problems: string[] = [];

  const nodeIds = new Set<string>();
  const operationsByNode = new Map<string, Set<string>>();
  let totalOperations = 0;
  for (const node of graph.nodes) {
    if (nodeIds.has(node.id)) {
      problems.push(`duplicate node id: ${node.id}`);
    }
    nodeIds.add(node.id);

    const configKeys = new Set<string>();
    for (const entry of node.config ?? []) {
      if (configKeys.has(entry.key)) {
        problems.push(`node ${node.id} sets config key ${entry.key} twice`);
      }
      configKeys.add(entry.key);
    }

    const operations = node.operations ?? [];
    totalOperations += operations.length;
    const operationNames = new Set<string>();
    for (const operation of operations) {
      if (operationNames.has(operation.name)) {
        problems.push(`node ${node.id} declares duplicate operation name: ${operation.name}`);
      }
      operationNames.add(operation.name);
    }
    operationsByNode.set(node.id, operationNames);
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

    const declaredAtEitherEnd = new Set([
      ...(operationsByNode.get(edge.source) ?? []),
      ...(operationsByNode.get(edge.target) ?? []),
    ]);
    const carrySeen = new Set<string>();
    for (const carry of edge.carries ?? []) {
      if (carrySeen.has(carry)) {
        problems.push(`edge ${edge.id} lists duplicate carries entry: ${carry}`);
      }
      carrySeen.add(carry);
      if (!declaredAtEitherEnd.has(carry)) {
        problems.push(
          `edge ${edge.id} carries ${carry}, which neither ${edge.source} nor ${edge.target} declares`,
        );
      }
    }
  }

  return problems;
}
