'use client';

import styled from '@emotion/styled';
import {
  EDGE_KINDS,
  NODE_KIND_CATEGORIES,
  kindsInCategory,
  type NodeKind,
} from '@sysdesign/contracts';
import { Button, Heading, Stack, Text } from '@sysdesign/design-system';

import { SelectField, TextField } from '../../../components/fields';
import { useCanvasStore } from '../canvas-store-context';
import { DEFAULT_NODE_LABELS } from '../canvas-store';
import { NodeConfigFields } from './node-config-fields';

const Root = styled.aside`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[4]}px;
  padding: ${({ theme }) => theme.space[4]}px;
  background: ${({ theme }) => theme.color.bg.surface};
  border: 1px solid ${({ theme }) => theme.color.border.subtle};
  border-radius: ${({ theme }) => theme.radius.lg};
`;

/**
 * Edit surface for the selected element. Reads and writes the canvas store
 * directly; the config sub-forms write the keys the eval rules read.
 */
export function PropertiesPanel() {
  const selectedId = useCanvasStore((state) => state.selectedId);
  const node = useCanvasStore((state) =>
    state.selectedId === null
      ? undefined
      : state.nodes.find((candidate) => candidate.id === state.selectedId),
  );
  const edge = useCanvasStore((state) =>
    state.selectedId === null
      ? undefined
      : state.edges.find((candidate) => candidate.id === state.selectedId),
  );
  const updateNode = useCanvasStore((state) => state.updateNode);
  const updateEdge = useCanvasStore((state) => state.updateEdge);
  const removeSelected = useCanvasStore((state) => state.removeSelected);

  if (selectedId === null || (!node && !edge)) {
    return (
      <Root aria-label="Properties" data-testid="properties-panel">
        <Heading level={2}>Properties</Heading>
        <Text size="sm" tone="muted">
          Select a block or connection to edit it.
        </Text>
      </Root>
    );
  }

  return (
    <Root aria-label="Properties" data-testid="properties-panel">
      <Heading level={2}>Properties</Heading>

      {node ? (
        <Stack gap={4}>
          <TextField
            label="Label"
            value={node.data.label}
            maxLength={80}
            onChange={(event) => updateNode(node.id, { label: event.target.value })}
          />
          <SelectField
            label="Kind"
            value={node.data.kind}
            onChange={(event) =>
              updateNode(node.id, {
                kind: event.target.value as NodeKind,
              })
            }
          >
            {/* One group per contract category; a category with no kinds renders nothing. */}
            {NODE_KIND_CATEGORIES.map((category) => {
              const kinds = kindsInCategory(category.id);
              if (kinds.length === 0) return null;

              return (
                <optgroup key={category.id} label={category.label}>
                  {kinds.map((kind) => (
                    <option key={kind} value={kind}>
                      {DEFAULT_NODE_LABELS[kind]}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </SelectField>
          <NodeConfigFields
            kind={node.data.kind}
            config={node.data.config ?? {}}
            onChange={(config) => updateNode(node.id, { config })}
          />
        </Stack>
      ) : null}

      {edge ? (
        <Stack gap={4}>
          <SelectField
            label="Call style"
            value={edge.data?.kind ?? 'sync'}
            onChange={(event) =>
              updateEdge(edge.id, {
                kind: event.target.value as (typeof EDGE_KINDS)[number],
              })
            }
          >
            {EDGE_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {kind === 'sync' ? 'sync (request/response)' : 'async (fire-and-forget)'}
              </option>
            ))}
          </SelectField>
          <TextField
            label="Label"
            value={typeof edge.label === 'string' ? edge.label : ''}
            maxLength={80}
            placeholder="e.g. writes, cache fill"
            onChange={(event) => updateEdge(edge.id, { label: event.target.value })}
          />
        </Stack>
      ) : null}

      <Button variant="ghost" onClick={removeSelected} data-testid="delete-selected">
        Delete {node ? 'block' : 'connection'}
      </Button>
    </Root>
  );
}
