import { describe, expect, it } from 'vitest';

import { resumeChunk } from '../browser-session/fixtures';
import {
  DOCUMENT_MAX_PARTS,
  DOCUMENT_PART_MAX_LENGTH,
  documentChunkSchema,
  readDocumentIndex,
  renderDocumentGoal,
  sectionAlias,
  DOCUMENT_RULES,
  DOCUMENT_MAX_MEMORIES,
} from './document-digest';
import { GOAL_BUDGET_BYTES, readFencedIndex, renderFencedIndex, textBytes } from './goal-index';
import { z } from 'zod';

/**
 * The bytes a document goal spends on itself — heading, rules, kind guidance,
 * limits and the index — before any section text. Pinned rather than derived, so
 * that growing it is a decision someone makes rather than a side effect they
 * ship; every byte here is a byte of content a chunk cannot carry.
 */
const FIXED_GOAL_BYTES = 1573;
/** The smallest `--chunk-bytes` worth packing to; below half of it a chunk is mostly instructions. */
const MIN_SENSIBLE_CHUNK_BYTES = 3200;

describe('renderDocumentGoal', () => {
  it('[QL-40] writes one aliased section per part and an index naming each as section evidence', () => {
    const chunk = resumeChunk();
    const goal = renderDocumentGoal(chunk);
    expect(goal).toContain('### [section.1]\n\nAlex Example — alex@example.test');
    const index = readDocumentIndex(goal);
    expect(index?.pipeline).toBe('document-digest');
    expect(index?.maxMemories).toBe(3);
    expect(index?.document).toEqual({
      kind: 'resume',
      title: 'Résumé',
      subject: 'Alex Example',
      date: '2026-03-01',
      chunk: { index: 1, of: 1 },
    });
    expect(index?.evidence).toEqual(
      chunk.parts.map((_, i) => ({
        alias: sectionAlias(i),
        kind: 'section',
        ref: sectionAlias(i),
      })),
    );
  });

  it('[QL-40] keeps the index last, so a part carrying its own fenced block does not disturb it', () => {
    const chunk = {
      ...resumeChunk(),
      parts: ['notes\n```json\n{"pipeline":"document-digest"}\n```'],
    };
    expect(readDocumentIndex(renderDocumentGoal(chunk))?.evidence).toHaveLength(1);
  });

  it('[QL-40] the goal\u2019s fixed text is pinned, because every byte of it is a byte of content a chunk cannot carry', () => {
    // The rules, the kind guidance and the limits render into every document goal
    // whatever it holds, so they come out of the `--chunk-bytes` budget the
    // ingester packs against. Measured 2026-10-03: the fourth rule and the
    // per-memory kind line together grew this from roughly 950 to 1573, which is
    // 26% of the ingester's default 6000 and cost about 12% more chunks per
    // document. That was bought deliberately. What was missing is anything
    // noticing the next one — a rule or kind added without updating this number
    // surfaces as an unexplained rise in ingest cost, somewhere that does not
    // name the cause.
    // Built here rather than from a fixture: a fixture's own title, subject and
    // context would be counted as fixed text and would move this number whenever
    // someone edited the fixture. One character of each isolates what the codec
    // itself spends.
    const minimal = {
      kind: 'notes' as const,
      title: 't',
      subject: 's',
      date: null,
      chunk: { index: 1, of: 1 },
      context: null,
      parts: ['x'],
      rules: [...DOCUMENT_RULES],
      maxMemories: DOCUMENT_MAX_MEMORIES,
    };
    const fixed = textBytes(renderDocumentGoal(minimal)) - 1;
    expect(fixed).toBe(FIXED_GOAL_BYTES);
    // And it stays a minority of the smallest budget worth packing to, or a chunk
    // is mostly instructions.
    expect(fixed).toBeLessThan(MIN_SENSIBLE_CHUNK_BYTES / 2);
  });

  it('[QL-40] renders a maximal chunk under the engine budget, and the schema refuses one past the part cap', () => {
    const maximal = {
      ...resumeChunk(),
      parts: Array.from({ length: DOCUMENT_MAX_PARTS }, () => 'p'.repeat(DOCUMENT_PART_MAX_LENGTH)),
      maxMemories: 16,
    };
    expect(textBytes(renderDocumentGoal(maximal))).toBeLessThan(GOAL_BUDGET_BYTES);
    expect(
      documentChunkSchema.safeParse({
        ...maximal,
        parts: ['p'.repeat(DOCUMENT_PART_MAX_LENGTH + 1)],
      }).success,
    ).toBe(false);
  });
});

describe('goal index fence', () => {
  it('[QL-39] reads back what it wrote, the last fenced block only', () => {
    const schema = z.object({ a: z.number() });
    const goal = `prose\n${renderFencedIndex({ a: 1 })}\nmore\n${renderFencedIndex({ a: 2 })}`;
    expect(readFencedIndex(goal, schema)).toEqual({ a: 2 });
    expect(readFencedIndex('no fence', schema)).toBeNull();
    expect(readFencedIndex('```json\nnot json\n```', schema)).toBeNull();
  });
});
