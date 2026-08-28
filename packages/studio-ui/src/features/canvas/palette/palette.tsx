'use client';

import styled from '@emotion/styled';
import { NODE_KINDS, type NodeKind } from '@sysdesign/contracts';
import { Heading, Stack, Text, transient } from '@sysdesign/design-system';
import type { DragEvent } from 'react';

import { useCanvasStore } from '../canvas-store-context';
import { DEFAULT_NODE_LABELS } from '../canvas-store';
import { NODE_ICONS } from '../nodes/node-icons';

export const NODE_DRAG_MIME = 'application/sysdesign-node';

const Root = styled.aside`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[3]}px;
  padding: ${({ theme }) => theme.space[4]}px;
  background: ${({ theme }) => theme.color.bg.surface};
  border: 1px solid ${({ theme }) => theme.color.border.subtle};
  border-radius: ${({ theme }) => theme.radius.lg};
  overflow-y: auto;
`;

const KindButton = styled('button', transient)<{ $kind: NodeKind }>`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]}px;
  width: 100%;
  padding: ${({ theme }) => `${theme.space[2]}px ${theme.space[3]}px`};
  border: 1px solid ${({ theme }) => theme.color.border.subtle};
  border-left: 3px solid ${({ theme, $kind }) => theme.color.nodeKind[$kind]};
  border-radius: ${({ theme }) => theme.radius.sm};
  background: ${({ theme }) => theme.color.bg.surface};
  color: ${({ theme }) => theme.color.text.primary};
  font-family: ${({ theme }) => theme.font.family.base};
  font-size: ${({ theme }) => theme.font.size.sm};
  text-align: left;
  cursor: grab;

  &:hover {
    background: ${({ theme }) => theme.color.bg.subtle};
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.border.focus};
    outline-offset: 1px;
  }
`;

const IconChip = styled('span', transient)<{ $kind: NodeKind }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  border-radius: ${({ theme }) => theme.radius.sm};
  background: ${({ theme, $kind }) => theme.color.nodeKind[$kind]};
  color: ${({ theme, $kind }) => theme.color.nodeKindFg[$kind]};
`;

/**
 * The building-block sidebar. Maps over the contract's `NODE_KINDS` tuple —
 * the palette can never drift from the vocabulary the eval engine grades.
 *
 * Every entry is both draggable (drop on the canvas for exact placement) and
 * a real button (click/Enter adds at a staggered center-ish spot) — the
 * keyboard path and the e2e path are the same code path.
 */
export function Palette() {
  const addNode = useCanvasStore((state) => state.addNode);

  const handleDragStart = (event: DragEvent<HTMLButtonElement>, kind: NodeKind) => {
    event.dataTransfer.setData(NODE_DRAG_MIME, kind);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <Root aria-label="Building blocks">
      <Heading level={2}>Blocks</Heading>
      <Text size="sm" tone="muted">
        Drag onto the canvas, or press Enter to add.
      </Text>
      <Stack as="ul" gap={2}>
        {NODE_KINDS.map((kind) => (
          <li key={kind}>
            <KindButton
              type="button"
              $kind={kind}
              draggable
              onDragStart={(event) => handleDragStart(event, kind)}
              onClick={() => addNode(kind)}
              data-testid={`palette-${kind}`}
            >
              <IconChip $kind={kind}>{NODE_ICONS[kind]}</IconChip>
              {DEFAULT_NODE_LABELS[kind]}
            </KindButton>
          </li>
        ))}
      </Stack>
    </Root>
  );
}
