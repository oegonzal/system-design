/**
 * What a form recall searches with, and what it makes of what comes back —
 * pure of every port. What a field asks (`fieldQuestionOf`) is the probe: a
 * taught answer's condition is written as that very text, so the stored
 * condition and the next probe are one, and no model is asked to derive one.
 * The search reads only what documents taught about the subject, and of what
 * was recorded for one unit of work, only the unit the page names. Each
 * field's hits are fused on their own, then dealt out by rank under one cap —
 * every field's best before any field's second — so neither the first fields
 * nor the last are crowded out by a long page.
 */
import {
  DEFAULT_MEMORY_SCOPE,
  DOCUMENT_MEMORY_KINDS,
  evidenceAlias,
  EVIDENCE_TEXT_MAX_LENGTH,
  fieldQuestionOf,
  fieldTypeOf,
  MAX_EVIDENCE,
  type DocumentMemoryKind,
  type EvidenceItem,
  type FieldSpec,
  type FieldType,
  excerpt,
} from '@sysdesign/contracts';

import { VECTOR_NAMES, type MemoryHit, type MemoryProbe, type ProbeFilter } from '../memory/ports';
import { fuse } from '../memory/recall/fusion';

/** How many distinct probes one page may search under; a page lists at most as many fields. */
export const MAX_FIELD_PROBES = 40;
/**
 * How many hits one probe contributes per named vector before its field's
 * fusion, by what kind of control asks. A control that takes one value — a
 * radio, a select, a short text — is settled by the one fact that answers it,
 * and more hits only crowd the page's cap; a free-text field draws on several
 * stories and the facts a few paragraphs are composed from. Measured
 * 2026-10-13 on a cover letter replayed against the store: eleven candidates,
 * six dealt, and the drafts ran to a paragraph; the account the record held
 * a story for ran to three. A table over every declared field type, so a new
 * kind is classified or the build refuses.
 */
export const HITS_PER_FIELD_TYPE: Readonly<Record<FieldType, number>> = {
  text: 3,
  textarea: 10,
  number: 3,
  date: 3,
  select: 3,
  radio: 3,
  checkbox: 3,
  file: 3,
  unknown: 3,
};

/** The hits a field's probe takes per named vector. */
export const hitsFor = (field: Pick<FieldSpec, 'role' | 'inputType'>): number =>
  HITS_PER_FIELD_TYPE[fieldTypeOf(field)];

export interface FieldProbeSet {
  /** Distinct probe texts, in field order. */
  texts: string[];
  /** For each field, the index into `texts` it is searched under; null for a field with nothing to ask, or past the cap. */
  byField: (number | null)[];
  /** For each probe, the hits it takes per named vector: the most any field asking it takes. */
  limits: number[];
}

/** One probe per distinct question the page asks, each field pointing at its own. */
export function fieldProbes(fields: readonly FieldSpec[]): FieldProbeSet {
  const texts: string[] = [];
  const limits: number[] = [];
  const positions = new Map<string, number>();
  const byField = fields.map((field) => {
    const text = fieldQuestionOf(field);
    if (text === null) return null;
    const known = positions.get(text);
    if (known !== undefined) {
      limits[known] = Math.max(limits[known] ?? 0, hitsFor(field));
      return known;
    }
    if (texts.length === MAX_FIELD_PROBES) return null;
    positions.set(text, texts.length);
    texts.push(text);
    limits.push(hitsFor(field));
    return texts.length - 1;
  });
  return { texts, byField, limits };
}

/**
 * What a form's answer may rest on: what a document taught about the subject
 * — facts, stories and the bounds on claiming them — and, of what was
 * recorded for one unit of work, only what was recorded for the unit the page
 * names (`unitKey`; none when it names none). Never a design lesson: a probe
 * for this person's career must not return engineering knowledge. Measured
 * 2026-10-10: a page asking "Do you reside in CST or EST?" spent two of its
 * evidence slots on time-zone lessons from design runs.
 */
const formEvidenceFilter = (unitKey: string | undefined): ProbeFilter => ({
  kinds: DOCUMENT_MEMORY_KINDS,
  ...(unitKey === undefined ? {} : { unitKey }),
});

/** Every named vector asked of every probe, as one batch, each under its probe's budget and the page's one filter. */
export const searchProbes = (
  vectors: readonly (readonly number[])[],
  limits: readonly number[],
  unitKey: string | undefined,
): MemoryProbe[] => {
  const filter = formEvidenceFilter(unitKey);
  return vectors.flatMap((vector, index) => {
    const limit = limits[index];
    if (limit === undefined) throw new Error(`probe ${index} has no budget`);
    return VECTOR_NAMES.map((using) => ({ vector, using, limit, filter }));
  });
};

/** The ranked lists that answer probe `index`: one per named vector, as `searchProbes` asked them. */
export const probeLists = (
  ranked: readonly (readonly MemoryHit[])[],
  index: number,
): readonly (readonly MemoryHit[])[] =>
  ranked.slice(index * VECTOR_NAMES.length, (index + 1) * VECTOR_NAMES.length);

/** How many distinct lessons the whole search surfaced, before any fusion or cap. */
export const distinctHits = (ranked: readonly (readonly MemoryHit[])[]): number =>
  new Set(ranked.flat().map((hit) => hit.contentHash)).size;

/**
 * The evidence for a page: each field's lists fused on their own, then dealt
 * out by rank — every field's best in field order, then every field's second —
 * one slot per distinct fact, capped. Measured 2026-10-10: joined field by
 * field, an eleven-field page spent the cap before its last fields, and the
 * question 37 stored facts about the subject spoke to was asked with none.
 */
export function fieldEvidence(
  probes: FieldProbeSet,
  ranked: readonly (readonly MemoryHit[])[],
  limit = MAX_EVIDENCE,
): MemoryHit[] {
  const perField = probes.byField.map((probe) =>
    probe === null ? [] : fuse(probeLists(ranked, probe), probes.limits[probe] ?? 0),
  );
  const deepest = Math.max(0, ...probes.limits);
  const seen = new Set<string>();
  const chosen: MemoryHit[] = [];
  for (let rank = 0; rank < deepest; rank++) {
    for (const hits of perField) {
      const hit = hits[rank];
      if (hit === undefined || seen.has(hit.contentHash)) continue;
      if (chosen.length === limit) return chosen;
      seen.add(hit.contentHash);
      chosen.push(hit);
    }
  }
  return chosen;
}

/** A hit of a kind the form evidence holds — what documents taught about the subject. */
const isDocumentMemory = (
  hit: MemoryHit,
): hit is MemoryHit & { source: { kind: DocumentMemoryKind } } =>
  (DOCUMENT_MEMORY_KINDS as readonly string[]).includes(hit.source.kind);

/**
 * The hits as the goal lists them: aliased `m1..` in order, each with where it
 * came from and what the store holds it as. The search reads only document
 * kinds; a hit of any other kind is no evidence about the subject.
 */
export const evidenceItems = (hits: readonly MemoryHit[]): EvidenceItem[] =>
  hits.filter(isDocumentMemory).map((hit, position) => ({
    alias: evidenceAlias(position),
    text: excerpt(hit.text, EVIDENCE_TEXT_MAX_LENGTH),
    when: hit.source.when,
    // A point written before scopes holds as every document fact did: of the subject.
    scope: hit.scope ?? DEFAULT_MEMORY_SCOPE,
    source: {
      runId: hit.source.runId,
      pipeline: hit.source.pipeline,
      ref: hit.source.ref,
      kind: hit.source.kind,
    },
  }));
