import { describe, expect, it } from 'vitest';

import { contractOf } from '../../core/testing';
import { DOCUMENT_DIGEST } from './definition';
import type { DocumentDigest } from './output';
import { documentGoal, sampleDocumentDigest } from './testing';
import { limitsValidator, referencesValidator } from './validators';

const goal = documentGoal();

const problems = (digest: DocumentDigest, goalIn = goal) => {
  const contract = contractOf(DOCUMENT_DIGEST.task, goalIn);
  return {
    references: referencesValidator.validate(digest, contract).problems,
    limits: limitsValidator.validate(digest, contract).problems,
  };
};

describe('the document-digest validators', () => {
  it('[QL-40] a digest that places every section passes both, and a section may back several memories', () => {
    expect(problems(sampleDocumentDigest())).toEqual({ references: [], limits: [] });
    const [role, contact] = sampleDocumentDigest().memories;
    // One résumé paragraph states a title, an employer and a date range: three facts, one section.
    const shared = sampleDocumentDigest({
      memories: [
        role,
        { ...contact, evidence: ['section.2'] },
        { ...role, evidence: ['section.2'] },
      ],
      unused: ['section.1', 'section.3'],
    });
    expect(problems(shared)).toEqual({ references: [], limits: [] });
    expect(referencesValidator.gate).toBe('block');
    expect(limitsValidator.gate).toBe('block');
  });

  it('[QL-40] a section the chunk never held blocks, wherever it is placed', () => {
    const [role, contact] = sampleDocumentDigest().memories;
    const inMemory = sampleDocumentDigest({
      memories: [role, { ...contact, evidence: ['section.1', 'section.9'] }],
    });
    expect(problems(inMemory).references).toEqual([
      {
        severity: 'critical',
        locationRefs: ['memory.2'],
        message: 'section.9 is not a listed section',
      },
    ]);
    const inUnused = sampleDocumentDigest({ unused: ['section.3', 'section.9'] });
    expect(problems(inUnused).references).toEqual([
      { severity: 'critical', locationRefs: [], message: 'section.9 is not a listed section' },
    ]);
  });

  it('[QL-40] a section both cited and listed as unused is a contradiction, and one listed as unused twice is too', () => {
    expect(
      problems(sampleDocumentDigest({ unused: ['section.2', 'section.3'] })).references,
    ).toEqual([
      {
        severity: 'critical',
        locationRefs: ['section.2'],
        message: 'section.2 is both cited and listed as unused',
      },
    ]);
    expect(
      problems(sampleDocumentDigest({ unused: ['section.3', 'section.3'] })).references,
    ).toEqual([
      {
        severity: 'critical',
        locationRefs: ['section.3'],
        message: 'section.3 is listed as unused more than once',
      },
    ]);
  });

  it('[QL-40] a section left unplaced, or more memories than the limit, blocks', () => {
    expect(problems(sampleDocumentDigest({ unused: [] })).limits).toEqual([
      {
        severity: 'high',
        locationRefs: [],
        message: 'section.3 is neither cited nor listed as unused',
      },
    ]);
    const tighter = goal.replace('"maxMemories":3', '"maxMemories":1');
    expect(tighter).not.toBe(goal);
    expect(problems(sampleDocumentDigest(), tighter).limits).toEqual([
      { severity: 'high', locationRefs: [], message: '2 memories proposed; the limit is 1' },
    ]);
  });

  it('[QL-40] a goal without an index blocks once; an ill-formed artifact is left to the schema validator', () => {
    expect(problems(sampleDocumentDigest(), 'Just a document.')).toEqual({
      references: [
        {
          severity: 'critical',
          locationRefs: [],
          message: 'the goal carries no document-digest index',
        },
      ],
      limits: [],
    });
    const broken = { summary: 'x' } as unknown as DocumentDigest;
    expect(problems(broken)).toEqual({ references: [], limits: [] });
  });
});
