'use client';

import styled from '@emotion/styled';
import {
  DEFAULT_NODE_LABELS,
  kindsInCategory,
  NODE_KIND_CATEGORIES,
  NODE_KIND_GUIDE,
  type NodeKind,
  type NodeKindCategoryId,
} from '@sysdesign/contracts';
import { Heading, Stack, Text, TextField, transient } from '@sysdesign/design-system';
import { useState, type DragEvent } from 'react';

import { useCanvasStore } from '../canvas-store-context';
import { CANVAS_COPY } from '../copy';
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

const CategorySection = styled.section`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[2]}px;
`;

/**
 * Sticks to the top of the aside's own scroll while its section passes by —
 * the surface background and z-index keep the kind buttons sliding *under*
 * it rather than through it.
 */
const CategoryHeader = styled.div`
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]}px;
  padding: ${({ theme }) => `${theme.space[1]}px 0`};
  background: ${({ theme }) => theme.color.bg.surface};
`;

/** The category's anchor hue, as a swatch beside its heading. */
const CategoryDot = styled('span', transient)<{ $category: NodeKindCategoryId }>`
  width: 10px;
  height: 10px;
  flex-shrink: 0;
  border-radius: ${({ theme }) => theme.radius.sm};
  background: ${({ theme, $category }) => theme.color.nodeKindCategory[$category]};
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

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.color.bg.subtle};
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.border.focus};
    outline-offset: 1px;
  }

  &:disabled {
    cursor: not-allowed;
    color: ${({ theme }) => theme.color.text.muted};
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

/** Case-insensitive substring match on label, slug, or category label. */
function matches(kind: NodeKind, categoryLabel: string, query: string): boolean {
  if (query === '') return true;
  return (
    DEFAULT_NODE_LABELS[kind].toLowerCase().includes(query) ||
    kind.includes(query) ||
    categoryLabel.toLowerCase().includes(query)
  );
}

export interface PaletteProps {
  /** Lets a parent layout size the palette as a flex item (Emotion composition). */
  className?: string;
}

/**
 * The building-block sidebar. Shelved by the contract's `NODE_KIND_CATEGORIES`
 * and mapped over `kindsInCategory` — the palette can never drift from the
 * vocabulary the eval engine grades, and a category with no kinds (or none
 * matching the filter) renders nothing rather than an empty shelf.
 *
 * Every entry is both draggable (drop on the canvas for exact placement) and
 * a real button (click/Enter adds it in the free slot nearest the visible
 * centre — the store decides where) — the keyboard path and the e2e path are
 * the same code path. While the canvas is read-only every entry is disabled;
 * the store would refuse the add anyway.
 *
 * The filter is view state, not canvas state: it narrows what the sidebar
 * shows and touches nothing in the store. Testid discipline: only kind
 * buttons carry `palette-*` (an e2e gate counts them); everything the
 * category layer adds is `blocks-*`.
 */
export function Palette({ className }: PaletteProps) {
  const addNode = useCanvasStore((state) => state.addNode);
  const readOnly = useCanvasStore((state) => state.readOnly);
  const [query, setQuery] = useState('');
  const normalized = query.trim().toLowerCase();

  const handleDragStart = (event: DragEvent<HTMLButtonElement>, kind: NodeKind) => {
    event.dataTransfer.setData(NODE_DRAG_MIME, kind);
    event.dataTransfer.effectAllowed = 'move';
  };

  const sections = NODE_KIND_CATEGORIES.map((category) => ({
    category,
    kinds: kindsInCategory(category.id).filter((kind) => matches(kind, category.label, normalized)),
  })).filter((section) => section.kinds.length > 0);

  return (
    <Root aria-label="Building blocks" className={className}>
      <Heading level={2}>Blocks</Heading>
      <Text size="sm" tone="muted" data-testid="blocks-hint">
        {readOnly ? CANVAS_COPY.readOnly : 'Drag onto the canvas, or press Enter to add.'}
      </Text>
      <TextField
        label="Filter blocks"
        value={query}
        placeholder="e.g. cache, messaging"
        data-testid="blocks-filter"
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setQuery('');
        }}
      />
      {sections.length === 0 ? (
        <Text size="sm" tone="muted" role="status">
          No blocks match “{query}”.
        </Text>
      ) : (
        sections.map(({ category, kinds }) => (
          <CategorySection key={category.id} data-testid={`blocks-category-${category.id}`}>
            <CategoryHeader>
              <CategoryDot $category={category.id} aria-hidden />
              <Heading level={3}>{category.label}</Heading>
            </CategoryHeader>
            <Stack as="ul" gap={2}>
              {kinds.map((kind) => (
                <li key={kind}>
                  <KindButton
                    type="button"
                    $kind={kind}
                    title={NODE_KIND_GUIDE[kind].what}
                    disabled={readOnly}
                    draggable={!readOnly}
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
          </CategorySection>
        ))
      )}
    </Root>
  );
}
