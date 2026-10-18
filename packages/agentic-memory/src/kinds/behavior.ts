/**
 * A memory kind as declared data: the candidate it accepts, the fields its
 * identity is made of, the values an exact recall finds it by, the field its
 * valid time comes from, the text it is embedded and shown as, and whether it
 * is projected into the vector index. (The role a kind plays in consolidation
 * is design vocabulary, the contract's `CONSOLIDATION_ROLES`.) The engine reads
 * these and nothing else about a kind, so a new kind or a changed
 * one is an entry in a registry, never an engine edit. The members are written
 * as methods so a behavior typed for its own candidate fits the registry.
 */
import { createHash } from 'node:crypto';

import {
  canonicalArguments,
  type MemoryLesson,
  type RecordScope,
  type RegisterKind,
} from '@sysdesign/contracts';
import type { ZodType } from 'zod';

import { canonicalScope } from '../space/scope';

export interface KindBehavior<C extends Record<string, unknown> = Record<string, unknown>> {
  readonly kind: RegisterKind;
  readonly candidate: ZodType<C>;
  /** The fields a current value is one per; empty for a kind that appends. */
  readonly identity: readonly (keyof C & string)[];
  /** The fields an exact recall finds a record by. */
  readonly keys: readonly (keyof C & string)[];
  /** The field valid time comes from; null when it is the moment of recording. */
  readonly validFrom: (keyof C & string) | null;
  readonly projected: boolean;
  text(candidate: C): string;
  /** A source's lesson, when the episode proposes one it verified. */
  lessonOf?(candidate: C): MemoryLesson | null;
  /** A lesson target's candidate for one lesson. */
  fromLesson?(lesson: MemoryLesson): C;
  /** A playbook target's candidate for a playbook's qualifying lessons. */
  fromLessons?(name: string, lessons: readonly MemoryLesson[]): C;
}

export type BehaviorRegistry = Readonly<Partial<Record<RegisterKind, KindBehavior>>>;

/**
 * A behavior checked against its own candidate where it is defined, and held
 * by a registry in the shape every kind shares. A zod schema is invariant in
 * what it parses to, so a behavior typed for one candidate does not widen on
 * its own; this is the one place it is widened.
 */
export const defineBehavior = <C extends Record<string, unknown>>(
  definition: KindBehavior<C>,
): KindBehavior => definition as unknown as KindBehavior;

/** The identity a write reconciles on: the identity fields' values in declared order, or null for a kind that appends. */
export const identityOf = (
  behavior: KindBehavior,
  candidate: Readonly<Record<string, unknown>>,
): string | null =>
  behavior.identity.length === 0
    ? null
    : JSON.stringify(behavior.identity.map((field) => candidate[field]));

/** The values an exact recall finds a record by, without repeats. */
export const keysOf = (
  behavior: KindBehavior,
  candidate: Readonly<Record<string, unknown>>,
): string[] => [...new Set(behavior.keys.map((field) => String(candidate[field])))];

/** Everything but the identity and the valid time, in one spelling: what "the same content" compares. */
export function contentOf(
  behavior: KindBehavior,
  candidate: Readonly<Record<string, unknown>>,
): string {
  const skipped = new Set<string>([
    ...behavior.identity,
    ...(behavior.validFrom === null ? [] : [behavior.validFrom]),
  ]);
  return canonicalArguments(
    Object.fromEntries(Object.entries(candidate).filter(([field]) => !skipped.has(field))),
  );
}

/**
 * The hash a kind that appends deduplicates on: the register, the scope, the
 * body and where it came from. A retry of one write is idempotent; the same
 * episode from two independent runs is two pieces of evidence, not one.
 */
export function contentHashOf(input: {
  register: string;
  scope: RecordScope;
  body: Readonly<Record<string, unknown>>;
  source: string;
  sourceRunId: string | null;
}): string {
  const canonical = canonicalArguments({
    register: input.register,
    scope: canonicalScope(input.scope),
    body: input.body,
    source: input.source,
    sourceRunId: input.sourceRunId,
  });
  return createHash('sha256').update(canonical).digest('hex');
}
