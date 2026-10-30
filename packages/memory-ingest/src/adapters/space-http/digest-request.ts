import type { DigestRequest } from '@sysdesign/agentic-memory-client';
import {
  excerpt,
  REGISTER_DIGEST_LABEL_MAX_LENGTH,
  type DocumentChunk,
  type DocumentKind,
} from '@sysdesign/contracts';

import type { PlannedChunk } from '../../core/ports';
import type { IngestSpace } from './ingest-space';

/**
 * A chunk as a digest request: what the memory host renders into the goal of
 * one register digest. The chunk's parts are the sections, each labelled by
 * the headings above the chunk; the rules are the ingest's own, in the
 * register digest's words — one fact per memory, a predicate a form could ask
 * by, a value a field could take, qualifiers kept, the subject named and the
 * document's date stated — with no scope test among them, because the scope
 * is declared: the tenant's partition alone, so every agent of the tenant
 * reads what a document states. Provenance names the ingest and the kind of
 * document it read, and the chunk's hash as the source: the posting's
 * identity in the manifest, so a record says which chunk it came from, and a
 * re-posting of the same text is the same source.
 */

/** The source every memory of a chunk carries: the ingest, and the kind of document it read. */
export const sourceOf = (kind: DocumentKind): string => `memory-ingest:${kind}`;

/** The rules every chunk states, whatever the document. */
export const INGEST_RULES: readonly string[] = [
  'A memory states one fact the cited sections state about the subject, and nothing they do not; two facts the subject holds at once are two memories.',
  'A predicate names what the fact is of — a role, a span of years, a skill, a document, a link, a status — as a form could ask it; a memory with the same subject and predicate replaces the current one, so a predicate is shared only by versions of one fact.',
  'A value is a complete statement a form field could take or compute from: absolute dates and figures, names as the document spells them, the subject named.',
  "Where a cited section qualifies a claim — reported rather than audited, a design, a learning exercise or a planned project, an interpretation — the value carries that qualifier in the section's own words; a section that states a fact plainly needs none.",
];

/** Whom every section is about, by name, so each memory's subject is that name and nobody else's statement is taken as theirs. */
export const subjectRule = (subject: string): string =>
  `Every section is about ${subject}, the subject: a memory's subject is that name, spelled so, and a memory states nothing about anyone else as the subject's.`;

/**
 * The day the document speaks for, which decides how an open-ended span is
 * computed: to that day when the document is dated, and left open when it is
 * not — a figure that is only absolute against the day it was written is
 * never given a day nobody stated.
 */
export const dateRule = (date: string | null): string => {
  const span =
    'where cited sections date a role, or the roles a technology was used in, the value states both ends as given and the span between them in whole years and months, computed from those dates alone';
  return date === null
    ? `The document is undated: ${span}; an open end is left open, no day computed for it.`
    : `The document is dated ${date}: ${span}; an open end is computed to ${date}, and the value says so.`;
};

/** The rules a chunk's digest states: the ingest's, then the subject and the date of its document. */
export const ingestRules = (chunk: DocumentChunk): string[] => [
  ...INGEST_RULES,
  subjectRule(chunk.subject),
  dateRule(chunk.date),
];

/** The headings above the chunk as a section's label, within the label's bound; null when the chunk sits under none. */
const labelOf = (chunk: DocumentChunk): string | null =>
  chunk.context === null || chunk.context === ''
    ? null
    : excerpt(chunk.context, REGISTER_DIGEST_LABEL_MAX_LENGTH);

export function digestRequestOf(planned: PlannedChunk, space: IngestSpace): DigestRequest {
  const { chunk } = planned;
  const label = labelOf(chunk);
  return {
    title: chunk.title,
    parts: chunk.parts.map((text) => ({ label, at: null, text })),
    rules: ingestRules(chunk),
    registers: [...space.registers],
    scope: space.scope,
    provenance: { source: sourceOf(chunk.kind), sourceRunId: planned.chunkHash },
  };
}
