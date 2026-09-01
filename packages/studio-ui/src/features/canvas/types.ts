import type {
  EdgeIntent,
  EdgeKind,
  NodeConfig,
  NodeKind,
  NodeOperation,
  Severity,
} from '@sysdesign/contracts';
import type { Edge, Node } from '@xyflow/react';

/**
 * React Flow's view of the graph. Type aliases rather than interfaces on
 * purpose: React Flow constrains node/edge data to `Record<string, unknown>`,
 * which a closed interface does not satisfy but an object type alias does.
 *
 * The wire shape (`CanvasGraph`) never appears here — `graph-io.ts` is the
 * single module that knows both.
 */
export type SdNodeData = {
  kind: NodeKind;
  label: string;
  config?: NodeConfig;
  responsibilities?: string[];
  operations?: NodeOperation[];
  /** A suggestion overlay element — stripped before serialization. */
  ghost?: boolean;
  /** Set while a finding highlights this element; drives the outline color. */
  severity?: Severity | null;
};

export type SdNode = Node<SdNodeData, 'sd'>;

export type SdEdgeData = {
  kind: EdgeKind;
  intent?: EdgeIntent;
  carries?: string[];
  ghost?: boolean;
  severity?: Severity | null;
};

export type SdEdge = Edge<SdEdgeData, 'sd'>;
