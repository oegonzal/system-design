/**
 * What a form recall searches with, and what it makes of what comes back —
 * pure of every port. The probes and the dealing are the contracts' own
 * (`fieldProbes`, `dealByRank`): what a field asks is its probe, and every
 * field's best is dealt before any field's second. What is this store's alone
 * stays here: how deep each kind of control draws, the named vectors each
 * probe is asked of, the filter — only what documents taught about the
 * subject, and of what was recorded for one unit of work, only the unit the
 * page names — the fusion of a field's lists, and the evidence item a hit
 * becomes.
 */
import {
  dealByRank,
  DEFAULT_MEMORY_SCOPE,
  DOCUMENT_MEMORY_KINDS,
  evidenceAlias,
  evidenceText,
  MAX_EVIDENCE,
  type DocumentMemoryKind,
  type EvidenceItem,
  type FieldProbeSet,
  type HitsPerFieldType,
} from '@sysdesign/contracts';

import {
  VECTOR_NAMES,
  type MemoryHit,
  type MemoryProbe,
  type PointRef,
  type ProbeFilter,
} from '../memory/ports';
import { fuse } from '../memory/recall/fusion';

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
export const HITS_PER_FIELD_TYPE: HitsPerFieldType = {
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
 * out by rank — every field's best before any field's second — one slot per
 * distinct fact, capped.
 */
export function fieldEvidence(
  probes: FieldProbeSet,
  ranked: readonly (readonly MemoryHit[])[],
  limit = MAX_EVIDENCE,
): MemoryHit[] {
  const perField = probes.byField.map((probe) =>
    probe === null ? [] : fuse(probeLists(ranked, probe), probes.limits[probe] ?? 0),
  );
  return dealByRank(perField, (hit) => hit.contentHash, limit);
}

/** A hit of a kind the form evidence holds — what documents taught about the subject. */
const isDocumentMemory = (
  hit: MemoryHit,
): hit is MemoryHit & { source: { kind: DocumentMemoryKind } } =>
  (DOCUMENT_MEMORY_KINDS as readonly string[]).includes(hit.source.kind);

/** The address an evidence item names a stored point by: the run that stored it and its ref within it, as one token. */
export const evidenceRef = (point: PointRef): string => `${point.runId}#${point.ref}`;

/**
 * The hits as the goal lists them: aliased `m1..` in order, each with what the
 * store holds it as and where it came from — the pipeline that digested it,
 * and the point's address. The search reads only document kinds; a hit of any
 * other kind is no evidence about the subject.
 */
export const evidenceItems = (hits: readonly MemoryHit[]): EvidenceItem[] =>
  hits.filter(isDocumentMemory).map((hit, position) => ({
    alias: evidenceAlias(position),
    text: evidenceText(hit.text),
    when: hit.source.when,
    // A point written before scopes holds as every document fact did: of the subject.
    scope: hit.scope ?? DEFAULT_MEMORY_SCOPE,
    kind: hit.source.kind,
    source: { origin: hit.source.pipeline, ref: evidenceRef(hit.source) },
  }));
