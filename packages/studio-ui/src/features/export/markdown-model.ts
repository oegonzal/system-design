import type { CanvasGraph, DesignModel } from '@sysdesign/contracts';

import { nodeLabels } from './markdown';

const NONE = '_None._';

/**
 * The data model as a document: one section per entity — owner, key, fields,
 * invariants, states — then the relations, entity ids resolved to names so
 * the file reads without the editor.
 */
export function modelMarkdown(model: DesignModel | null | undefined, graph: CanvasGraph): string {
  const lines: string[] = [`# Model — the entities the design keeps`, ``];
  if (!model || model.entities.length === 0) {
    lines.push(NONE);
    return `${lines.join('\n')}\n`;
  }
  const labels = nodeLabels(graph);
  const names = new Map(model.entities.map((entity) => [entity.id, entity.name]));
  for (const entity of model.entities) {
    lines.push(
      `## ${entity.name}`,
      ``,
      `- Owned by: ${entity.ownerNodeId ? (labels.get(entity.ownerNodeId) ?? entity.ownerNodeId) : '—'}`,
      `- Key: ${entity.key ?? '—'}`,
      `- Fields: ${
        entity.fields.length === 0
          ? '—'
          : entity.fields.map((f) => (f.note ? `${f.name} (${f.note})` : f.name)).join(', ')
      }`,
      `- Invariants: ${entity.invariants.length === 0 ? '—' : entity.invariants.join('; ')}`,
      `- States: ${entity.states.length === 0 ? '—' : entity.states.join(' → ')}`,
      ``,
    );
  }
  lines.push(`## Relations`, ``);
  if (model.relations.length === 0) lines.push(NONE, ``);
  else {
    for (const relation of model.relations) {
      const from = names.get(relation.from) ?? relation.from;
      const to = names.get(relation.to) ?? relation.to;
      lines.push(
        `- ${from} → ${to} (${relation.kind})${relation.note ? `: ${relation.note}` : ''}`,
      );
    }
    lines.push(``);
  }
  return lines.join('\n');
}
