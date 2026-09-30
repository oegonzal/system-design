'use client';

import {
  BINDING_CLAIM_MAX_LENGTH,
  BINDING_MAX_NODES,
  type Binding,
  type CanvasGraph,
  type SuccessCriterion,
} from '@sysdesign/contracts';
import {
  Badge,
  Button,
  CheckboxField,
  Stack,
  Surface,
  Text,
  TextField,
} from '@sysdesign/design-system';
import { useState } from 'react';

import { bindingState, type BindingState } from '../../canvas/brief-draft';
import { humanizeKind } from '../../prompts/criteria';
import { FlowTracer } from './flow-tracer';

const STATE_CHIP: Record<BindingState, { tone: 'neutral' | 'medium' | 'success'; label: string }> =
  {
    empty: { tone: 'neutral', label: 'Not bound' },
    incomplete: { tone: 'medium', label: 'Incomplete' },
    bound: { tone: 'success', label: 'Bound' },
  };

export interface CriterionBindingRowProps {
  criterion: SuccessCriterion;
  graph: CanvasGraph;
  binding: Binding | null;
  /** Shown, never edited — every control is off. */
  disabled?: boolean;
  onClaim: (claim: string) => void;
  onToggleNode: (nodeId: string) => void;
  onPath: (path: string[]) => void;
  onClear: () => void;
}

/**
 * One criterion, and the author's claim about how the design meets it: the
 * components that hold it, a sentence in the author's own words, and — for a
 * request that travels — the path of edges it takes. Every node on the canvas
 * is offered: whether a client can hold a latency target is the evaluators'
 * question, not a picker's. Presentational and controlled.
 */
export function CriterionBindingRow({
  criterion,
  graph,
  binding,
  disabled = false,
  onClaim,
  onToggleNode,
  onPath,
  onClear,
}: CriterionBindingRowProps) {
  const path = binding?.path ?? [];
  const [tracing, setTracing] = useState(path.length > 0);
  const state = bindingState(binding);
  const chip = STATE_CHIP[state];
  const atCap = (binding?.nodeIds.length ?? 0) >= BINDING_MAX_NODES;
  const showTracer = tracing || path.length > 0;

  return (
    <Surface
      as="section"
      padding={4}
      role="group"
      aria-label={criterion.statement}
      data-testid={`binding-row-${criterion.id}`}
    >
      <Stack gap={3}>
        <Stack direction="row" gap={2} align="center" wrap>
          <Badge tone="accent">{criterion.id}</Badge>
          <Badge tone="neutral">{humanizeKind(criterion.kind)}</Badge>
          <Badge tone={chip.tone} data-testid={`binding-state-${criterion.id}`} data-state={state}>
            {chip.label}
          </Badge>
        </Stack>
        <Text size="sm">{criterion.statement}</Text>

        <TextField
          label="How the design meets it"
          data-testid={`binding-claim-${criterion.id}`}
          value={binding?.claim ?? ''}
          maxLength={BINDING_CLAIM_MAX_LENGTH}
          placeholder="e.g. the cache absorbs repeat reads"
          disabled={disabled}
          onChange={(event) => onClaim(event.target.value)}
        />

        {graph.nodes.length > 0 ? (
          <Stack gap={2} role="group" aria-label={`Components holding ${criterion.id}`}>
            <Text as="span" size="sm" tone="secondary">
              Held by
            </Text>
            {graph.nodes.map((node) => {
              const checked = binding?.nodeIds.includes(node.id) ?? false;
              return (
                <CheckboxField
                  key={node.id}
                  label={`${node.label} · ${node.kind}`}
                  data-testid={`binding-node-${criterion.id}-${node.id}`}
                  checked={checked}
                  disabled={disabled || (!checked && atCap)}
                  onChange={() => onToggleNode(node.id)}
                />
              );
            })}
          </Stack>
        ) : (
          <Text size="sm" tone="muted">
            Add components to the canvas, then say which of them hold this.
          </Text>
        )}

        {showTracer ? (
          <FlowTracer
            criterionId={criterion.id}
            graph={graph}
            path={path}
            disabled={disabled}
            onChange={onPath}
          />
        ) : (
          <div>
            <Button
              size="sm"
              variant="subtle"
              onClick={() => setTracing(true)}
              disabled={disabled}
              data-testid={`flow-open-${criterion.id}`}
            >
              Trace the request path
            </Button>
          </div>
        )}

        {binding ? (
          <div>
            <Button
              size="sm"
              variant="ghost"
              onClick={onClear}
              disabled={disabled}
              data-testid={`binding-clear-${criterion.id}`}
            >
              Clear binding
            </Button>
          </div>
        ) : null}
      </Stack>
    </Surface>
  );
}
