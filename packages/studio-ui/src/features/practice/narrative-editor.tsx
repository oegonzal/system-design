'use client';

import styled from '@emotion/styled';
import { NARRATIVE_MAX_LENGTH, unmentionedNodeLabels } from '@sysdesign/contracts';
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

/**
 * The design-narrative author box. Reads and writes the canvas store
 * directly: the textarea edits `narrative`, and the coverage checklist runs
 * the same `unmentionedNodeLabels` helper the eval engine grades with — the
 * author can never be told "covered" by one definition and scored by
 * another. Ghost (suggested-fix preview) nodes are not the author's
 * components yet, so they never appear in the checklist.
 */
export function NarrativeEditor() {
  const narrative = useCanvasStore((state) => state.narrative);
  const nodes = useCanvasStore((state) => state.nodes);
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

  const words = countWords(narrative);

  return (
    <Stack gap={3}>
      <Text size="sm" tone="muted">
        Explain what each component is for and how they work together to meet the requirements — the
        evaluation reads this along with the diagram.
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
    </Stack>
  );
}
