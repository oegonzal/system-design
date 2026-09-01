'use client';

import styled from '@emotion/styled';
import {
  NARRATIVE_MAX_LENGTH,
  hasFlowStory,
  unaddressedNfrKinds,
  unmentionedNodeLabels,
  type PromptDto,
} from '@sysdesign/contracts';
import { Badge, Stack, Text } from '@sysdesign/design-system';
import { useMemo } from 'react';

import { TextAreaField } from '../../components/fields';
import { useCanvasStore } from '../canvas/canvas-store-context';

const ChipRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]}px;
`;

/** Words in the draft: whitespace-separated runs, zero for blank text. */
function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;
}

export interface NarrativeEditorProps {
  /** The practice prompt, so the checklist can track its requirements. */
  prompt: PromptDto | null;
}

/**
 * The design-narrative author box. Reads and writes the canvas store
 * directly: the textarea edits `narrative`, and every checklist runs the
 * same contracts helpers the eval engine grades with (`unmentionedNodeLabels`,
 * `unaddressedNfrKinds`, `hasFlowStory`) — the author can never be told
 * "covered" by one definition and scored by another. Ghost (suggested-fix
 * preview) nodes are not the author's components yet, so they never appear
 * in the checklist.
 */
export function NarrativeEditor({ prompt }: NarrativeEditorProps) {
  const narrative = useCanvasStore((state) => state.narrative);
  const nodes = useCanvasStore((state) => state.nodes);
  const edgeCount = useCanvasStore((state) => state.edges.length);
  const setNarrative = useCanvasStore((state) => state.setNarrative);

  const labeledCount = useMemo(
    () => nodes.filter((node) => !node.data.ghost && node.data.label.trim().length > 0).length,
    [nodes],
  );
  const unmentioned = useMemo(
    () =>
      unmentionedNodeLabels(
        {
          nodes: nodes
            .filter((node) => !node.data.ghost)
            .map((node) => ({ id: node.id, kind: node.data.kind, label: node.data.label })),
          edges: [],
        },
        narrative,
      ),
    [nodes, narrative],
  );
  const unaddressed = useMemo(() => {
    if (prompt === null) return [];
    const kinds = [...new Set(prompt.nonFunctionalRequirements.map((nfr) => nfr.kind))];
    return unaddressedNfrKinds(kinds, narrative);
  }, [prompt, narrative]);

  const words = countWords(narrative);
  const missingFlow = words > 0 && edgeCount > 0 && !hasFlowStory(narrative);

  return (
    <Stack gap={3}>
      <Text size="sm" tone="muted">
        The story is graded with the diagram: say what each component is for, how a request flows
        between them, and which requirement each mechanism serves.
      </Text>
      <TextAreaField
        label="Design narrative"
        data-testid="narrative-editor"
        rows={10}
        maxLength={NARRATIVE_MAX_LENGTH}
        value={narrative}
        onChange={(event) => setNarrative(event.target.value)}
        placeholder="e.g. The API Gateway authenticates every request, then…"
      />
      <Text size="sm" tone="muted" data-testid="narrative-word-count">
        {words} {words === 1 ? 'word' : 'words'}
      </Text>
      {labeledCount === 0 ? null : unmentioned.length === 0 ? (
        <Text size="sm" tone="muted" data-testid="narrative-all-covered">
          Every component on the canvas is mentioned.
        </Text>
      ) : (
        <ChipRow data-testid="narrative-unmentioned">
          <Text size="sm" tone="muted">
            Not yet mentioned:
          </Text>
          {unmentioned.map((label) => (
            <Badge key={label} tone="neutral">
              {label}
            </Badge>
          ))}
        </ChipRow>
      )}
      {prompt === null ? null : unaddressed.length === 0 ? (
        <Text size="sm" tone="muted" data-testid="narrative-nfr-covered">
          Every requirement kind is addressed.
        </Text>
      ) : (
        <ChipRow data-testid="narrative-nfr-unaddressed">
          <Text size="sm" tone="muted">
            Requirements not yet addressed:
          </Text>
          {unaddressed.map((kind) => (
            <Badge key={kind} tone="neutral">
              {kind}
            </Badge>
          ))}
        </ChipRow>
      )}
      {missingFlow ? (
        <Text size="sm" tone="muted" data-testid="narrative-flow-hint">
          No flow verbs yet — narrate the arrows: who calls whom, what is written where.
        </Text>
      ) : null}
    </Stack>
  );
}
