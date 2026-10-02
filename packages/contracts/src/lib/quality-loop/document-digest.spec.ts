import { describe, expect, it } from 'vitest';

import { resumeChunk } from '../browser-session/fixtures';
import {
  DOCUMENT_MAX_PARTS,
  DOCUMENT_PART_MAX_LENGTH,
  documentChunkSchema,
  readDocumentIndex,
  renderDocumentGoal,
  sectionAlias,
} from './document-digest';
import { GOAL_BUDGET_BYTES, readFencedIndex, renderFencedIndex, textBytes } from './goal-index';
import { z } from 'zod';

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
