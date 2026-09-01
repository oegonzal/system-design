'use client';

import type { CanvasGraph } from '@sysdesign/contracts';
import { Badge, Button, Stack, Surface, Text } from '@sysdesign/design-system';

import { flowIsComplete, nextHops, walkNodes } from '../../canvas/brief-draft';

export interface FlowTracerProps {
  requirementIndex: number;
  requirement: string;
  graph: CanvasGraph;
  path: string[];
  onChange: (path: string[]) => void;
}

/**
 * One functional requirement, traced as a walk through the diagram.
 *
 * Hops are OFFERED rather than typed: after the first edge only edges leaving
 * where the last one arrived are listed, so a disconnected path — which the API
 * rejects and which is the easy mistake to make by hand — cannot be built at
 * all. The rule stops being something to remember and becomes the shape of the
 * control.
 *
 * The completeness hint reads `FLOW_SINK_KINDS` from contracts, the same list
 * `exp.brf.flows-traced` credits, so "this counts" here means "this counts"
 * there.
 */
export function FlowTracer({
  requirementIndex,
  requirement,
  graph,
  path,
  onChange,
}: FlowTracerProps) {
  const hops = nextHops(graph, path);
  const visited = walkNodes(graph, path);
  const complete = flowIsComplete(graph, path);
  const labelOf = (id: string) => graph.nodes.find((node) => node.id === id)?.label ?? id;

  return (
    <Surface
      as="section"
      padding={4}
      role="group"
      aria-label={requirement}
      data-testid={`flow-row-${requirementIndex}`}
    >
      <Stack gap={3}>
        <Text as="span" size="sm">
          {requirement}
        </Text>

        {visited.length > 0 ? (
          <Stack
            direction="row"
            gap={2}
            align="center"
            wrap
            data-testid={`flow-walk-${requirementIndex}`}
          >
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
            Not traced yet. Start at the client that makes this request.
          </Text>
        )}

        {path.length > 0 ? (
          <Stack direction="row" gap={2} align="center" wrap>
            <Badge
              tone={complete ? 'success' : 'medium'}
              data-testid={`flow-status-${requirementIndex}`}
            >
              {complete ? 'Traced end to end' : 'Incomplete'}
            </Badge>
            {!complete ? (
              <Text as="span" size="sm" tone="muted">
                A traced flow runs from a client to something that stores the result.
              </Text>
            ) : null}
          </Stack>
        ) : null}

        {hops.length > 0 ? (
          <Stack gap={2} role="group" aria-label={`Next hop for ${requirement}`}>
            <Text as="span" size="sm" tone="secondary">
              {path.length === 0 ? 'Start with' : 'Then'}
            </Text>
            <Stack direction="row" gap={2} wrap>
              {hops.map((edge) => (
                <Button
                  key={edge.id}
                  size="sm"
                  variant="subtle"
                  data-testid={`flow-hop-${requirementIndex}-${edge.id}`}
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
              ? 'Draw a connection on the canvas first — a flow is a walk along the arrows.'
              : 'Nothing leaves the last component, so the walk ends here.'}
          </Text>
        )}

        {path.length > 0 ? (
          <Stack direction="row" gap={2} wrap>
            <Button
              size="sm"
              variant="ghost"
              data-testid={`flow-undo-${requirementIndex}`}
              onClick={() => onChange(path.slice(0, -1))}
            >
              Undo hop
            </Button>
            <Button
              size="sm"
              variant="ghost"
              data-testid={`flow-clear-${requirementIndex}`}
              onClick={() => onChange([])}
            >
              Clear
            </Button>
          </Stack>
        ) : null}
      </Stack>
    </Surface>
  );
}
