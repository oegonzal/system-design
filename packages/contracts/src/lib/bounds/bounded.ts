import { z, type ZodType } from 'zod';
import type { $ZodType } from 'zod/v4/core';

import type { Bound, BoundKind, DeclaredBound } from './bound';

/**
 * Private: the nodes `bounded.*` built, with what they declared. Zod clones a
 * node on `.min/.max/.describe/.trim`, so `bounded.*` builds the whole node
 * and registers the one it returns — the rule is that `bounded.*` is the last
 * call on a node; `.optional()`, `.nullable()` and `.default()` wrap it.
 */
const registry = z.registry<DeclaredBound>();

export interface TextOptions {
  /** The least the text may have, when something must be written. */
  min?: number;
  /** Read by the model, which writes into the schema. */
  description?: string;
  /** Trim before measuring, for text a person types. */
  trim?: boolean;
}

export interface ListOptions {
  min?: number;
  description?: string;
}

export interface IdOptions {
  min?: number;
  description?: string;
}

const declared = (b: Bound, kind: BoundKind): DeclaredBound => ({
  target: b.target,
  ceiling: b.ceiling,
  kind,
});

export const bounded = {
  /** Prose: the model is asked for the target, the schema accepts the ceiling, the parse keeps the rest. */
  text(b: Bound, options: TextOptions = {}): z.ZodString {
    let node = z.string();
    if (options.trim) node = node.trim();
    if (options.min !== undefined) node = node.min(options.min);
    node = node.max(b.ceiling);
    if (options.description !== undefined) node = node.describe(options.description);
    return node.register(registry, declared(b, 'text'));
  },

  /** A list: asked for the target, accepted to the ceiling, trimmed past it by whole items. */
  list<Item extends ZodType>(b: Bound, item: Item, options: ListOptions = {}): z.ZodArray<Item> {
    let node = z.array(item);
    if (options.min !== undefined) node = node.min(options.min);
    node = node.max(b.ceiling);
    if (options.description !== undefined) node = node.describe(options.description);
    return node.register(registry, declared(b, 'list'));
  },

  /** An id or a reference: exact, never over, never cut — a wrong one is a structural fault. */
  id(max: number, options: IdOptions = {}): z.ZodString {
    let node = z.string();
    if (options.min !== undefined) node = node.min(options.min);
    node = node.max(max);
    if (options.description !== undefined) node = node.describe(options.description);
    return node.register(registry, { target: max, ceiling: max, kind: 'id' });
  },
};

/** The declaration a node carries — its own, or the one it was cloned from. */
export function declaredOf(node: $ZodType | undefined): DeclaredBound | undefined {
  for (let current = node; current !== undefined; current = current._zod.parent) {
    const found = registry.get(current);
    if (found !== undefined) return found;
  }
  return undefined;
}
