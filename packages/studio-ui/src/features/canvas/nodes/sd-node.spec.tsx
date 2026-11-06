import { renderWithTheme } from '@sysdesign/web-testing';
import { ReactFlow } from '@xyflow/react';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

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

  it('[UX-34] stamps that it is on the shown path, undimmed', async () => {
    renderNode({ kind: 'service', label: 'On', onPath: true });

    const root = await screen.findByTestId('node-n-1');
    expect(root.getAttribute('data-on-path')).toBe('true');
    expect(root.style.opacity).toBe('');
  });

  it('[UX-34] dims itself inline when a path is shown and it is off it', async () => {
    renderNode({ kind: 'service', label: 'Off', onPath: false });

    const root = await screen.findByTestId('node-n-1');
    expect(root.getAttribute('data-on-path')).toBe('false');
    expect(root.style.opacity).toBe('0.35');
  });

  it('[UX-31] names the platform service a block is before its role, and stamps it as data', async () => {
    renderNode({ kind: 'queue', service: 'aws.sqs', label: 'Order events' });
    const root = await screen.findByTestId('node-n-1');
    expect(root.getAttribute('data-kind')).toBe('queue');
    expect(root.getAttribute('data-service')).toBe('aws.sqs');
    expect(root.textContent).toContain('SQS · queue');
  });

  it('shows the config entry count', async () => {
    renderNode({
      kind: 'cache',
      label: 'Hot Cache',
      config: [
        { key: 'strategy', value: 'cache-aside' },
        { key: 'ttlSeconds', value: 60 },
      ],
    });

    const root = await screen.findByTestId('node-n-1');
    expect(root.textContent).toContain('cache · 2 config');
  });

  it('summarizes what any node declares: ops, then roles, config last', async () => {
    renderNode({
      kind: 'service',
      label: 'Order Service',
      operations: [
        { name: 'placeOrder', kind: 'command' },
        { name: 'getOrder', kind: 'query' },
      ],
      responsibilities: ['owns orders'],
      config: [{ key: 'replicas', value: 3 }],
    });

    const root = await screen.findByTestId('node-n-1');
    expect(root.textContent).toContain('service · 2 ops · 1 roles · 1 config');
    expect(root.getAttribute('data-op-count')).toBe('2');
  });

  it('counts a queue’s declared event the same way — no kind decides what may declare', async () => {
    renderNode({
      kind: 'queue',
      label: 'Order Queue',
      operations: [{ name: 'OrderPlaced', kind: 'event' }],
    });

    const root = await screen.findByTestId('node-n-1');
    expect(root.textContent).toContain('queue · 1 ops');
  });
});
