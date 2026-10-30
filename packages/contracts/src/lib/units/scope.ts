/**
 * Where a memory holds: of the subject wherever a form asks, or only of the
 * one unit of work — employer, role or application — it was recorded for. The
 * units domain's vocabulary, read by whoever writes a memory's scope (a
 * digest, an answerer), carries it (a stored point, an evidence item) or reads
 * it back (a form goal's legend, a store's filter), so no program argues a
 * scope from the wording of a fact. Measured 2026-10-12: answers taught as one
 * application's events were recalled for the same question reworded, judged
 * another application's, and the operator was asked again — the same fact
 * five times across four sessions.
 */
export const MEMORY_SCOPES = ['subject', 'unit'] as const;
export type MemoryScope = (typeof MEMORY_SCOPES)[number];

/** What each scope means, rendered into a digest's schema and the form goals' legend. */
export const MEMORY_SCOPE_USES: Readonly<Record<MemoryScope, string>> = {
  subject:
    'true of the subject wherever asked — the answer is the same whoever asks: their record, their experience, skills, documents, links, status or availability, or their standing answer to a question any form may ask, however the form was asked for one role',
  unit: 'about the one employer, role or application it was recorded for — the answer would differ for another: whether the subject works or worked there, knows anyone there, consents to its messages, how they heard of this opening, whether this posting suits; settles only a question about that same unit of work',
};

/** Every memory written before scopes were declared was a document's fact about the subject. */
export const DEFAULT_MEMORY_SCOPE: MemoryScope = 'subject';

/**
 * Which scopes bind a memory to the one unit of work it was recorded for — a
 * total table, so a new scope is classified or the build refuses. A memory of
 * a bound scope is stored with its unit's key and read only by a search that
 * names that unit; every other memory is read by any search.
 */
const SCOPE_BOUND_TO_UNIT: Readonly<Record<MemoryScope, boolean>> = {
  subject: false,
  unit: true,
};

/** The scopes bound to a unit of work, as a store's filter names them. */
export const UNIT_BOUND_SCOPES: readonly MemoryScope[] = MEMORY_SCOPES.filter(
  (scope) => SCOPE_BOUND_TO_UNIT[scope],
);

/**
 * Whether a memory of this scope is bound to a unit of work. One stored with
 * no scope is not: a store's filter reads a missing scope as matching no
 * bound one, and every reader of a memory reads it the same way.
 */
export const isUnitBound = (scope: MemoryScope | undefined): boolean =>
  scope !== undefined && UNIT_BOUND_SCOPES.includes(scope);
