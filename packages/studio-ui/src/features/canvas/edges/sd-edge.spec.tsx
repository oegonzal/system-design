import { DEFAULT_APPEARANCE_SETTINGS } from '@sysdesign/contracts';
import { createTheme } from '@sysdesign/design-system';
import { installDomShims, renderWithTheme } from '@sysdesign/web-testing';
import { Position, ReactFlow } from '@xyflow/react';
import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { overlaps, type Box, type Size } from '../geometry';
import { SdNode } from '../nodes/sd-node';
import type { SdEdge as SdEdgeModel, SdNode as SdNodeModel } from '../types';
import { edgeStroke, SdEdge } from './sd-edge';

const nodeTypes = { sd: SdNode };
const edgeTypes = { sd: SdEdge };

const BLOCK: Size = { width: 160, height: 48 };

/**
 * Explicit width/height make the nodes "measured" without a layout engine —
 * the same server-rendering affordance React Flow documents — so the edge
 * actually renders under jsdom; `measured` is what React Flow would have
 * written back after measuring them.
 */
function plainNode(id: string, y: number): SdNodeModel {
  return {
    id,
    type: 'sd',
    position: { x: 0, y },
    ...BLOCK,
    measured: BLOCK,
    handles: [
      { type: 'source', position: Position.Bottom, x: 80, y: 48, width: 6, height: 6 },
      { type: 'target', position: Position.Top, x: 80, y: 0, width: 6, height: 6 },
    ],
    data: { kind: 'service', label: id },
  };
}

function renderEdge(
  edge: Partial<SdEdgeModel>,
  nodes: SdNodeModel[] = [plainNode('n-1', 0), plainNode('n-2', 200)],
) {
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
      <ReactFlow nodes={nodes} edges={[full]} nodeTypes={nodeTypes} edgeTypes={edgeTypes} />
    </div>,
  );
}

/** jsdom lays nothing out: give the pill a size, and leave everything else the shims' pane-sized default. */
function layOutPills(size: Size) {
  const sizeOf = (element: HTMLElement, pill: number, other: number) =>
    element.dataset['testid']?.startsWith('edge-pill-') ? pill : other;
  Object.defineProperties(HTMLElement.prototype, {
    offsetWidth: {
      configurable: true,
      get(this: HTMLElement) {
        return sizeOf(this, size.width, 800);
      },
    },
    offsetHeight: {
      configurable: true,
      get(this: HTMLElement) {
        return sizeOf(this, size.height, 600);
      },
    },
  });
}

/** The pill's box in flow coordinates, read back from the inline transform it is placed by. */
function pillBox(pill: HTMLElement, size: Size): Box {
  const [x, y] = [...pill.style.transform.matchAll(/(-?[\d.]+)px/g)].map((match) =>
    Number(match[1]),
  );
  if (x === undefined || y === undefined) throw new Error(`no position in ${pill.style.transform}`);
  return { x: x - size.width / 2, y: y - size.height / 2, ...size };
}

afterEach(() => {
  installDomShims();
});

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

  it('[UX-10] keeps its pill off a block lying across the middle of the line, placed inline so a copy of the diagram (the PDF) keeps it there', async () => {
    const pillSize = { width: 60, height: 20 };
    layOutPills(pillSize);
    // Client → DNS, with the CDN block sitting across the connection's midpoint.
    const between = plainNode('n-3', 140);
    const nodes = [plainNode('n-1', 0), between, plainNode('n-2', 300)];

    renderEdge({ label: 'resolve' }, nodes);

    const pill = await screen.findByTestId('edge-pill-e-1');
    const box = pillBox(pill, pillSize);
    const blocks = nodes.map((node) => ({ ...node.position, ...BLOCK }));
    expect(blocks.some((block) => overlaps(box, block))).toBe(false);
    // The nearest clear stretch of the line: just past the block, on the side the midpoint was nearer.
    const blockBottom = between.position.y + BLOCK.height;
    expect(box.y).toBeGreaterThanOrEqual(blockBottom);
    expect(box.y - blockBottom).toBeLessThan(pillSize.height / 2);
  });

  it('leaves the pill in the middle of the line when no block is under it', async () => {
    const pillSize = { width: 60, height: 20 };
    layOutPills(pillSize);

    renderEdge({ label: 'writes' });

    const pill = await screen.findByTestId('edge-pill-e-1');
    const box = pillBox(pill, pillSize);
    // Halfway down the gap between n-1 (ending at y 48) and n-2 (starting at y 200), to within a handle.
    expect(box.y + box.height / 2).toBeCloseTo((BLOCK.height + 200) / 2, -1);
  });

  it('[UX-10] carries its stroke inline on the path, so a copy of the diagram (the PDF) draws it', async () => {
    renderEdge({});

    const edge = await screen.findByTestId('edge-e-1');
    const path = edge.querySelector<SVGPathElement>('path.react-flow__edge-path');
    expect(path?.style.stroke).not.toBe('');
    expect(path?.style.strokeWidth).not.toBe('');
  });

  it('[UX-3] dashes an async call inline and keeps a sync one solid', async () => {
    renderEdge({ data: { kind: 'async' } });

    const edge = await screen.findByTestId('edge-e-1');
    const path = edge.querySelector<SVGPathElement>('path.react-flow__edge-path');
    expect(path?.style.strokeDasharray).toBe('7 5');
  });

  it('strokes by severity over selection over rest', () => {
    const theme = createTheme(DEFAULT_APPEARANCE_SETTINGS);
    const rest = edgeStroke(theme, { kind: 'sync', severity: null, selected: false });
    const selected = edgeStroke(theme, { kind: 'sync', severity: null, selected: true });
    const flagged = edgeStroke(theme, { kind: 'sync', severity: 'high', selected: true });

    expect(rest.stroke).toBe(theme.color.border.default);
    expect(rest).not.toHaveProperty('strokeDasharray');
    expect(selected.stroke).toBe(theme.color.border.focus);
    expect(flagged.stroke).toBe(theme.color.severity.high.fg);
  });

  it('stamps the call style as data-kind', async () => {
    renderEdge({ data: { kind: 'async', carries: ['OrderPlaced'] } });

    const edge = await screen.findByTestId('edge-e-1');
    expect(edge.getAttribute('data-kind')).toBe('async');
    expect(screen.getByText('OrderPlaced')).toBeTruthy();
  });
});
