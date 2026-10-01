'use client';

import type { Rect } from '@xyflow/react';

/** What it takes to draw the diagram onto a page, independent of the current pan and zoom. */
export interface DiagramCapture {
  /** React Flow's `.react-flow__viewport` — nodes, edges and pills; no minimap, controls or grid. */
  viewport: HTMLElement;
  /** The diagram's extent in flow coordinates, as the flow instance measures it. */
  bounds: Rect;
  /** The page behind the diagram: the surface it is drawn on, so the copy reads like the screen. */
  background: string;
}

/** Room around the diagram on the page. */
const PAGE_PADDING = 40;
/** The smallest page, so a single block is not printed on a postage stamp. */
const MIN_PAGE = { width: 400, height: 300 };
/** Pixels per page unit in the embedded image, for a crisp print. */
const PIXEL_RATIO = 2;

/**
 * Render the whole diagram to a PDF blob, regardless of the current pan/zoom.
 *
 * The React-Flow "download image" recipe: frame the bounds with
 * `getViewportForBounds`, capture the viewport at that computed transform via
 * `html-to-image`, then embed the PNG in a `jsPDF` sized to the graph. What
 * is captured is what the elements carry inline — which is why an edge's
 * stroke is inline style rather than a stylesheet rule.
 *
 * Everything is dynamically imported so these browser-only libs never touch the
 * server bundle. Returns null when there is nothing to draw.
 */
export async function diagramToPdfBlob({
  viewport,
  bounds,
  background,
}: DiagramCapture): Promise<Blob | null> {
  if (bounds.width === 0 || bounds.height === 0) return null;

  const [{ getViewportForBounds }, { toPng }, { jsPDF }] = await Promise.all([
    import('@xyflow/react'),
    import('html-to-image'),
    import('jspdf'),
  ]);

  const width = Math.max(Math.round(bounds.width) + PAGE_PADDING * 2, MIN_PAGE.width);
  const height = Math.max(Math.round(bounds.height) + PAGE_PADDING * 2, MIN_PAGE.height);
  const viewportTransform = getViewportForBounds(bounds, width, height, 0.2, 2, 0.1);

  const png = await toPng(viewport, {
    backgroundColor: background,
    pixelRatio: PIXEL_RATIO,
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
