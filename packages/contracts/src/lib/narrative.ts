import type { CanvasGraph } from './canvas';

/**
 * Node labels the narrative never mentions.
 *
 * The single source of truth for "does the narrative cover the diagram":
 * the eval engine's deterministic narrative rule and the UI's coverage
 * checklist both call this, so a submission can never be graded against a
 * different notion of coverage than the one the author was shown.
 *
 * Pure. Returns the unique node labels (trimmed; empty/whitespace-only
 * labels skipped; duplicates — compared case-insensitively — counted once)
 * that do NOT appear in the narrative as a case-insensitive substring,
 * preserving first-appearance order in the graph.
 */
export function unmentionedNodeLabels(graph: CanvasGraph, narrative: string): string[] {
  const haystack = narrative.toLowerCase();
  const seen = new Set<string>();
  const unmentioned: string[] = [];

  for (const node of graph.nodes) {
    const label = node.label.trim();
    if (label.length === 0) continue;

    const needle = label.toLowerCase();
    if (seen.has(needle)) continue;
    seen.add(needle);

    if (!haystack.includes(needle)) unmentioned.push(label);
  }

  return unmentioned;
}
