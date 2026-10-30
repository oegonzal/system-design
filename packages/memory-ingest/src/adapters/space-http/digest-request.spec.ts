import {
  DOCUMENT_CONTEXT_MAX_LENGTH,
  DOCUMENT_SUBJECT_MAX_LENGTH,
  DOCUMENT_TITLE_MAX_LENGTH,
  REGISTER_DIGEST_LABEL_MAX_LENGTH,
  REGISTER_DIGEST_MAX_PARTS,
  REGISTER_DIGEST_MAX_RULES,
  REGISTER_DIGEST_PART_MAX_LENGTH,
  REGISTER_DIGEST_RULE_MAX_LENGTH,
  registerDigestRequestSchema,
  SCOPE_RULE,
  type DocumentChunk,
} from '@sysdesign/contracts';

import { chunkHash } from '../../core/chunk';
import type { PlannedChunk } from '../../core/ports';
import { MEMORY_URL, SPACE_ID } from '../../test/fakes';
import {
  dateRule,
  digestRequestOf,
  INGEST_RULES,
  ingestRules,
  sourceOf,
  subjectRule,
} from './digest-request';
import type { IngestSpace } from './ingest-space';

const chunkOf = (overrides: Partial<DocumentChunk> = {}): DocumentChunk => ({
  kind: 'notes',
  title: 'notes.md',
  subject: 'Ada',
  date: null,
  chunk: { index: 1, of: 1 },
  context: 'Ada > Work',
  parts: ['- Translated the memoir.'],
  rules: [],
  maxMemories: 16,
  ...overrides,
});

const plannedOf = (chunk: DocumentChunk): PlannedChunk => ({
  chunk,
  goal: 'the goal',
  chunkHash: chunkHash('the goal'),
  bytes: 8,
});

const SPACE: IngestSpace = {
  spaceId: SPACE_ID,
  host: MEMORY_URL,
  scope: { tenant: 'north' },
  registers: ['facts', 'stories'],
};

describe('the digest request', () => {
  it('[ING-4] states the ingest’s rules in the register digest’s words — the subject named and the document’s date among them — within the host’s count and length bounds for the longest subject, and never the scope test', () => {
    const longest = 'x'.repeat(DOCUMENT_SUBJECT_MAX_LENGTH);
    const rules = ingestRules(chunkOf({ subject: longest, date: '2026-10-02' }));
    expect(rules.length).toBeLessThanOrEqual(REGISTER_DIGEST_MAX_RULES);
    for (const rule of rules) {
      expect(rule.length, rule).toBeLessThanOrEqual(REGISTER_DIGEST_RULE_MAX_LENGTH);
    }
    expect(rules).not.toContain(SCOPE_RULE);
    expect(rules.slice(0, INGEST_RULES.length)).toEqual(INGEST_RULES);
    expect(rules).toContain(subjectRule(longest));
    expect(rules).toContain(dateRule('2026-10-02'));
    expect(dateRule('2026-10-02')).toContain('an open end is computed to 2026-10-02');
    expect(dateRule(null)).toMatch(/^The document is undated: /);
    expect(ingestRules(chunkOf())).toContain(dateRule(null));
  });

  it('[ING-4] composes the request the host’s door accepts for a maximal chunk: the title, every part under the headings’ label within its bound, the registers, the tenant’s partition alone, and provenance naming the ingest, the document kind and the chunk’s hash', () => {
    const chunk = chunkOf({
      kind: 'resume',
      title: 't'.repeat(DOCUMENT_TITLE_MAX_LENGTH),
      subject: 's'.repeat(DOCUMENT_SUBJECT_MAX_LENGTH),
      date: '2026-10-02',
      context: 'h'.repeat(DOCUMENT_CONTEXT_MAX_LENGTH),
      parts: Array.from({ length: REGISTER_DIGEST_MAX_PARTS }, () =>
        'p'.repeat(REGISTER_DIGEST_PART_MAX_LENGTH),
      ),
    });
    const planned = plannedOf(chunk);
    const request = digestRequestOf(planned, SPACE);
    expect(request).toMatchObject({
      title: chunk.title,
      registers: ['facts', 'stories'],
      scope: { tenant: 'north' },
      provenance: { source: 'memory-ingest:resume', sourceRunId: planned.chunkHash },
    });
    expect(request.parts).toHaveLength(REGISTER_DIGEST_MAX_PARTS);
    expect(request.parts.map((part) => part.text)).toEqual(chunk.parts);
    expect(request.parts.every((part) => part.at === null)).toBe(true);
    const label = request.parts[0]?.label ?? '';
    expect(label).toHaveLength(REGISTER_DIGEST_LABEL_MAX_LENGTH);
    expect(label.endsWith('…')).toBe(true);
    expect(registerDigestRequestSchema.safeParse(request).success).toBe(true);
    // A chunk under no heading labels its parts with nothing; a short heading path is the label whole.
    expect(
      digestRequestOf(plannedOf(chunkOf({ context: null })), SPACE).parts[0]?.label,
    ).toBeNull();
    expect(digestRequestOf(plannedOf(chunkOf()), SPACE).parts[0]?.label).toBe('Ada > Work');
    expect(sourceOf('notes')).toBe('memory-ingest:notes');
  });
});
