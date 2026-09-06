import { renderWithTheme } from '@sysdesign/web-testing';
import { Position, ReactFlow } from '@xyflow/react';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SdNode } from '../nodes/sd-node';
import type { SdEdge as SdEdgeModel, SdNode as SdNodeModel } from '../types';
import { SdEdge } from './sd-edge';

const nodeTypes = { sd: SdNode };
const edgeTypes = { sd: SdEdge };

/**
 * Explicit width/height make the nodes "measured" without a layout engine —
 * the same server-rendering affordance React Flow documents — so the edge
 * actually renders under jsdom.
 */
function plainNode(id: string, y: number): SdNodeModel {
  return {
    id,
    type: 'sd',
    position: { x: 0, y },
    width: 160,
    height: 48,
    handles: [
      { type: 'source', position: Position.Bottom, x: 80, y: 48, width: 6, height: 6 },
      { type: 'target', position: Position.Top, x: 80, y: 0, width: 6, height: 6 },
    ],
    data: { kind: 'service', label: id },
  };
}

function renderEdge(edge: Partial<SdEdgeModel>) {
  const full: SdEdgeModel = {
    id: 'e-1',
    type: 'sd',
    source: 'n-1',
    target: 'n-2',
    data: { kind: 'sync' },
    ...edge,
  };
  renderWithTheme(
    <div style={{ width: 800, height: 600 }}>
      <ReactFlow
        nodes={[plainNode('n-1', 0), plainNode('n-2', 200)]}
        edges={[full]}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
      />
    </div>,
  );
}

describe('SdEdge', () => {
  it('renders the label pill when no operations are carried — old graphs unchanged', async () => {
    renderEdge({ label: 'writes' });

    await screen.findByTestId('edge-e-1');
    expect(screen.getByText('writes')).toBeTruthy();
  });

  it('shows carried operations in the pill — the declaration outranks the prose label', async () => {
    renderEdge({ label: 'calls', data: { kind: 'sync', carries: ['placeOrder', 'getOrder'] } });

    await screen.findByTestId('edge-e-1');
    expect(screen.getByText('placeOrder · getOrder')).toBeTruthy();
    expect(screen.queryByText('calls')).toBeNull();
  });

  it('elides beyond three carries with a +N overflow marker', async () => {
    renderEdge({
      data: { kind: 'sync', carries: ['a', 'b', 'c', 'd', 'e'] },
    });

    await screen.findByTestId('edge-e-1');
    expect(screen.getByText('a · b · c +2')).toBeTruthy();
  });

  it('renders no pill at all without carries or label', async () => {
    renderEdge({});

    const edge = await screen.findByTestId('edge-e-1');
    expect(edge.querySelector('path')).toBeTruthy();
    expect(document.querySelector('.react-flow__edgelabel-renderer')?.textContent ?? '').toBe('');
  });

  it('stamps the call style as data-kind', async () => {
    renderEdge({ data: { kind: 'async', carries: ['OrderPlaced'] } });

    const edge = await screen.findByTestId('edge-e-1');
    expect(edge.getAttribute('data-kind')).toBe('async');
    expect(screen.getByText('OrderPlaced')).toBeTruthy();
  });
});
