'use client';

import styled from '@emotion/styled';
import type { NodeKind, NodeKindCategoryId, PlatformCatalogue } from '@sysdesign/contracts';
import { Heading, Stack, Text, TextField, transient } from '@sysdesign/design-system';
import { useState, type DragEvent } from 'react';

import { useCanvasStore } from '../canvas-store-context';
import { CANVAS_COPY } from '../copy';
import { NODE_ICONS } from '../nodes/node-icons';
import type { PaletteBlock } from '../platform-services';
import { paletteSections } from './palette-entries';

export const NODE_DRAG_MIME = 'application/sysdesign-node';

/**
 * The scroll area has no top padding of its own — the title carries it. A
 * sticky header sticks to its scroll area's padding edge, so padding here
 * would leave a band above each stuck header that the entries show through.
 */
const Root = styled.aside`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[3]}px;
  padding: ${({ theme }) => `0 ${theme.space[4]}px ${theme.space[4]}px`};
  background: ${({ theme }) => theme.color.bg.surface};
  border: 1px solid ${({ theme }) => theme.color.border.subtle};
  border-radius: ${({ theme }) => theme.radius.lg};
  overflow-y: auto;
`;

/** The panel's top inset, scrolled away with the title rather than held by the scroll area. */
const Title = styled.div`
  padding-top: ${({ theme }) => theme.space[4]}px;
`;

const CategorySection = styled.section`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[2]}px;
`;

/**
 * Sticks flush to the top of the aside's own scroll while its section passes
 * by — the surface background and z-index keep the kind buttons sliding
 * *under* it rather than through it.
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

export interface PaletteProps {
  /** Lets a parent layout size the palette as a flex item (Emotion composition). */
  className?: string;
  /** The platform the session's prompt declares, whose services shelve ahead of the roles; none for a neutral prompt. */
  catalogue?: PlatformCatalogue | null;
}

/**
 * The building-block sidebar. Shelved by `paletteSections`: the declared
 * platform's categories first, one entry per service wearing its role's
 * glyph and colour, then the contract's `NODE_KIND_CATEGORIES` over
 * `kindsInCategory` — the palette can never drift from the vocabulary the
 * graders read, and a shelf with no entries (or none matching the filter)
 * renders nothing rather than an empty shelf.
 *
 * Every entry is both draggable (drop on the canvas for exact placement) and
 * a real button (click/Enter adds it in the free place nearest the middle of
 * what is visible — the store decides where) — the keyboard path and the e2e path are
 * the same code path. While the canvas is read-only every entry is disabled;
 * the store would refuse the add anyway.
 *
 * The filter is view state, not canvas state: it narrows what the sidebar
 * shows and touches nothing in the store. Testid discipline: a role button
 * carries `palette-<kind>` and a service button `palette-service-<id>` (an
 * e2e gate counts the roles); everything the shelf layer adds is `blocks-*`.
 */
export function Palette({ className, catalogue = null }: PaletteProps) {
  const addNode = useCanvasStore((state) => state.addNode);
  const readOnly = useCanvasStore((state) => state.readOnly);
  const [query, setQuery] = useState('');
  const normalized = query.trim().toLowerCase();

  const handleDragStart = (event: DragEvent<HTMLButtonElement>, block: PaletteBlock) => {
    event.dataTransfer.setData(NODE_DRAG_MIME, block);
    event.dataTransfer.effectAllowed = 'move';
  };

  const sections = paletteSections(catalogue, normalized);

  return (
    <Root aria-label="Building blocks" className={className}>
      <Title>
        <Heading level={2}>Blocks</Heading>
      </Title>
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
        sections.map((section) => (
          <CategorySection key={section.id} data-testid={section.id}>
            <CategoryHeader>
              {section.swatch !== null ? (
                <CategoryDot $category={section.swatch} aria-hidden />
              ) : null}
              <Heading level={3}>{section.label}</Heading>
            </CategoryHeader>
            <Stack as="ul" gap={2}>
              {section.entries.map((entry) => (
                <li key={entry.block}>
                  <KindButton
                    type="button"
                    $kind={entry.kind}
                    title={entry.hint}
                    disabled={readOnly}
                    draggable={!readOnly}
                    onDragStart={(event) => handleDragStart(event, entry.block)}
                    onClick={() => addNode(entry.block)}
                    data-testid={entry.testId}
                  >
                    <IconChip $kind={entry.kind}>{NODE_ICONS[entry.kind]}</IconChip>
                    {entry.label}
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
