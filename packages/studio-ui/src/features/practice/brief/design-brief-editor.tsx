'use client';

import type { CanvasGraph, SuccessCriterion } from '@sysdesign/contracts';
import { Badge, Heading, Spinner, Stack, Text } from '@sysdesign/design-system';
import { useMemo } from 'react';

import { accountedNodeIds } from '../../canvas/brief-draft';
import { useCanvasStore } from '../../canvas/canvas-store-context';
import { toCanvasGraph } from '../../canvas/graph-io';
import { groupCriteriaByKind, humanizeKind } from '../../prompts/criteria';
import { CriterionBindingRow } from './criterion-binding-row';

export interface DesignBriefEditorProps {
  /** The prompt's rubric, as resolved by `usePromptCriteria`. */
  criteria: SuccessCriterion[];
  /** True while the quality loop is still deriving it. */
  deriving?: boolean;
}

/**
 * The grounding half of explaining a design.
 *
 * A diagram is a set of promises, and this is where an author says which box
 * keeps which one — bound to a criterion from the prompt and to components on
 * their own canvas, with a claim in their own words. Every reference is one
 * the lenses can check, which is what makes the grade stable under renaming a
 * box and unstable under claiming something the canvas does not do.
 *
 * Reads the store directly rather than taking a brief prop: the rows below are
 * presentational and controlled, so this is the only component that needs to
 * know where the draft lives — and whether it is read-only, which is the
 * store's word too: a revision on screen is shown, never edited.
 */
export function DesignBriefEditor({ criteria, deriving = false }: DesignBriefEditorProps) {
  const readOnly = useCanvasStore((state) => state.readOnly);
  const nodes = useCanvasStore((state) => state.nodes);
  const edges = useCanvasStore((state) => state.edges);
  const bindings = useCanvasStore((state) => state.bindings);
  const entities = useCanvasStore((state) => state.entities);
  const setBindingClaim = useCanvasStore((state) => state.setBindingClaim);
  const setBindingTradeoff = useCanvasStore((state) => state.setBindingTradeoff);
  const toggleBindingNode = useCanvasStore((state) => state.toggleBindingNode);
  const toggleBindingEntity = useCanvasStore((state) => state.toggleBindingEntity);
  const setBindingPath = useCanvasStore((state) => state.setBindingPath);
  const clearBinding = useCanvasStore((state) => state.clearBinding);

  const graph: CanvasGraph = useMemo(() => toCanvasGraph(nodes, edges), [nodes, edges]);
  const groups = useMemo(() => groupCriteriaByKind(criteria), [criteria]);

  const unaccounted = useMemo(() => {
    const accounted = accountedNodeIds(bindings, graph);
    return graph.nodes.filter((node) => !accounted.has(node.id));
  }, [bindings, graph]);

  return (
    <Stack gap={5}>
      <Text size="sm" tone="muted">
        For each criterion, say which components hold it, in one sentence, trace how the request
        travels, and say why that mechanism and not another that could have held it. Every claim is
        checked against your diagram by the grader — an unsupported one is allowed, and graded; a
        choice nobody defends is graded too.
      </Text>

      {criteria.length === 0 ? (
        <Stack direction="row" gap={3} align="center" data-testid="criteria-normalizing">
          {deriving ? <Spinner label="" /> : null}
          <Text size="sm" tone="secondary">
            {deriving
              ? 'The requirements are being normalized into criteria…'
              : 'No criteria yet — derive them from the Prompt tab to bind against them.'}
          </Text>
        </Stack>
      ) : (
        groups.map((group) => (
          <Stack key={group.kind} gap={3}>
            <Heading level={3}>{humanizeKind(group.kind)}</Heading>
            {group.criteria.map((criterion) => (
              <CriterionBindingRow
                key={criterion.id}
                criterion={criterion}
                graph={graph}
                entities={entities}
                binding={bindings.find((binding) => binding.criterionId === criterion.id) ?? null}
                disabled={readOnly}
                onClaim={(claim) => setBindingClaim(criterion.id, claim)}
                onTradeoff={(tradeoff) => setBindingTradeoff(criterion.id, tradeoff)}
                onToggleNode={(nodeId) => toggleBindingNode(criterion.id, nodeId)}
                onToggleEntity={(entityId) => toggleBindingEntity(criterion.id, entityId)}
                onPath={(path) => setBindingPath(criterion.id, path)}
                onClear={() => clearBinding(criterion.id)}
              />
            ))}
          </Stack>
        ))
      )}

      {/*
        The same question the explanation critic asks, asked before it costs
        anything: a box no binding names and no path reaches is either
        unexplained thinking or an unnecessary box, and a reader cannot tell which.
      */}
      {unaccounted.length > 0 ? (
        <Stack gap={2} data-testid="brief-unaccounted">
          <Text size="sm" tone="secondary">
            No binding accounts for{' '}
            {unaccounted.length === 1 ? 'this component' : 'these components'} yet
          </Text>
          <Stack direction="row" gap={2} wrap>
            {unaccounted.map((node) => (
              <Badge key={node.id} kind={node.kind}>
                {node.label}
              </Badge>
            ))}
          </Stack>
          <Text size="sm" tone="muted">
            Bind one to the criterion it holds, route a path through it, or remove it.
          </Text>
        </Stack>
      ) : null}
    </Stack>
  );
}
