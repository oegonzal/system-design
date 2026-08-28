/**
 * Hygiene: is the diagram itself honest — every box participating, and no
 * edge that a reviewer would circle in red before reading anything else?
 */
import type { EvalRule, RuleFinding } from '../types';
import { sortById, uniqueSorted } from './shared';

const orphanNode: EvalRule = {
  id: 'hygiene.orphan-node',
  dimension: 'hygiene',
  check({ index }) {
    const orphans = sortById(index.nodes().filter((node) => index.degree(node.id) === 0));
    if (orphans.length === 0) return [];
    const labels = orphans.map((node) => `"${node.label}"`).join(', ');
    const plural = orphans.length > 1;
    return [
      {
        ruleId: orphanNode.id,
        dimension: 'hygiene',
        severity: 'info',
        title: 'Disconnected nodes',
        message: `${labels} ${plural ? 'are' : 'is'} connected to nothing, so ${plural ? 'they play' : 'it plays'} no part in the design being evaluated. Wire ${plural ? 'them' : 'it'} in or remove ${plural ? 'them' : 'it'} — a reviewer reads dangling boxes as unfinished thinking.`,
        affectedNodeIds: orphans.map((node) => node.id),
        affectedEdgeIds: [],
        suggestion: null,
      },
    ];
  },
};

const clientToDb: EvalRule = {
  id: 'hygiene.client-to-db',
  dimension: 'hygiene',
  check({ index }) {
    const findings: RuleFinding[] = [];
    for (const edge of sortById(index.edges())) {
      const source = index.byId(edge.source);
      const target = index.byId(edge.target);
      if (source?.kind !== 'client') continue;
      if (target?.kind !== 'database' && target?.kind !== 'cache') continue;
      findings.push({
        ruleId: clientToDb.id,
        dimension: 'hygiene',
        severity: 'critical',
        title: 'Client talks directly to the data layer',
        message: `"${source.label}" reaches "${target.label}" directly, handing untrusted callers a connection to the layer that holds everyone's data. Every data access must pass through a service that authenticates the caller and scopes the query — that boundary is the difference between "my orders" and "all orders".`,
        affectedNodeIds: uniqueSorted([edge.source, edge.target]),
        affectedEdgeIds: [edge.id],
        suggestion: null,
      });
    }
    return findings;
  },
};

export const hygieneRules: EvalRule[] = [orphanNode, clientToDb];
