'use client';

import '@xyflow/react/dist/style.css';

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
} from '@xyflow/react';
import { useCallback, type DragEvent } from 'react';

import { useCanvasStore } from './canvas-store-context';
import { SdEdge } from './edges/sd-edge';
import { SdNode } from './nodes/sd-node';
import { NODE_DRAG_MIME } from './palette/palette';

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

const CanvasFrame = styled.div`
  width: 100%;
  height: 100%;
  min-height: 320px;
  border: 1px solid ${({ theme }) => theme.color.border.subtle};
  border-radius: ${({ theme }) => theme.radius.lg};
  overflow: hidden;
  background: ${({ theme }) => theme.color.bg.surface};

  .react-flow__attribution {
    /* Attribution stays (free tier); just keep it readable on our surface. */
    background: transparent;
  }
`;

export interface SdCanvasProps {
  /** Viewing an old revision: no dragging, connecting or deleting. */
  readOnly?: boolean;
}

/**
 * The React Flow wiring. All graph state lives in the canvas store; this
 * component translates between DOM events and store actions and nothing else.
 */
export function SdCanvas({ readOnly = false }: SdCanvasProps) {
  const nodes = useCanvasStore((state) => state.nodes);
  const edges = useCanvasStore((state) => state.edges);
  const onNodesChange = useCanvasStore((state) => state.onNodesChange);
  const onEdgesChange = useCanvasStore((state) => state.onEdgesChange);
  const onConnect = useCanvasStore((state) => state.onConnect);
  const addNode = useCanvasStore((state) => state.addNode);
  const select = useCanvasStore((state) => state.select);
  const { screenToFlowPosition } = useReactFlow();

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

  return (
    <CanvasFrame data-testid="sd-canvas">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={(_event, node) => select(node.id)}
        onEdgeClick={(_event, edge) => select(edge.id)}
        onPaneClick={() => select(null)}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        nodesFocusable
        edgesFocusable
        nodesDraggable={!readOnly}
        nodesConnectable={!readOnly}
        deleteKeyCode={readOnly ? null : deleteKeyCodes}
        fitView
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
        <Controls showInteractive={false} />
        <MiniMap pannable style={{ width: 140, height: 96 }} />
      </ReactFlow>
    </CanvasFrame>
  );
}
