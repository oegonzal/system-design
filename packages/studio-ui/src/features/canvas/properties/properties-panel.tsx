'use client';

import styled from '@emotion/styled';
import {
  DEFAULT_NODE_LABELS,
  EDGE_CONFIG_HINTS,
  EDGE_CONFIG_KEYS_BOUND,
  EDGE_KINDS,
  EDGE_LABEL_BOUND,
  kindsInCategory,
  NODE_CONFIG_KEYS_BOUND,
  NODE_KIND_CATEGORIES,
  NODE_KIND_GUIDE,
  NODE_LABEL_BOUND,
  type EdgeKind,
  type NodeKind,
  type PlatformCatalogue,
} from '@sysdesign/contracts';
import { Button, Heading, SelectField, Stack, Text, TextField } from '@sysdesign/design-system';

import { useCanvasStore } from '../canvas-store-context';
import { CANVAS_COPY } from '../copy';
import { catalogueFor, serviceOf } from '../platform-services';
import { BoundaryField } from './boundary-field';
import { ConfigEditor } from './config-editor';
import { EdgeCarriesField } from './edge-carries-field';
import { OperationsEditor } from './operations-editor';
import { ResponsibilitiesEditor } from './responsibilities-editor';
import { ServiceField } from './service-field';
import { useDescriptionInView } from './use-description-in-view';

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
 * Every control in the panel sits in one fieldset, so read-only is one
 * attribute the browser applies to all of them — no editor, present or
 * future, can be left editable. Styled away: it groups, it does not frame.
 */
const Fields = styled.fieldset`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[4]}px;
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
`;

export interface PropertiesPanelProps {
  /** Lets a parent layout size the panel as a flex item (Emotion composition). */
  className?: string;
  /** The platform the session's prompt declares, whose services a block may be; none for a neutral prompt. */
  catalogue?: PlatformCatalogue | null;
}

/**
 * Edit surface for the selected element. Reads and writes the canvas store
 * directly. Every section applies to every kind: configuration, roles and
 * operations are what the author declares, and the quality loop's lenses judge
 * whether a queue with a query or a client with three replicas makes sense.
 * While the canvas is read-only the element can be inspected, not edited.
 */
