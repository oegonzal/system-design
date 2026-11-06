import type {
  ConfigEntry,
  EdgeKind,
  NodeKind,
  NodeOperation,
  PlatformServiceId,
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
  /** The platform service the block is, when it names one; `kind` is one of its roles. */
  service?: PlatformServiceId;
  label: string;
  /** Where the block sits — a region, an account, a network, a subnet, a security group — in the platform's words. */
  boundary?: string;
  config?: ConfigEntry[];
  responsibilities?: string[];
  operations?: NodeOperation[];
  /** Set while a finding highlights this element; drives the outline color. */
  severity?: Severity | null;
  /** While a path is shown: true on it, false off it; unset when none is shown. */
  onPath?: boolean;
};

export type SdNode = Node<SdNodeData, 'sd'>;

export type SdEdgeData = {
  kind: EdgeKind;
  /** The hop's positions in the shown path, 1-based; several where the walk revisits it. */
  sequence?: number[];
  /** While a path is shown: true on it, false off it; unset when none is shown. */
  onPath?: boolean;
  carries?: string[];
  /** How the hop is made and what happens when it fails, as free-form entries. */
  config?: ConfigEntry[];
  severity?: Severity | null;
};

export type SdEdge = Edge<SdEdgeData, 'sd'>;
