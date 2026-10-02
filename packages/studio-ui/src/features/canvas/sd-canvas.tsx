'use client';

import '@xyflow/react/dist/style.css';

import { useTheme } from '@emotion/react';
import styled from '@emotion/styled';
import { NODE_KINDS, type NodeKind } from '@sysdesign/contracts';
import {
  Background,
  BackgroundVariant,
  ControlButton,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  useReactFlow,
  useStoreApi,
  type OnBeforeDelete,
} from '@xyflow/react';
import { useCallback, useEffect, type DragEvent } from 'react';

import { useCanvasStore } from './canvas-store-context';
import { SdEdge } from './edges/sd-edge';
import { flowVariableDeclarations } from './flow-theme';
import { FIT_ZOOM, MINIMAP_SIZE, revealShift, viewArea } from './framing';
import { SdNode } from './nodes/sd-node';
import { NODE_DRAG_MIME } from './palette/palette';
import type { SdEdge as SdEdgeModel, SdNode as SdNodeModel } from './types';
import { useCanvasShortcuts } from './use-canvas-shortcuts';
import { useFitRequests } from './use-fit-requests';

/**
 * Module scope, and it matters: a nodeTypes object recreated per render makes
 * React Flow remount every node on every render — its best-known footgun.
 */
const nodeTypes = { sd: SdNode };
const edgeTypes = { sd: SdEdge };

const defaultEdgeOptions = {
  type: 'sd' as const,
  markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
};

const deleteKeyCodes = ['Backspace', 'Delete'];

/** The frame-the-diagram glyph, drawn as React Flow's own controls are: the four corners of a frame. */
const FIT_ICON = (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 30" aria-hidden focusable="false">
    <path d="M3.692 4.63c0-.53.4-.938.939-.938h5.215V0H4.708C2.13 0 0 2.054 0 4.63v5.216h3.692V4.631zM27.354 0h-5.2v3.692h5.17c.53 0 .984.4.984.939v5.215H32V4.631A4.624 4.624 0 0027.354 0zm.954 24.83c0 .532-.4.94-.939.94h-5.215v3.768h5.215c2.577 0 4.631-2.13 4.631-4.707v-5.139h-3.692v5.139zm-23.677.94c-.531 0-.939-.4-.939-.94v-5.138H0v5.139c0 2.577 2.13 4.707 4.708 4.707h5.138V25.77H4.631z" />
  </svg>
);

/** The canvas's frame; React Flow's chrome inside it is painted from the theme (`flowVariables`). */
const CanvasFrame = styled.div`
  width: 100%;
  height: 100%;
  min-height: 320px;
  border: 1px solid ${({ theme }) => theme.color.border.subtle};
  border-radius: ${({ theme }) => theme.radius.lg};
  overflow: hidden;
  background: ${({ theme }) => theme.color.bg.surface};

  ${({ theme }) => flowVariableDeclarations(theme)}

  .react-flow__controls,
  .react-flow__minimap {
    border: 1px solid ${({ theme }) => theme.color.border.subtle};
    border-radius: ${({ theme }) => theme.radius.md};
    overflow: hidden;
  }

  /* A connection's pill keeps clear of the blocks wherever its line has the
     room (\`pillPoint\`); where it has none the pill is drawn above them, so it
     is still read — on screen and in the exported PDF. A block being dragged
     or selected (React Flow lifts it) still passes over it. */
  .react-flow__edgelabel-renderer {
    z-index: 1;
  }
`;

/**
 * The React Flow wiring. All graph state lives in the canvas store — its
 * `readOnly` flag included, which the page sets — and this component
 * translates between DOM events and store actions, honours the store's fit
 * requests, and lends the store its view of the screen.
 */
