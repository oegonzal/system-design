import { ReactFlow } from '@xyflow/react';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderWithTheme } from '../../../testing/render';
import type { SdNode as SdNodeModel } from '../types';
import { SdNode } from './sd-node';

const nodeTypes = { sd: SdNode };

function renderNode(data: SdNodeModel['data']) {
  const node: SdNodeModel = {
    id: 'n-1',
    type: 'sd',
    position: { x: 0, y: 0 },
    data,
  };
  renderWithTheme(
    <div style={{ width: 800, height: 600 }}>
      <ReactFlow nodes={[node]} edges={[]} nodeTypes={nodeTypes} />
    </div>,
  );
}

describe('SdNode', () => {
  it('renders the label and stamps data-kind', async () => {
    renderNode({ kind: 'database', label: 'Orders DB' });

    const root = await screen.findByTestId('node-n-1');
    expect(root.getAttribute('data-kind')).toBe('database');
    expect(root.textContent).toContain('Orders DB');
  });

  it('exposes the highlight severity as a data attribute', async () => {
    renderNode({ kind: 'queue', label: 'Jobs', severity: 'critical' });

    const root = await screen.findByTestId('node-n-1');
    expect(root.getAttribute('data-severity')).toBe('critical');
  });

  it('marks ghost nodes and shows the config knob count', async () => {
    renderNode({
      kind: 'cache',
      label: 'Hot Cache',
      ghost: true,
      config: { strategy: 'cache-aside', ttlSeconds: 60 },
    });

    const root = await screen.findByTestId('node-n-1');
    expect(root.getAttribute('data-ghost')).toBe('true');
    expect(root.textContent).toContain('2 knobs');
  });

  it('summarizes a service’s declared interface: ops, then roles, knobs last', async () => {
    renderNode({
      kind: 'service',
      label: 'Order Service',
      operations: [
        { name: 'placeOrder', kind: 'command' },
        { name: 'getOrder', kind: 'query' },
      ],
      responsibilities: ['owns orders'],
      config: { replicas: 3 },
    });

    const root = await screen.findByTestId('node-n-1');
    expect(root.textContent).toContain('service · 2 ops · 1 roles · 1 knob');
    expect(root.getAttribute('data-op-count')).toBe('2');
  });

  it('counts a channel’s operations as types', async () => {
    renderNode({
      kind: 'queue',
      label: 'Order Queue',
      operations: [{ name: 'OrderPlaced', kind: 'event' }],
    });

    const root = await screen.findByTestId('node-n-1');
    expect(root.textContent).toContain('queue · 1 types');
  });

  it('never counts ops on a role that declares none, even with stale data', async () => {
    renderNode({
      kind: 'database',
      label: 'Orders DB',
      // Leftover from before the node was re-shelved to storage.
      operations: [{ name: 'placeOrder', kind: 'command' }],
    });

    const root = await screen.findByTestId('node-n-1');
    expect(root.textContent).not.toContain('ops');
    expect(root.textContent).not.toContain('types');
  });
});
