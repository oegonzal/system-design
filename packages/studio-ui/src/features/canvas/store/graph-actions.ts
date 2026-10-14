import { DEFAULT_NODE_LABELS } from '@sysdesign/contracts';
import { applyEdgeChanges, applyNodeChanges, type NodePositionChange } from '@xyflow/react';

import { NODE_MIN_FOOTPRINT } from '../geometry';
import { dropPosition, placeBlock, type Placement } from '../placement';
import type { SdEdge, SdNode } from '../types';
import { isViewChange, nextId, selectionAfter, unselected } from './elements';
import type { ActionDeps } from './history';
import type { CanvasState } from './state';

/** One history key per field of one element, so a typed word is one undo step. */
const fieldKey = (scope: string, id: string, patch: object): string =>
  `${scope}:${id}:${Object.keys(patch).sort().join('+')}`;

export type GraphActions = Pick<
  CanvasState,
  | 'addNode'
  | 'onNodesChange'
  | 'onEdgesChange'
  | 'onConnect'
  | 'updateNode'
  | 'updateEdge'
  | 'removeElements'
  | 'removeSelected'
  | 'clear'
>;

/** Author edits to the diagram itself: blocks and connections added, moved, changed and removed. */
export const graphActions = ({ set, get, edits: { commit } }: ActionDeps): GraphActions => ({
  addNode(kind, position) {
    const { nodes, edges, readOnly, viewport } = get();
    if (readOnly) return null;
    const area = viewport?.area() ?? null;
    const placed: Placement =
      position === undefined
        ? placeBlock(nodes, area?.clear ?? null)
        : {
            position: dropPosition(position, area?.pane ?? null),
            size: NODE_MIN_FOOTPRINT,
            visible: true,
          };
    const node: SdNode = {
      id: nextId('n', nodes),
      type: 'sd',
      position: placed.position,
      selected: true,
      data: { kind, label: DEFAULT_NODE_LABELS[kind] },
    };
    commit({
      nodes: [...nodes.map(unselected), node],
      edges: edges.map(unselected),
      selectedId: node.id,
    });
    if (!placed.visible) viewport?.reveal({ ...placed.position, ...placed.size });
    return node;
  },

  onNodesChange(changes) {
    const { nodes, edges, selectedId, readOnly } = get();
    const permitted = readOnly ? changes.filter(isViewChange) : changes;
    if (permitted.length === 0) return;
    const next = applyNodeChanges<SdNode>(permitted, nodes);
    const patch = {
      nodes: next,
      selectedId: selectionAfter(permitted, selectedId, [...next, ...edges]),
    };
    const edits = permitted.filter((change) => !isViewChange(change));
    if (edits.length === 0) {
      set(patch);
      return;
    }
    // A drag reports every frame; it is one step, closed when the drag ends.
    const moves = edits.filter(
      (change): change is NodePositionChange => change.type === 'position',
    );
    const key =
      moves.length === edits.length
        ? `move:${moves
            .map((change) => change.id)
            .sort()
            .join('+')}`
        : null;
    commit(
      patch,
      key,
      moves.some((change) => change.dragging === false),
    );
  },

  onEdgesChange(changes) {
    const { nodes, edges, selectedId, readOnly } = get();
    const permitted = readOnly ? changes.filter(isViewChange) : changes;
    if (permitted.length === 0) return;
    const next = applyEdgeChanges<SdEdge>(permitted, edges);
    const patch = {
      edges: next,
      selectedId: selectionAfter(permitted, selectedId, [...nodes, ...next]),
    };
    if (permitted.every(isViewChange)) set(patch);
    else commit(patch);
  },

  onConnect(connection) {
    const { edges } = get();
    if (!connection.source || !connection.target) return;
    // Self-loops model nothing at this altitude; exact duplicates add noise.
    if (connection.source === connection.target) return;
    const duplicate = edges.some(
      (edge) => edge.source === connection.source && edge.target === connection.target,
    );
    if (duplicate) return;

    const edge: SdEdge = {
      id: nextId('e', edges),
      type: 'sd',
      source: connection.source,
      target: connection.target,
      data: { kind: 'sync' },
    };
    commit({ edges: [...edges, edge] });
  },

  updateNode(id, patch) {
    const { nodes } = get();
    if (!nodes.some((node) => node.id === id)) return;
    commit(
      {
        nodes: nodes.map((node) =>
          node.id === id ? { ...node, data: { ...node.data, ...patch } } : node,
        ),
      },
      fieldKey('node', id, patch),
    );
  },

  updateEdge(id, patch) {
    const { edges } = get();
    if (!edges.some((edge) => edge.id === id)) return;
    commit(
      {
        edges: edges.map((edge) =>
          edge.id === id
            ? {
                ...edge,
                ...(patch.label !== undefined ? { label: patch.label } : {}),
                data: {
                  kind: patch.kind ?? edge.data?.kind ?? 'sync',
                  // The rebuilt literal must pass carries through: a kind-only
                  // patch keeps the existing list, and `carries: []` clears it
                  // (serialization omits empty lists).
                  ...(patch.carries !== undefined
                    ? { carries: patch.carries }
                    : edge.data?.carries !== undefined
                      ? { carries: edge.data.carries }
                      : {}),
                  severity: edge.data?.severity ?? null,
                },
              }
            : edge,
        ),
      },
      fieldKey('edge', id, patch),
    );
  },

  removeElements({ nodeIds, edgeIds }) {
    const { nodes, edges, selectedId } = get();
    const goneNodes = new Set(nodeIds);
    const goneEdges = new Set(edgeIds);
    const keptNodes = nodes.filter((node) => !goneNodes.has(node.id));
    const keptEdges = edges.filter(
      (edge) =>
        !goneEdges.has(edge.id) && !goneNodes.has(edge.source) && !goneNodes.has(edge.target),
    );
    if (keptNodes.length === nodes.length && keptEdges.length === edges.length) return;
    const selectionGone =
      selectedId !== null &&
      !keptNodes.some((node) => node.id === selectedId) &&
      !keptEdges.some((edge) => edge.id === selectedId);
    commit({
      nodes: keptNodes,
      edges: keptEdges,
      ...(selectionGone ? { selectedId: null } : {}),
    });
  },

  removeSelected() {
    const { nodes, selectedId, removeElements } = get();
    if (selectedId === null) return;
    const isNode = nodes.some((node) => node.id === selectedId);
    removeElements(
      isNode ? { nodeIds: [selectedId], edgeIds: [] } : { nodeIds: [], edgeIds: [selectedId] },
    );
  },

  clear() {
    const { nodes, edges } = get();
    if (nodes.length === 0 && edges.length === 0) return;
    commit({ nodes: [], edges: [], selectedId: null, highlight: null });
  },
});
