import type { EdgeKind } from '@sysdesign/contracts';
import { MarkerType, type EdgeMarker } from '@xyflow/react';

/** The request's arrowhead, at the target: a closed arrow. */
const REQUEST: EdgeMarker = { type: MarkerType.ArrowClosed, width: 16, height: 16 };
/** The reply's arrowhead, at the source: an open arrow, oriented back along the line. */
const REPLY: EdgeMarker = { type: MarkerType.Arrow, width: 16, height: 16 };

/**
 * The arrowheads a connection is drawn with, by what it means: a sync call is
 * a request and its reply, so it points both ways; an async hop is one message
 * one way. Marker definitions come from the edge object alone (React Flow
 * collects them from `edge.markerStart` / `edge.markerEnd`), so this is spread
 * wherever an edge object is built or its kind changes — never set in the
 * component, where it would draw nothing.
 */
export function markersFor(kind: EdgeKind): { markerEnd: EdgeMarker; markerStart?: EdgeMarker } {
  return { markerEnd: REQUEST, ...(kind === 'sync' ? { markerStart: REPLY } : {}) };
}
