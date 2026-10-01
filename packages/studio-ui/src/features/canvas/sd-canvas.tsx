'use client';

import '@xyflow/react/dist/style.css';

import { useTheme } from '@emotion/react';
import styled from '@emotion/styled';
import { NODE_KINDS, type NodeKind } from '@sysdesign/contracts';
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  useReactFlow,
  useStoreApi,
  type FitViewOptions,
  type OnBeforeDelete,
} from '@xyflow/react';
import { useCallback, useEffect, useRef, type DragEvent } from 'react';

import { useCanvasStore } from './canvas-store-context';
import { SdEdge } from './edges/sd-edge';
import { SdNode } from './nodes/sd-node';
import { NODE_DRAG_MIME } from './palette/palette';
import type { SdEdge as SdEdgeModel, SdNode as SdNodeModel } from './types';
import { useCanvasShortcuts } from './use-canvas-shortcuts';

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

/** The minimap's size — drawn at this, and kept clear by every fit. */
const MINIMAP_SIZE = { width: 140, height: 96 };
/** The margin React Flow's stylesheet puts around each panel (`.react-flow__panel`). */
const PANEL_MARGIN = 15;
/** Room between a framed diagram and the frame's edge. */
const FIT_MARGIN = 24;

/**
 * How every fit frames the diagram — on load, from the toolbar, from the
 * zoom controls. Never past 100%, so a lone block is not blown up to fill
 * the frame; and the bottom band the minimap and the zoom controls sit in is
 * kept clear, so no block lands under them.
 */
const FIT_VIEW_OPTIONS: FitViewOptions = {
  maxZoom: 1,
  padding: {
    top: `${FIT_MARGIN}px`,
    left: `${FIT_MARGIN}px`,
    right: `${FIT_MARGIN}px`,
    bottom: `${MINIMAP_SIZE.height + PANEL_MARGIN + FIT_MARGIN}px`,
  },
};

/**
 * React Flow's chrome is painted from the theme in either mode: these are the
 * variables its stylesheet reads, so the controls, minimap, handles,
 * connection line and arrowheads follow the design tokens rather than its
 * own light palette (or its dark one, which `colorMode` would otherwise pick).
 */
const CanvasFrame = styled.div`
  width: 100%;
  height: 100%;
  min-height: 320px;
  border: 1px solid ${({ theme }) => theme.color.border.subtle};
  border-radius: ${({ theme }) => theme.radius.lg};
  overflow: hidden;
  background: ${({ theme }) => theme.color.bg.surface};

  --xy-background-pattern-color: ${({ theme }) => theme.color.border.default};
  --xy-edge-stroke: ${({ theme }) => theme.color.border.default};
  --xy-edge-stroke-selected: ${({ theme }) => theme.color.border.focus};
  --xy-connectionline-stroke: ${({ theme }) => theme.color.border.focus};
  --xy-handle-background-color: ${({ theme }) => theme.color.border.default};
  --xy-handle-border-color: ${({ theme }) => theme.color.bg.surface};
  --xy-controls-button-background-color: ${({ theme }) => theme.color.bg.surface};
  --xy-controls-button-background-color-hover: ${({ theme }) => theme.color.bg.subtle};
  --xy-controls-button-color: ${({ theme }) => theme.color.text.secondary};
  --xy-controls-button-color-hover: ${({ theme }) => theme.color.text.primary};
  --xy-controls-button-border-color: ${({ theme }) => theme.color.border.subtle};
  --xy-controls-box-shadow: ${({ theme }) => theme.shadow.sm};
  --xy-minimap-background-color: ${({ theme }) => theme.color.bg.surface};
  /* Translucent, so the blocks outside the visible area still show through. */
  --xy-minimap-mask-background-color: color-mix(
    in srgb,
    ${({ theme }) => theme.color.bg.subtle} 70%,
    transparent
  );
  --xy-minimap-mask-stroke-color: ${({ theme }) => theme.color.border.default};
  /* Attribution stays (free tier); just keep it readable on our surface. */
  /* Attribution stays (free tier); just keep it readable on our surface. */
  --xy-attribution-background-color: transparent;

  .react-flow__controls,
  .react-flow__minimap {
    border: 1px solid ${({ theme }) => theme.color.border.subtle};
    border-radius: ${({ theme }) => theme.radius.md};
    overflow: hidden;
  }

  /* A connection's pill is drawn above the blocks, so one whose midpoint falls
     under a block is still read — on screen and in the exported PDF. A block
     being dragged or selected (React Flow lifts it) still passes over it. */
  .react-flow__edgelabel-renderer {
    z-index: 1;
  }
`;

export interface SdCanvasProps {
  /**
   * @deprecated The canvas store's `readOnly` is the source of truth — set it
   * with `setReadOnly`. While a caller still passes this, it is forwarded to
   * the store, so the palette and properties lock with the canvas; left
   * undefined, it does nothing.
   */
  readOnly?: boolean;
}

/**
 * The React Flow wiring. All graph state lives in the canvas store; this
 * component translates between DOM events and store actions, honours the
 * store's fit requests, and lends the store its view of the screen.
 */
export function SdCanvas({ readOnly: readOnlyProp }: SdCanvasProps) {
  const theme = useTheme();
  const nodes = useCanvasStore((state) => state.nodes);
  const edges = useCanvasStore((state) => state.edges);
  const readOnly = useCanvasStore((state) => state.readOnly) || readOnlyProp === true;
  const setReadOnly = useCanvasStore((state) => state.setReadOnly);
  const fitRequest = useCanvasStore((state) => state.fitRequest);
  const onNodesChange = useCanvasStore((state) => state.onNodesChange);
  const onEdgesChange = useCanvasStore((state) => state.onEdgesChange);
  const onConnect = useCanvasStore((state) => state.onConnect);
  const addNode = useCanvasStore((state) => state.addNode);
  const removeElements = useCanvasStore((state) => state.removeElements);
  const select = useCanvasStore((state) => state.select);
  const clearHighlight = useCanvasStore((state) => state.clearHighlight);
  const attachViewport = useCanvasStore((state) => state.attachViewport);
  const { screenToFlowPosition, fitView } = useReactFlow();
  const flow = useStoreApi<SdNodeModel, SdEdgeModel>();
  useCanvasShortcuts();

  useEffect(() => {
    if (readOnlyProp !== undefined) setReadOnly(readOnlyProp);
  }, [readOnlyProp, setReadOnly]);

  // The store asks where the author is looking when it places a block.
  useEffect(() => {
    attachViewport({
      centre() {
        const {
          width,
          height,
          transform: [x, y, zoom],
        } = flow.getState();
        if (width === 0 || height === 0) return null;
        return { x: (width / 2 - x) / zoom, y: (height / 2 - y) / zoom };
      },
    });
    return () => attachViewport(null);
  }, [attachViewport, flow]);

  // Each fit request is honoured once — including one made before the canvas
  // mounted (a load). React Flow holds the fit until the blocks are measured.
  const honouredFit = useRef(0);
  useEffect(() => {
    if (fitRequest === honouredFit.current) return;
    honouredFit.current = fitRequest;
    void fitView(FIT_VIEW_OPTIONS);
  }, [fitRequest, fitView]);

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
        defaultMarkerColor={theme.color.border.default}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={(_event, node) => select(node.id)}
        onEdgeClick={(_event, edge) => select(edge.id)}
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
        <Controls showInteractive={false} fitViewOptions={FIT_VIEW_OPTIONS} />
        <MiniMap<SdNodeModel> pannable style={MINIMAP_SIZE} nodeColor={minimapNodeColor} />
      </ReactFlow>
    </CanvasFrame>
  );
}
