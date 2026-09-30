'use client';

import type { CanvasGraph } from '@sysdesign/contracts';
import { Badge, Button, Stack, Text } from '@sysdesign/design-system';

import { nextHops, walkNodes } from '../../canvas/brief-draft';

export interface FlowTracerProps {
  criterionId: string;
  graph: CanvasGraph;
  path: string[];
  onChange: (path: string[]) => void;
}

/**
 * One criterion's request, traced as a walk through the diagram.
 *
 * Hops are OFFERED rather than typed: after the first edge only edges leaving
 * where the last one arrived are listed, so a disconnected path — which the API
 * rejects and which is the easy mistake to make by hand — cannot be built at
 * all. The rule stops being something to remember and becomes the shape of the
 * control. Where a walk should start or end is the evaluators' judgement, not
 * a form rule.
 */
export function FlowTracer({ criterionId, graph, path, onChange }: FlowTracerProps) {
  const hops = nextHops(graph, path);
  const visited = walkNodes(graph, path);
  const labelOf = (id: string) => graph.nodes.find((node) => node.id === id)?.label ?? id;

  return (
    <Stack
      gap={3}
      role="group"
      aria-label="Request path"
      data-testid={`flow-tracer-${criterionId}`}
    >
      {visited.length > 0 ? (
        <Stack direction="row" gap={2} align="center" wrap data-testid={`flow-walk-${criterionId}`}>
          {visited.map((node, step) => (
            <Stack
              // eslint-disable-next-line @eslint-react/no-array-index-key -- a walk may revisit a node, so position is the only unique part of the key
              key={`${node.id}-${step}`}
              direction="row"
              gap={2}
              align="center"
            >
              {step > 0 ? (
                <Text as="span" size="sm" tone="muted">
                  →
                </Text>
              ) : null}
              <Badge kind={node.kind}>{node.label}</Badge>
            </Stack>
          ))}
        </Stack>
      ) : (
        <Text size="sm" tone="muted">
          Not traced yet. Start where this request enters the system.
        </Text>
      )}

      {path.length > 0 ? (
        <Badge tone="success" data-testid={`flow-status-${criterionId}`}>
          {`Traced · ${path.length} ${path.length === 1 ? 'hop' : 'hops'}`}
        </Badge>
      ) : null}

      {hops.length > 0 ? (
        <Stack gap={2} role="group" aria-label="Next hop">
          <Text as="span" size="sm" tone="secondary">
            {path.length === 0 ? 'Start with' : 'Then'}
          </Text>
          <Stack direction="row" gap={2} wrap>
            {hops.map((edge) => (
              <Button
                key={edge.id}
                size="sm"
                variant="subtle"
                data-testid={`flow-hop-${criterionId}-${edge.id}`}
                onClick={() => onChange([...path, edge.id])}
              >
                {labelOf(edge.source)} → {labelOf(edge.target)}
              </Button>
            ))}
          </Stack>
        </Stack>
      ) : (
        <Text size="sm" tone="muted">
          {path.length === 0
            ? 'Draw a connection on the canvas first — a path is a walk along the arrows.'
            : 'Nothing leaves the last component, so the walk ends here.'}
        </Text>
      )}

      {path.length > 0 ? (
        <Stack direction="row" gap={2} wrap>
          <Button
            size="sm"
            variant="ghost"
            data-testid={`flow-undo-${criterionId}`}
            onClick={() => onChange(path.slice(0, -1))}
          >
            Undo hop
          </Button>
          <Button
            size="sm"
            variant="ghost"
            data-testid={`flow-clear-${criterionId}`}
            onClick={() => onChange([])}
          >
            Clear path
          </Button>
        </Stack>
      ) : null}
    </Stack>
  );
}