export function SdCanvas() {
  const theme = useTheme();
  const nodes = useCanvasStore((state) => state.nodes);
  const edges = useCanvasStore((state) => state.edges);
  const readOnly = useCanvasStore((state) => state.readOnly);
  const onNodesChange = useCanvasStore((state) => state.onNodesChange);
  const onEdgesChange = useCanvasStore((state) => state.onEdgesChange);
  const onConnect = useCanvasStore((state) => state.onConnect);
  const addNode = useCanvasStore((state) => state.addNode);
  const removeElements = useCanvasStore((state) => state.removeElements);
  const select = useCanvasStore((state) => state.select);
  const inspect = useCanvasStore((state) => state.inspect);
  const clearHighlight = useCanvasStore((state) => state.clearHighlight);
  const attachViewport = useCanvasStore((state) => state.attachViewport);
  const requestFit = useCanvasStore((state) => state.requestFit);
  const { screenToFlowPosition, setViewport } = useReactFlow();
  const flow = useStoreApi<SdNodeModel, SdEdgeModel>();
  useCanvasShortcuts();
  useFitRequests();

  // The store asks what the author can see when it places a block, and has
  // the view moved when the only free place was out of sight.
  useEffect(() => {
    const area = () => {
      const { width, height, transform } = flow.getState();
      return viewArea({ width, height }, transform);
    };
    attachViewport({
      area,
      reveal(box) {
        const visible = area();
        if (visible === null) return;
        const shift = revealShift(box, visible.clear);
        if (shift.x === 0 && shift.y === 0) return;
        const [x, y, zoom] = flow.getState().transform;
        void setViewport({ x: x - shift.x * zoom, y: y - shift.y * zoom, zoom });
      },
    });
    return () => attachViewport(null);
  }, [attachViewport, flow, setViewport]);

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (readOnly) return;
      const kind = event.dataTransfer.getData(NODE_DRAG_MIME);
      if (!(NODE_KINDS as readonly string[]).includes(kind)) return;
      addNode(kind as NodeKind, screenToFlowPosition({ x: event.clientX, y: event.clientY }));
    },
    [addNode, readOnly, screenToFlowPosition],
  );

  const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const handlePaneClick = useCallback(() => {
    select(null);
    clearHighlight();
  }, [select, clearHighlight]);

  // Selection is React Flow's: a click, a modifier-click that adds to or
  // takes from the selection, a key, a drag all reach the store as its own
  // `select` changes, and `selectedId` follows them. A click handler that
  // selected would undo a multi-selection the moment it was made; a click
  // only tells the panel which of the selected elements to edit.
  const handleNodeClick = useCallback(
    (_event: unknown, node: SdNodeModel) => inspect(node.id),
    [inspect],
  );
  const handleEdgeClick = useCallback(
    (_event: unknown, edge: SdEdgeModel) => inspect(edge.id),
    [inspect],
  );

  // React Flow reports a delete as separate edge and node changes; taking it
  // here makes the whole gesture one store edit, so one undo puts it back.
  const handleBeforeDelete = useCallback<OnBeforeDelete<SdNodeModel, SdEdgeModel>>(
    async ({ nodes: doomedNodes, edges: doomedEdges }) => {
      removeElements({
        nodeIds: doomedNodes.map((node) => node.id),
        edgeIds: doomedEdges.map((edge) => edge.id),
      });
      return false;
    },
    [removeElements],
  );

  const minimapNodeColor = useCallback(
    (node: SdNodeModel) => theme.color.nodeKind[node.data.kind],
    [theme],
  );

  return (
    <CanvasFrame data-testid="sd-canvas">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        colorMode={theme.mode}
        // The floor every fit frames at, so the zoom-out control stops where a fit does.
        minZoom={FIT_ZOOM.min}
        defaultMarkerColor={theme.color.border.default}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={handleNodeClick}
        onEdgeClick={handleEdgeClick}
        onPaneClick={handlePaneClick}
        onBeforeDelete={handleBeforeDelete}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        nodesFocusable
        edgesFocusable
        nodesDraggable={!readOnly}
        nodesConnectable={!readOnly}
        deleteKeyCode={readOnly ? null : deleteKeyCodes}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
        {/* Fit is the store's request, like the toolbar's: one way to frame the diagram. */}
        <Controls showInteractive={false} showFitView={false}>
          <ControlButton
            className="react-flow__controls-fitview"
            onClick={requestFit}
            title="Fit view"
            aria-label="Fit view"
          >
            {FIT_ICON}
          </ControlButton>
        </Controls>
        <MiniMap<SdNodeModel> pannable style={MINIMAP_SIZE} nodeColor={minimapNodeColor} />
      </ReactFlow>
    </CanvasFrame>
  );
}
