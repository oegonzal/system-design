import {
  DEFAULT_NODE_LABELS,
  markdownCell,
  nodeLabel,
  platformServiceById,
  type CanvasGraph,
  type ConfigEntry,
} from '@sysdesign/contracts';

import { formatConfigValue } from '../canvas/properties/config-value';

const NONE = '_None._';

const configCell = (entries: readonly ConfigEntry[] | undefined): string =>
  entries === undefined || entries.length === 0
    ? '—'
    : markdownCell(
        entries.map((entry) => `${entry.key}=${formatConfigValue(entry.value)}`).join(', '),
      );

/**
 * The diagram as text: one table of blocks — label, role, the platform
 * service it names, its config — and one of connections — the blocks it
 * joins, its call style, what it carries, its config — so a reader of the
 * export sees the same declared facts the graders were shown, without the
 * picture.
 */
export function diagramMarkdown(graph: CanvasGraph): string {
  const lines = ['# Diagram — the blocks and the connections', ''];
  if (graph.nodes.length === 0) {
    lines.push(NONE);
    return `${lines.join('\n')}\n`;
  }
  const labels = new Map(graph.nodes.map((node) => [node.id, nodeLabel(node)]));
  lines.push('## Blocks', '', '| Block | Role | Service | Config |', '| --- | --- | --- | --- |');
  for (const node of graph.nodes) {
    const service = node.service === undefined ? null : platformServiceById(node.service);
    lines.push(
      `| ${markdownCell(nodeLabel(node))} | ${DEFAULT_NODE_LABELS[node.kind]} | ${
        service === null ? '—' : markdownCell(service.service.label)
      } | ${configCell(node.config)} |`,
    );
  }
  lines.push('', '## Connections', '');
  if (graph.edges.length === 0) {
    lines.push(NONE);
  } else {
    lines.push('| From → To | Call style | Carries | Config |', '| --- | --- | --- | --- |');
    for (const edge of graph.edges) {
      const from = labels.get(edge.source) ?? edge.source;
      const to = labels.get(edge.target) ?? edge.target;
      const carries =
        edge.carries === undefined || edge.carries.length === 0
          ? '—'
          : markdownCell(edge.carries.join(', '));
      lines.push(
        `| ${markdownCell(`${from} → ${to}`)} | ${edge.kind} | ${carries} | ${configCell(edge.config)} |`,
      );
    }
  }
  return `${lines.join('\n')}\n`;
}
