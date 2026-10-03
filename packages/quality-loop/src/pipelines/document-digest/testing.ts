/**
 * Builders the document-digest specs share. Pure helpers only — no vitest
 * imports — so the file compiles under the app tsconfig. The goal is the
 * contracts résumé chunk rendered with the contracts codec, exactly as the
 * ingester renders one; the digest is the two facts it states plus the
 * section no fact rests on.
 */
import {
  DOCUMENT_MAX_MEMORIES,
  DOCUMENT_MAX_PARTS,
  DOCUMENT_PART_MAX_LENGTH,
  renderDocumentGoal,
  resumeChunk,
  type DocumentChunk,
  type SuccessCriterion,
} from '@sysdesign/contracts';

import { fill } from '../../core/testing';
import type { DocumentDigest } from './output';

/** The résumé chunk as the ingester hands it over. */
export const documentGoal = (chunk: DocumentChunk = resumeChunk()): string =>
  renderDocumentGoal(chunk);

export const sampleDocumentDigest = (overrides: Partial<DocumentDigest> = {}): DocumentDigest => ({
  summary:
    'One page of a résumé: where the subject lives and how to reach them, one senior engineering role with its dates and stack, and a degree.',
  memories: [
    {
      kind: 'profile_fact' as const,
      evidence: ['section.2'],
      insight:
        'Alex Example worked as a Senior Software Engineer at Acme from 2020 to 2026, building TypeScript services on AWS Lambda and leading the move to event-driven order processing.',
      appliesWhen:
        'a form asks for the most recent employer, job title and employment dates, or how many years of TypeScript or AWS experience the applicant has',
    },
    {
      kind: 'profile_fact' as const,
      evidence: ['section.1'],
      insight: 'Alex Example lives in Lisbon, Portugal and can be reached at alex@example.test.',
      appliesWhen: "a form asks for the applicant's city, country of residence or email address",
    },
  ],
  unused: ['section.3'],
  ...overrides,
});

/** The rubric the deriver writes for the résumé chunk: one fact, one rule. */
export const documentCriteria = (): SuccessCriterion[] => [
  {
    id: 'c1',
    kind: 'fact',
    statement:
      'Captures the role in section.2: Senior Software Engineer at Acme, 2020–2026, TypeScript services on AWS Lambda.',
  },
  {
    id: 'c2',
    kind: 'rule',
    statement: 'Every memory states only what its cited sections state about the subject.',
  },
];

/** Every field at its cap: the render of this must stay under the goal budget. */
export const maximalChunk = (): DocumentChunk => ({
  kind: 'notes',
  title: fill(200, 't'),
  subject: fill(120, 's'),
  date: '2026-10-02',
  chunk: { index: 99, of: 99 },
  context: fill(300, 'c'),
  parts: Array.from({ length: DOCUMENT_MAX_PARTS }, () => fill(DOCUMENT_PART_MAX_LENGTH, 'p')),
  rules: Array.from({ length: 8 }, () => fill(300, 'r')),
  maxMemories: DOCUMENT_MAX_MEMORIES,
});
