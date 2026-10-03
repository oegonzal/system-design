import {
  DOCUMENT_MAX_PARTS,
  GOAL_BUDGET_BYTES,
  MISSION_FIXTURE,
  resumeChunk,
  textBytes,
} from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { readIndex } from './input';
import { documentGoal, maximalChunk } from './testing';

describe('the document-digest input codec', () => {
  it('[QL-39] a rendered chunk round-trips: the index read back is the sections the composer wrote, each of kind section', () => {
    const chunk = resumeChunk();
    const goal = documentGoal(chunk);
    expect(goal).toContain('# Document — Résumé');
    expect(goal).toContain(
      'Kind: resume · Subject: Alex Example · Dated: 2026-03-01 · Chunk 1 of 1',
    );
    expect(goal).toContain(`### [section.2]\n\n${chunk.parts[1]}`);
    expect(readIndex(goal)).toEqual({
      pipeline: 'document-digest',
      maxMemories: 3,
      document: {
        kind: 'resume',
        title: 'Résumé',
        subject: 'Alex Example',
        date: '2026-03-01',
        chunk: { index: 1, of: 1 },
      },
      evidence: [1, 2, 3].map((position) => ({
        alias: `section.${position}`,
        kind: 'section',
        ref: `section.${position}`,
      })),
    });
  });

  it('[QL-39] [QL-40] a chunk at every cap renders under the engine’s budget with every section listed', () => {
    const goal = documentGoal(maximalChunk());
    expect(textBytes(goal)).toBeLessThan(GOAL_BUDGET_BYTES);
    expect(readIndex(goal)?.evidence).toHaveLength(DOCUMENT_MAX_PARTS);
    expect(readIndex(goal)?.maxMemories).toBe(16);
  });

  it('[QL-39] a plain document, another codec’s index or a broken fence reads as no index', () => {
    expect(readIndex(MISSION_FIXTURE)).toBeNull();
    expect(
      readIndex(
        '## Index\n\n```json\n{"pipeline":"memory-recall","maxKept":2,"candidates":[]}\n```',
      ),
    ).toBeNull();
    expect(readIndex('## Index\n\n```json\n{ not json')).toBeNull();
  });
});
