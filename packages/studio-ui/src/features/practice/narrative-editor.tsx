'use client';

import { realComponentNodes, type CanvasGraph, type PromptDto } from '@sysdesign/contracts';
import { Badge, Heading, Stack, Text, TextAreaField } from '@sysdesign/design-system';
import { useMemo } from 'react';

import { useCanvasStore } from '../canvas/canvas-store-context';
import { toCanvasGraph } from '../canvas/graph-io';
import { narrationSlotState, type NarrationSlotState } from '../canvas/narration-draft';

const CHIP: Record<NarrationSlotState, { tone: 'neutral' | 'medium' | 'success'; label: string }> =
  {
    empty: { tone: 'neutral', label: 'Not written' },
    // The engine's distinction, said in the editor: present prose that does not
    // yet read as an explanation earns nothing until it does.
    thin: { tone: 'medium', label: 'Too thin to count' },
    explained: { tone: 'success', label: 'Explained' },
  };

/** The live verdict the grade will use, shown as the author writes. */
function SlotChip({ prose }: { prose: string }) {
  const chip = CHIP[narrationSlotState(prose)];
  return (
    <Badge
      tone={chip.tone}
      data-testid="narrative-slot-state"
      data-state={narrationSlotState(prose)}
    >
      {chip.label}
    </Badge>
  );
}

export interface NarrativeEditorProps {
  prompt: PromptDto;
}

/**
 * The walkthrough — the half of explaining a design an interviewer actually
 * listens to, and now graded like the brief beside it.
 *
 * It is authored as reference-anchored slots, not one free-text box: an
 * overview, a rationale per component, a narration per requirement. That is what
 * makes it gradeable without the substring heuristics the old free-text
 * narrative was deleted for — "explains this component" is a reference check
 * over `explainedNodeIds`, and "reads as an explanation" a shape check
 * (`readsAsProse`), neither of which a pasted keyword list can fake.
 *
 * Every slot shows the same verdict the grade will read, so the author learns
 * what a thin rationale earns while they write it rather than after they submit.
 */
export function NarrativeEditor({ prompt }: NarrativeEditorProps) {
  const nodes = useCanvasStore((state) => state.nodes);
  const edges = useCanvasStore((state) => state.edges);
  const overview = useCanvasStore((state) => state.narrativeOverview);
  const rationales = useCanvasStore((state) => state.componentRationales);
  const flowNarrations = useCanvasStore((state) => state.flowNarrations);
  const setOverview = useCanvasStore((state) => state.setNarrativeOverview);
  const setRationale = useCanvasStore((state) => state.setComponentRationale);
  const setFlow = useCanvasStore((state) => state.setFlowNarration);

  const graph: CanvasGraph = useMemo(() => toCanvasGraph(nodes, edges), [nodes, edges]);
  const proseByNode = useMemo(
    () => new Map(rationales.map((rationale) => [rationale.nodeId, rationale.prose])),
    [rationales],
  );
  const proseByRequirement = useMemo(
    () => new Map(flowNarrations.map((flow) => [flow.requirementIndex, flow.prose])),
    [flowNarrations],
  );

  // Annotations narrate nothing — a request never routes through monitoring —
  // so they get no slot. `realComponentNodes` is the SAME set the grade explains
  // over (`exp.nar.components-explained`), so the editor and the grade can never
  // disagree about which boxes need a rationale.
  const componentNodes = useMemo(() => realComponentNodes(graph), [graph]);

  // The gap the grade measures: every real component the walkthrough has not yet
  // explained. Each is a genuine graded finding, so a complete walkthrough
  // leaves this empty.
  const unexplained = useMemo(
    () =>
      componentNodes.filter(
        (node) => narrationSlotState(proseByNode.get(node.id) ?? '') !== 'explained',
      ),
    [componentNodes, proseByNode],
  );

  return (
    <Stack gap={5}>
      <Text size="sm" tone="muted">
        Walk a reader through the design — the big picture, why each component is there, and how
        each requirement&apos;s request travels. This is graded: a substantive, aligned walkthrough
        earns the explanation score and is required for a top grade.
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
        {componentNodes.length === 0 ? (
          <Text size="sm" tone="muted">
            Add components to the diagram, then explain what each one is for.
          </Text>
        ) : (
          componentNodes.map((node) => {
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
        <Heading level={3}>How each requirement is served</Heading>
        {prompt.functionalRequirements.map((requirement, index) => {
          const prose = proseByRequirement.get(index) ?? '';
          return (
            <Stack key={requirement} gap={2}>
              <Stack direction="row" gap={2} align="center" wrap>
                <Text as="span" size="sm">
                  {requirement}
                </Text>
                <SlotChip prose={prose} />
              </Stack>
              <TextAreaField
                label={`Walkthrough for requirement ${index + 1}`}
                data-testid={`narrative-flow-${index}`}
                rows={3}
                value={prose}
                onChange={(event) => setFlow(index, event.target.value)}
                placeholder="Trace the request in words — which components it touches, in order, and why."
              />
            </Stack>
          );
        })}
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
