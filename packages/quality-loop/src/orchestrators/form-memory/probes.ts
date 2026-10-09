/**
 * What a form recall searches with, and what it makes of what comes back —
 * pure of every port. A field's label is a question the subject is asked,
 * and a stored fact's condition is written as that very question
 * (`appliesWhen`), so the label is the probe: no model is asked to derive
 * one. Each field's hits are fused on their own, then the fields' lists are
 * joined in field order under one cap, so the first fields' facts are never
 * crowded out by a long page.
 */
import {
  evidenceAlias,
  EVIDENCE_TEXT_MAX_LENGTH,
  MAX_EVIDENCE,
  type EvidenceItem,
  type FieldSpec,
  excerpt,
} from '@sysdesign/contracts';

import { VECTOR_NAMES, type MemoryHit, type MemoryProbe } from '../memory/ports';
import { fuse } from '../memory/recall/fusion';

/** How many distinct probes one page may search under; a page lists at most as many fields. */
export const MAX_FIELD_PROBES = 40;
/** How many hits one probe contributes per named vector before its field's fusion. */
export const HITS_PER_PROBE = 3;

export interface FieldProbeSet {
  /** Distinct probe texts, in field order. */
  texts: string[];
  /** For each field, the index into `texts` it is searched under; null for a field with nothing to ask, or past the cap. */
  byField: (number | null)[];
}

const tidy = (text: string | null): string => text?.replace(/\s+/g, ' ').trim() ?? '';

/** A field's probe: what it asks, in the words the form uses — its label, then the help text beside it. */
export const probeText = (field: FieldSpec): string =>
  [tidy(field.name), tidy(field.context)].filter((part) => part.length > 0).join('. ');

/** One probe per distinct question the page asks, each field pointing at its own. */
export function fieldProbes(fields: readonly FieldSpec[]): FieldProbeSet {
  const texts: string[] = [];
  const positions = new Map<string, number>();
  const byField = fields.map((field) => {
    const text = probeText(field);
    if (text.length === 0) return null;
    const known = positions.get(text);
    if (known !== undefined) return known;
    if (texts.length === MAX_FIELD_PROBES) return null;
    positions.set(text, texts.length);
    texts.push(text);
    return texts.length - 1;
  });
  return { texts, byField };
}

/** Every named vector asked of every probe, as one batch, each with the same small budget. */
export const searchProbes = (
  vectors: readonly (readonly number[])[],
  limit = HITS_PER_PROBE,
): MemoryProbe[] =>
  vectors.flatMap((vector) => VECTOR_NAMES.map((using) => ({ vector, using, limit })));

/** The ranked lists that answer probe `index`: one per named vector, as `searchProbes` asked them. */
const listsOf = (ranked: readonly (readonly MemoryHit[])[], index: number) =>
  ranked.slice(index * VECTOR_NAMES.length, (index + 1) * VECTOR_NAMES.length);

/** How many distinct lessons the whole search surfaced, before any fusion or cap. */
export const distinctHits = (ranked: readonly (readonly MemoryHit[])[]): number =>
  new Set(ranked.flat().map((hit) => hit.contentHash)).size;

/**
 * The evidence for a page: each field's lists fused on their own, the
 * fields' results joined in field order, one slot per distinct lesson, capped.
 */
export function fieldEvidence(
  probes: FieldProbeSet,
  ranked: readonly (readonly MemoryHit[])[],
  limit = MAX_EVIDENCE,
): MemoryHit[] {
  const seen = new Set<string>();
  const chosen: MemoryHit[] = [];
  for (const probe of probes.byField) {
    if (probe === null) continue;
    for (const hit of fuse(listsOf(ranked, probe), HITS_PER_PROBE)) {
      if (chosen.length === limit) return chosen;
      if (seen.has(hit.contentHash)) continue;
      seen.add(hit.contentHash);
      chosen.push(hit);
    }
  }
  return chosen;
}

/** The hits as the goal lists them: aliased `m1..` in order, with where each came from. */
export const evidenceItems = (hits: readonly MemoryHit[]): EvidenceItem[] =>
  hits.map((hit, position) => ({
    alias: evidenceAlias(position),
    text: excerpt(hit.text, EVIDENCE_TEXT_MAX_LENGTH),
    when: hit.source.when,
    source: { runId: hit.source.runId, pipeline: hit.source.pipeline, ref: hit.source.ref },
  }));
