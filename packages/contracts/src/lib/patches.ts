import type { CanvasEdge, CanvasNode } from './canvas';

/**
 * A machine-readable suggested fix attached to a finding. The canvas renders
 * the patch as a ghost overlay; accepting it merges the ops into the working
 * draft. Ids introduced by a patch are prefixed `suggested-` so an accepted
 * patch can never collide with ids the author already used.
 */
export const GRAPH_PATCH_OPS = ['add-node', 'add-edge', 'remove-edge', 'update-node'] as const;
export type GraphPatchOpKind = (typeof GRAPH_PATCH_OPS)[number];

export type PatchOp =
  | { op: 'add-node'; node: CanvasNode }
  | { op: 'add-edge'; edge: CanvasEdge }
  | { op: 'remove-edge'; edgeId: string }
  | {
      op: 'update-node';
      nodeId: string;
      set: Partial<Pick<CanvasNode, 'kind' | 'label' | 'config'>>;
    };

export interface GraphPatch {
  /** One sentence: what applying this changes, phrased as the lesson. */
  description: string;
  ops: PatchOp[];
}

export const SUGGESTED_ID_PREFIX = 'suggested-';
