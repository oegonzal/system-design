'use client';

import styled from '@emotion/styled';
import {
  EDGE_INTENTS,
  EDGE_KINDS,
  INTERFACE_CAPABILITIES,
  NODE_KIND_CATEGORIES,
  NODE_KIND_GUIDE,
  canDeclareOperations,
  interfaceSummary,
  kindsInCategory,
  resolveInterfaceOwner,
  type NodeKind,
  type EdgeIntent,
} from '@sysdesign/contracts';
import { Button, Heading, Stack, Text } from '@sysdesign/design-system';

import { SelectField, TextField } from '../../../components/fields';
import { useCanvasStore } from '../canvas-store-context';
import { DEFAULT_NODE_LABELS } from '../canvas-store';
import { EdgeCarriesField } from './edge-carries-field';
import { NodeConfigFields } from './node-config-fields';
import { OperationsEditor } from './operations-editor';
import { ResponsibilitiesEditor } from './responsibilities-editor';

const Root = styled.aside`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[4]}px;
  padding: ${({ theme }) => theme.space[4]}px;
  background: ${({ theme }) => theme.color.bg.surface};
  border: 1px solid ${({ theme }) => theme.color.border.subtle};
  border-radius: ${({ theme }) => theme.radius.lg};
`;

export interface PropertiesPanelProps {
  /** Lets a parent layout size the panel as a flex item (Emotion composition). */
  className?: string;
}

/**
 * Edit surface for the selected element. Reads and writes the canvas store
 * directly; the config sub-forms write the keys the eval rules read.
 */
export function PropertiesPanel({ className }: PropertiesPanelProps) {
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
  // The whole list, so a selected edge re-resolves its interface owner as the
  // owner's declared operations are edited in another selection.
  const nodes = useCanvasStore((state) => state.nodes);
  const updateNode = useCanvasStore((state) => state.updateNode);
  const updateEdge = useCanvasStore((state) => state.updateEdge);
  const removeSelected = useCanvasStore((state) => state.removeSelected);

  if (selectedId === null || (!node && !edge)) {
    return (
      <Root aria-label="Properties" data-testid="properties-panel" className={className}>
        <Heading level={2}>Properties</Heading>
        <Text size="sm" tone="muted">
          Select a block or connection to edit it.
        </Text>
      </Root>
    );
  }

  // What the selected node's interface *is* — nothing renders for kinds whose
  // capability row declares no operation kinds (storage, edge-infra, passive).
  const capability = node ? INTERFACE_CAPABILITIES[node.data.kind] : undefined;

  // The selected edge's interface owner: the one node whose declared
  // operations its `carries` names resolve against.
  const sourceNode = edge ? nodes.find((candidate) => candidate.id === edge.source) : undefined;
  const targetNode = edge ? nodes.find((candidate) => candidate.id === edge.target) : undefined;
  const ownerSide =
    sourceNode && targetNode
      ? resolveInterfaceOwner(sourceNode.data.kind, targetNode.data.kind)
      : null;
  const ownerNode =
    ownerSide === 'source' ? sourceNode : ownerSide === 'target' ? targetNode : undefined;
  const carriesOwner =
    ownerNode && canDeclareOperations(ownerNode.data.kind) ? ownerNode : undefined;

  return (
    <Root aria-label="Properties" data-testid="properties-panel" className={className}>
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
          {/* The product explains its own vocabulary: what this kind is, when
              to use it, and (derived from the capability table) its interface. */}
          <Stack gap={1} data-testid="kind-guide">
            <Text size="sm" tone="muted">
              {NODE_KIND_GUIDE[node.data.kind].what}
            </Text>
            <Text size="sm" tone="muted">
              {NODE_KIND_GUIDE[node.data.kind].whenToUse}
            </Text>
            {interfaceSummary(node.data.kind) !== null ? (
              <Text size="sm" tone="muted">
                {interfaceSummary(node.data.kind)}
              </Text>
            ) : null}
          </Stack>
          <NodeConfigFields
            kind={node.data.kind}
            config={node.data.config ?? {}}
            onChange={(config) => updateNode(node.id, { config })}
          />
          {capability && capability.operationKinds.length > 0 ? (
            <Stack gap={4} data-testid="interface-section">
              <Heading level={3}>Interface</Heading>
              {/* Channels carry other components' facts; only api-role kinds own responsibilities. */}
              {capability.role === 'api' ? (
                <ResponsibilitiesEditor
                  responsibilities={node.data.responsibilities ?? []}
                  onChange={(responsibilities) => updateNode(node.id, { responsibilities })}
                />
              ) : null}
              <OperationsEditor
                heading={capability.editorLabel ?? 'Operations'}
                operations={node.data.operations ?? []}
                allowedKinds={capability.operationKinds}
                onChange={(operations) => updateNode(node.id, { operations })}
              />
            </Stack>
          ) : null}
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

          {/*
            What the connection is FOR, beside how it is called. Optional: the
            engine presumes nothing from silence, and declaring `read` is what
            keeps an honestly-drawn read path from being counted as a writer.
          */}
          <SelectField
            label="Intent"
            data-testid="edge-intent"
            value={edge.data?.intent ?? ''}
            onChange={(event) =>
              updateEdge(edge.id, {
                intent: (event.target.value || undefined) as EdgeIntent | undefined,
              })
            }
          >
            <option value="">Not stated</option>
            {EDGE_INTENTS.map((intent) => (
              <option key={intent} value={intent}>
                {intent}
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
          <Text size="sm" tone="muted">
            Shown on the connection when no operations are carried.
          </Text>
          {carriesOwner ? (
            <EdgeCarriesField
              carries={edge.data?.carries ?? []}
              ownerLabel={carriesOwner.data.label}
              declaredOps={carriesOwner.data.operations ?? []}
              onChange={(carries) => updateEdge(edge.id, { carries })}
            />
          ) : null}
        </Stack>
      ) : null}

      <Button variant="ghost" onClick={removeSelected} data-testid="delete-selected">
        Delete {node ? 'block' : 'connection'}
      </Button>
    </Root>
  );
}
