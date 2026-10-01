import { DEFAULT_NODE_LABELS, type NodeKind } from './canvas';

/**
 * The name to show for a node. A label is optional in substance — the schema
 * asks for the key but not for content, so that a model which emits an empty
 * one loses a name rather than the whole artifact — and three readers print it:
 * the text a lens judges, the location label a finding cites, and the studio's
 * own prose substitution. None of them may print nothing, so a blank label
 * falls back to its kind's own name. The fallback is total, which is why the
 * schema can afford to stay permissive.
 */
export const nodeLabel = (node: { readonly kind: NodeKind; readonly label: string }): string =>
  node.label.trim() || DEFAULT_NODE_LABELS[node.kind];
