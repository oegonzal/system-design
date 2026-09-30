/**
 * Prose for a reader, never for a decision. A confirmed finding is structural
 * — a key, ordinals, refs — and the normaliser builds it without reading a
 * word; the first sentence a critic gave for it is attached here, after the
 * fact, so a producer or a person can see why. The controller never looks.
 */
import type { ConfirmedFinding, CriticReport, LensOutcome } from '@sysdesign/contracts';

import { admitRefs, sameDefect } from './normalize';

/** The slot the normaliser leaves empty; `annotate` fills it. */
export const unannotated = (): Pick<ConfirmedFinding, 'rationale'> => ({ rationale: null });

/**
 * Each confirmed finding with the first sentence a critic gave for it. A
 * confirmed finding groups raw ones, so its key is no longer any single raw
 * finding's key: match by membership.
 */
export function annotate(
  confirmed: readonly ConfirmedFinding[],
  critics: readonly LensOutcome<CriticReport>[],
  locations: readonly { id: string }[],
): ConfirmedFinding[] {
  const known = new Set(locations.map((location) => location.id));
  const raws = critics.flatMap((outcome) =>
    (outcome.report?.findings ?? []).map((raw) => ({
      type: raw.type,
      locationRefs: admitRefs(raw.locationRefs, known),
      rationale: raw.rationale,
    })),
  );
  return confirmed.map((finding) => ({
    ...finding,
    rationale: raws.find((raw) => sameDefect(finding, raw))?.rationale ?? null,
  }));
}
