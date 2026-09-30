/**
 * A finding's identity is structural — its type and where it points — never
 * its wording. What counts as "the same defect", and which refs are admitted
 * at all, is decided here once, for the normaliser and the annotator alike.
 */
import { compareStrings, unique } from './ordering';

/** Structural identity of a finding: its type and where it points, never its wording. */
export const findingKey = (type: string, locationRefs: readonly string[]): string =>
  `${type}|${unique(locationRefs).sort(compareStrings).join(',')}`;

/**
 * Whether two findings describe one defect: the same type, pointing at a common
 * location — or neither pointing anywhere.
 *
 * This is deliberately weaker than equal keys. Identity used to require the
 * *same set* of locations, which made agreement almost unreachable: two samples
 * describing one defect routinely cite overlapping but different evidence, so
 * one listing five locations and another listing four counted as two unrelated
 * singletons. Measured over 200 dumped iterations that discarded 60% of every
 * panel's findings as unconfirmed, and 88-100% on a pipeline whose artifact
 * exposes more locations to cite. Overlap is the honest test of "the same
 * defect"; the wording is still never compared.
 */
export const sameDefect = (
  a: { readonly type: string; readonly locationRefs: readonly string[] },
  b: { readonly type: string; readonly locationRefs: readonly string[] },
): boolean =>
  a.type === b.type &&
  (a.locationRefs.length === 0 || b.locationRefs.length === 0
    ? a.locationRefs.length === b.locationRefs.length
    : a.locationRefs.some((ref) => b.locationRefs.includes(ref)));

/** Keep only refs that exist — the enum should already guarantee it; this is the re-check. */
export const admitRefs = (refs: readonly string[], known: ReadonlySet<string>): string[] =>
  unique(refs.filter((ref) => known.has(ref))).sort(compareStrings);
