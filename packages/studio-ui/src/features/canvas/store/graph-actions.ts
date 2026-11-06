import { DEFAULT_NODE_LABELS } from '@sysdesign/contracts';
import { applyEdgeChanges, applyNodeChanges, type NodePositionChange } from '@xyflow/react';

import { NODE_MIN_FOOTPRINT } from '../geometry';
import { markersFor } from '../edges/edge-markers';
import { dropPosition, placeBlock, type Placement } from '../placement';
import { isNodeKind, serviceOf, type PaletteBlock } from '../platform-services';
import type { SdEdge, SdNode } from '../types';
import { isViewChange, nextId, selectionAfter, unselected } from './elements';
import type { ActionDeps } from './history';
import { patchedNodeData } from './node-patch';
import type { CanvasState } from './state';

/** A role adds a block of that kind under the kind's name; a platform service adds a block of its first role, named after it and carrying it. */
function blockData(block: PaletteBlock): SdNode['data'] {
  if (isNodeKind(block)) return { kind: block, label: DEFAULT_NODE_LABELS[block] };
  const service = serviceOf(block);
  return { kind: service.roles[0], service: block, label: service.label };
}

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
  addNode(block, position) {
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
      data: blockData(block),
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
    // Self-loops model nothing at this altitude; a second connection saying the
    // same thing adds noise. A new connection is a sync call, so one sync call
    // already drawn between the two is the duplicate — an async one beside it
    // is a different hop, and the pair fans out on the canvas.
    if (connection.source === connection.target) return;
    const duplicate = edges.some(
      (edge) =>
        edge.source === connection.source &&
        edge.target === connection.target &&
        (edge.data?.kind ?? 'sync') === 'sync',
    );
    if (duplicate) return;

    const edge: SdEdge = {
      id: nextId('e', edges),
      type: 'sd',
      source: connection.source,
      target: connection.target,
      ...markersFor('sync'),
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
          node.id === id ? { ...node, data: patchedNodeData(node.data, patch) } : node,
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
        edges: edges.map((edge) => {
          if (edge.id !== id) return edge;
          const kind = patch.kind ?? edge.data?.kind ?? 'sync';
          // A new kind redraws the arrowheads: the old reply marker goes
          // before the kind's own set is spread, so an async hop keeps none.
          const { markerStart: _previous, ...kept } = edge;
          return {
            ...(patch.kind !== undefined ? { ...kept, ...markersFor(kind) } : edge),
            ...(patch.label !== undefined ? { label: patch.label } : {}),
            // Spread, never rebuilt: a kind-only patch keeps the carries
            // and the config as they were, and an empty list clears its own
            // field (serialization omits empty lists).
            data: {
              ...edge.data,
              kind,
              ...(patch.carries !== undefined ? { carries: patch.carries } : {}),
              ...(patch.config !== undefined ? { config: patch.config } : {}),
            },
          };
        }),
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
    commit({ nodes: [], edges: [], selectedId: null, highlight: null, focus: null });
  },
});
