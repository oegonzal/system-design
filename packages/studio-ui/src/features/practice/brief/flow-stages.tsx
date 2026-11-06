'use client';

import { pathStages, roleNames, type CanvasGraph, type TracedStage } from '@sysdesign/contracts';
import { Badge, Stack, Text } from '@sysdesign/design-system';

export interface FlowStagesProps {
  criterionId: string;
  graph: CanvasGraph;
  path: readonly string[];
}

const capitalised = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * What the request lifecycle declares for a traced path — where it enters,
 * which block or hop serves each stage of its way in, and where it comes to
 * rest — read from the same contract tables the graders' render reads, so
 * the author sees the facts the lenses will, before submitting.
 */
export function FlowStages({ criterionId, graph, path }: FlowStagesProps) {
  const tracing = pathStages(graph, path);
  if (tracing.firstNodeId === null) return null;
  const labelOf = (id: string) => graph.nodes.find((node) => node.id === id)?.label ?? id;
  const served = (item: TracedStage): string => {
    const { covered } = item;
    if (covered === null) return item.conditional ? 'where needed' : 'missing';
    if (covered.by === 'hop') return `${covered.key} on a hop`;
    return covered.beside === null
      ? labelOf(covered.nodeId)
      : `${labelOf(covered.nodeId)}, beside ${labelOf(covered.beside)}`;
  };
  const { entry, rest, firstNodeId } = tracing;

  return (
    <Stack gap={2} role="group" aria-label="Way in" data-testid={`flow-stages-${criterionId}`}>
      {entry === null ? (
        <Text size="sm" tone="muted">
          Begins at {labelOf(firstNodeId)}, which is not where a request enters — no way in to show.
        </Text>
      ) : tracing.stages.length === 0 ? (
        <Text size="sm" tone="muted">
          Begins inside the system at {labelOf(firstNodeId)} — no way in to show.
        </Text>
      ) : (
        <>
          <Text as="span" size="sm" tone="secondary">
            Enters as {entry.label} at {labelOf(firstNodeId)}
          </Text>
          <Stack direction="row" gap={2} wrap>
            {tracing.stages.map((item) => (
              <Badge
                key={item.stage.id}
                tone={item.covered !== null ? 'success' : item.conditional ? 'neutral' : 'medium'}
                title={item.stage.what}
                data-testid={`flow-stage-${criterionId}-${item.stage.id}`}
              >
                {`${capitalised(item.stage.label)} · ${served(item)}`}
              </Badge>
            ))}
          </Stack>
        </>
      )}
      {rest !== null ? (
        <Text
          size="sm"
          tone={rest.atRest ? 'secondary' : 'muted'}
          data-testid={`flow-rest-${criterionId}`}
        >
          {rest.atRest
            ? `Comes to rest at ${labelOf(rest.nodeId)}.`
            : `Ends at ${labelOf(rest.nodeId)} (${roleNames([rest.kind])}), which is not where a request comes to rest.`}
        </Text>
      ) : null}
    </Stack>
  );
}