export function PropertiesPanel({ className, catalogue = null }: PropertiesPanelProps) {
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
  // The whole list, so a selected edge re-resolves its endpoints' declared
  // operations as they are edited in another selection.
  const nodes = useCanvasStore((state) => state.nodes);
  const updateNode = useCanvasStore((state) => state.updateNode);
  const updateEdge = useCanvasStore((state) => state.updateEdge);
  const removeSelected = useCanvasStore((state) => state.removeSelected);
  const readOnly = useCanvasStore((state) => state.readOnly);
  // The panel scrolls inside the dock: a field typed at its bottom edge keeps
  // its hint and its countdown in view with it.
  const descriptionInView = useDescriptionInView();

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

  const sourceNode = edge ? nodes.find((candidate) => candidate.id === edge.source) : undefined;
  const targetNode = edge ? nodes.find((candidate) => candidate.id === edge.target) : undefined;
  // The service a block names, and the catalogue its Service control lists.
  const service = node?.data.service === undefined ? null : serviceOf(node.data.service);
  const shelves = node ? catalogueFor(catalogue, node.data.service) : null;
  const guide = service ?? (node ? NODE_KIND_GUIDE[node.data.kind] : null);

  return (
    <Root
      aria-label="Properties"
      data-testid="properties-panel"
      className={className}
      {...descriptionInView}
    >
      <Heading level={2}>Properties</Heading>
      {readOnly ? (
        <Text size="sm" tone="muted" data-testid="properties-readonly">
          {CANVAS_COPY.readOnly}
        </Text>
      ) : null}

      <Fields disabled={readOnly} data-testid="properties-fields">
        {node ? (
          <Stack gap={4}>
            <TextField
              label="Label"
              value={node.data.label}
              maxLength={NODE_LABEL_BOUND.ceiling}
              target={NODE_LABEL_BOUND.target}
              onChange={(event) => updateNode(node.id, { label: event.target.value })}
              // Clearing the field is allowed while typing; leaving it blank is not.
              // A nameless node reads as a nameless node everywhere it is printed —
              // the diagram, the lens prompt, a cited location — so the kind's own
              // name stands in on blur rather than at every keystroke.
              onBlur={() => {
                if (node.data.label.trim().length === 0) {
                  updateNode(node.id, { label: DEFAULT_NODE_LABELS[node.data.kind] });
                }
              }}
            />
            {shelves ? (
              <ServiceField
                catalogue={shelves}
                value={node.data.service ?? null}
                onChange={(next) => updateNode(node.id, { service: next })}
              />
            ) : null}
            <SelectField
              label="Kind"
              value={node.data.kind}
              onChange={(event) => updateNode(node.id, { kind: event.target.value as NodeKind })}
            >
              {service ? (
                /* A block that names a service plays one of the roles the catalogue lists for it. */
                <optgroup label={`Roles ${service.label} plays`}>
                  {service.roles.map((kind) => (
                    <option key={kind} value={kind}>
                      {DEFAULT_NODE_LABELS[kind]}
                    </option>
                  ))}
                </optgroup>
              ) : (
                /* One group per contract category; a category with no kinds renders nothing. */
                NODE_KIND_CATEGORIES.map((category) => {
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
                })
              )}
            </SelectField>
            {/* The product explains its own vocabulary: what this service or kind is and when to use it. */}
            {guide ? (
              <Stack gap={1} data-testid="kind-guide">
                <Text size="sm" tone="muted">
                  {guide.what}
                </Text>
                <Text size="sm" tone="muted">
                  {guide.whenToUse}
                </Text>
              </Stack>
            ) : null}

            <BoundaryField
              value={node.data.boundary ?? ''}
              boundaries={catalogue?.boundaries ?? []}
              onChange={(boundary) =>
                updateNode(node.id, { boundary: boundary.length === 0 ? null : boundary })
              }
            />

            <Stack gap={2} data-testid="config-section">
              <Heading level={3}>Configuration</Heading>
              <Text size="sm" tone="muted" data-testid="config-guide">
                The numbers and switches this component runs with — replicas, a TTL, a delivery
                guarantee. The lenses read them as declared; a target the design claims but never
                configures is a finding.
              </Text>
              <ConfigEditor
                config={node.data.config ?? []}
                keysBound={NODE_CONFIG_KEYS_BOUND}
                hints={service?.knobs ?? []}
                onChange={(config) => updateNode(node.id, { config })}
              />
            </Stack>

            <Stack gap={4} data-testid="interface-section">
              <Heading level={3}>Interface</Heading>
              <Stack gap={2}>
                <Text size="sm" tone="muted" data-testid="responsibilities-guide">
                  Responsibilities — short clauses for what this component owns. A component nothing
                  accounts for is a finding; two claiming the same thing, another.
                </Text>
                <ResponsibilitiesEditor
                  responsibilities={node.data.responsibilities ?? []}
                  onChange={(responsibilities) => updateNode(node.id, { responsibilities })}
                />
              </Stack>
              <Stack gap={2}>
                <Heading level={4}>Operations</Heading>
                <Text size="sm" tone="muted" data-testid="interface-guide">
                  What this component serves or publishes. A connection carries them by name, so a
                  declared operation nothing calls — or a call to one nothing declares — is visible
                  to the lenses.
                </Text>
                <OperationsEditor
                  operations={node.data.operations ?? []}
                  onChange={(operations) => updateNode(node.id, { operations })}
                />
              </Stack>
            </Stack>
          </Stack>
        ) : null}

        {edge ? (
          <Stack gap={4}>
            <SelectField
              label="Call style"
              value={edge.data?.kind ?? 'sync'}
              onChange={(event) => updateEdge(edge.id, { kind: event.target.value as EdgeKind })}
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
              maxLength={EDGE_LABEL_BOUND.ceiling}
              target={EDGE_LABEL_BOUND.target}
              placeholder="e.g. writes, cache fill"
              onChange={(event) => updateEdge(edge.id, { label: event.target.value })}
            />
            <Text size="sm" tone="muted">
              Shown on the connection when no operations are carried.
            </Text>
            {sourceNode && targetNode ? (
              <EdgeCarriesField
                carries={edge.data?.carries ?? []}
                source={{
                  label: sourceNode.data.label,
                  operations: sourceNode.data.operations ?? [],
                }}
                target={{
                  label: targetNode.data.label,
                  operations: targetNode.data.operations ?? [],
                }}
                onChange={(carries) => updateEdge(edge.id, { carries })}
              />
            ) : null}
            <Stack gap={2} data-testid="edge-config-section">
              <Heading level={3}>Configuration</Heading>
              <Text size="sm" tone="muted" data-testid="edge-config-guide">
                How this hop is made and what happens when it fails — the protocol, the auth, a
                timeout, the retries, a dead-letter queue, the delivery or ordering guarantee. The
                graders read every hop as declared; one left silent is a finding.
              </Text>
              <ConfigEditor
                config={edge.data?.config ?? []}
                keysBound={EDGE_CONFIG_KEYS_BOUND}
                hints={EDGE_CONFIG_HINTS}
                onChange={(config) => updateEdge(edge.id, { config })}
              />
            </Stack>
          </Stack>
        ) : null}

        <Button variant="ghost" onClick={removeSelected} data-testid="delete-selected">
          Delete {node ? 'block' : 'connection'}
        </Button>
      </Fields>
    </Root>
  );
}
