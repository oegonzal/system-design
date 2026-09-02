'use client';

import type { Node } from '@xyflow/react';

/**
 * Render the whole diagram to a PDF blob, regardless of the current pan/zoom.
 *
 * The React-Flow "download image" recipe: frame every node with
 * `getNodesBounds` + `getViewportForBounds`, capture the `.react-flow__viewport`
 * (which holds only nodes + edges — the minimap, controls and background are
 * siblings, so they are excluded for free) at that computed transform via
 * `html-to-image`, then embed the PNG in a `jsPDF` sized to the graph.
 *
 * Everything is dynamically imported so these browser-only libs never touch the
 * server bundle. Returns null when there is nothing to draw.
 */
export async function diagramToPdfBlob(nodes: Node[]): Promise<Blob | null> {
  if (nodes.length === 0) return null;

  const viewport = document.querySelector<HTMLElement>('.react-flow__viewport');
  if (!viewport) return null;

  const [{ getNodesBounds, getViewportForBounds }, { toPng }, { jsPDF }] = await Promise.all([
    import('@xyflow/react'),
    import('html-to-image'),
    import('jspdf'),
  ]);

  const padding = 40;
  const bounds = getNodesBounds(nodes);
  const width = Math.max(Math.round(bounds.width) + padding * 2, 400);
  const height = Math.max(Math.round(bounds.height) + padding * 2, 300);
  const viewportTransform = getViewportForBounds(bounds, width, height, 0.2, 2, 0.1);

  const png = await toPng(viewport, {
    backgroundColor: '#ffffff',
    pixelRatio: 2,
    width,
    height,
    style: {
      width: `${width}px`,
      height: `${height}px`,
      transform: `translate(${viewportTransform.x}px, ${viewportTransform.y}px) scale(${viewportTransform.zoom})`,
    },
  });

  const pdf = new jsPDF({
    orientation: width >= height ? 'landscape' : 'portrait',
    unit: 'px',
    format: [width, height],
    compress: true,
  });
  pdf.addImage(png, 'PNG', 0, 0, width, height);
  return pdf.output('blob');
}
