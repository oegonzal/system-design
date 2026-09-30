'use client';

import type { CanvasGraph, SuccessCriterion } from '@sysdesign/contracts';
import { Badge, Heading, Stack, Text, TextAreaField } from '@sysdesign/design-system';
import { useMemo } from 'react';

import { useCanvasStore } from '../canvas/canvas-store-context';
import { toCanvasGraph } from '../canvas/graph-io';
import { narrationSlotState, type NarrationSlotState } from '../canvas/narration-draft';
import { groupCriteriaByKind, humanizeKind } from '../prompts/criteria';

const CHIP: Record<NarrationSlotState, { tone: 'neutral' | 'success'; label: string }> = {
  empty: { tone: 'neutral', label: 'Not written' },
  filled: { tone: 'success', label: 'Written' },
};

/** Written or not — whether it explains anything is the explanation critic's call. */
function SlotChip({ prose }: { prose: string }) {
  const state = narrationSlotState(prose);
  const chip = CHIP[state];
  return (
    <Badge tone={chip.tone} data-testid="narrative-slot-state" data-state={state}>
      {chip.label}
    </Badge>
  );
}

export interface NarrativeEditorProps {
  /** The prompt's rubric, as resolved by `usePromptCriteria`. */
  criteria: SuccessCriterion[];
}

/**
 * The walkthrough — the half of explaining a design an interviewer actually
 * listens to, graded by the explanation critic beside the brief.
 *
 * It is authored as reference-anchored slots, not one free-text box: an
 * overview, a rationale per component, a narration per criterion. Keying each
 * slot to a node or criterion id is what lets a lens read "this component is
 * explained" and "this requirement is walked" as references rather than
 * guessing which paragraph was about what.
 */
export function NarrativeEditor({ criteria }: NarrativeEditorProps) {
  const nodes = useCanvasStore((state) => state.nodes);
  const edges = useCanvasStore((state) => state.edges);
  const overview = useCanvasStore((state) => state.narrativeOverview);
  const rationales = useCanvasStore((state) => state.componentRationales);
  const narrations = useCanvasStore((state) => state.criterionNarrations);
  const setOverview = useCanvasStore((state) => state.setNarrativeOverview);
  const setRationale = useCanvasStore((state) => state.setComponentRationale);
  const setNarration = useCanvasStore((state) => state.setCriterionNarration);

  const graph: CanvasGraph = useMemo(() => toCanvasGraph(nodes, edges), [nodes, edges]);
  const proseByNode = useMemo(
    () => new Map(rationales.map((rationale) => [rationale.nodeId, rationale.prose])),
    [rationales],
  );
  const proseByCriterion = useMemo(
    () => new Map(narrations.map((narration) => [narration.criterionId, narration.prose])),
    [narrations],
  );
  const groups = useMemo(() => groupCriteriaByKind(criteria), [criteria]);

  const unexplained = useMemo(
    () =>
      graph.nodes.filter((node) => narrationSlotState(proseByNode.get(node.id) ?? '') === 'empty'),
    [graph, proseByNode],
  );

  return (
    <Stack gap={5}>
      <Text size="sm" tone="muted">
        Walk a reader through the design — the big picture, why each component is there, and how
        each criterion is met. The explanation critic reads every slot against your diagram: a claim
        the drawing does not back costs more than silence.
      </Text>

      <Stack gap={2}>
        <Heading level={3}>Overview</Heading>
        <TextAreaField
          label="The big picture — why this shape"
          data-testid="narrative-overview"
          rows={4}
          value={overview}
          onChange={(event) => setOverview(event.target.value)}
          placeholder="e.g. Reads and writes are split so a spike in order lookups never…"
        />
        <SlotChip prose={overview} />
      </Stack>

      <Stack gap={3}>
        <Heading level={3}>Why each component is here</Heading>
        {graph.nodes.length === 0 ? (
          <Text size="sm" tone="muted">
            Add components to the diagram, then explain what each one is for.
          </Text>
        ) : (
          graph.nodes.map((node) => {
            const prose = proseByNode.get(node.id) ?? '';
            return (
              <Stack key={node.id} gap={2}>
                <Stack direction="row" gap={2} align="center" wrap>
                  <Badge kind={node.kind}>{node.label}</Badge>
                  <SlotChip prose={prose} />
                </Stack>
                <TextAreaField
                  label={`Why ${node.label} is here`}
                  data-testid={`narrative-rationale-${node.id}`}
                  rows={3}
                  value={prose}
                  onChange={(event) => setRationale(node.id, event.target.value)}
                  placeholder="What this component does for the design, and why it earns its place."
                />
              </Stack>
            );
          })
        )}
      </Stack>

      <Stack gap={3}>
        <Heading level={3}>How each criterion is met</Heading>
        {criteria.length === 0 ? (
          <Text size="sm" tone="muted">
            The criteria arrive once the prompt's requirements are normalized.
          </Text>
        ) : (
          groups.map((group) => (
            <Stack key={group.kind} gap={3}>
              <Heading level={4}>{humanizeKind(group.kind)}</Heading>
              {group.criteria.map((criterion) => {
                const prose = proseByCriterion.get(criterion.id) ?? '';
                return (
                  <Stack key={criterion.id} gap={2}>
                    <Stack direction="row" gap={2} align="center" wrap>
                      <Badge tone="accent">{criterion.id}</Badge>
                      <Text as="span" size="sm">
                        {criterion.statement}
                      </Text>
                      <SlotChip prose={prose} />
                    </Stack>
                    <TextAreaField
                      label={`Walkthrough for ${criterion.id}`}
                      data-testid={`narrative-narration-${criterion.id}`}
                      rows={3}
                      value={prose}
                      onChange={(event) => setNarration(criterion.id, event.target.value)}
                      placeholder="Trace the request in words — which components it touches, in order, and why."
                    />
                  </Stack>
                );
              })}
            </Stack>
          ))
        )}
      </Stack>

      {unexplained.length > 0 ? (
        <Stack gap={2} data-testid="narrative-unexplained">
          <Text size="sm" tone="secondary">
            {unexplained.length === 1 ? 'This component is' : 'These components are'} not yet
            explained
          </Text>
          <Stack direction="row" gap={2} wrap>
            {unexplained.map((node) => (
              <Badge key={node.id} kind={node.kind}>
                {node.label}
              </Badge>
            ))}
          </Stack>
        </Stack>
      ) : null}
    </Stack>
  );
}
