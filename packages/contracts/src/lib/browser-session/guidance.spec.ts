import { describe, expect, it } from 'vitest';

import {
  DOCUMENT_MAX_PARTS,
  DOCUMENT_RULES,
  documentChunkSchema,
  readDocumentIndex,
  renderDocumentGoal,
} from '../quality-loop/document-digest';
import {
  GUIDANCE_RULE,
  guidanceDocument,
  operatorGuidanceSchema,
  renderGuidanceSection,
  type OperatorGuidanceDto,
} from './guidance';

const item = (overrides: Partial<OperatorGuidanceDto> = {}): OperatorGuidanceDto => ({
  sessionId: 'session-1',
  capturedAt: '2026-10-02T21:15:00.000Z',
  field: {
    question: 'Years of experience with Python. Whole years, professional only.',
    type: 'number',
    options: null,
  },
  context: { taskLabel: 'Senior Engineer at Acme', page: 'Additional questions' },
  answer: '6',
  chosen: null,
  ...overrides,
});

describe('guidance', () => {
  it('[QL-40] [BRW-17] renders one answer as one section: the question and the answer first, where and when it was asked after', () => {
    expect(renderGuidanceSection(item())).toBe(
      'Asked "Years of experience with Python. Whole years, professional only.", the subject answered "6". Asked on 2026-10-02 in the unit of work "Senior Engineer at Acme" (Additional questions).',
    );
    expect(
      renderGuidanceSection(
        item({
          field: { question: 'Authorised?', type: 'select', options: ['Yes', 'No'] },
          context: { taskLabel: null, page: null },
          answer: 'Yes',
        }),
      ),
    ).toBe(
      'Asked "Authorised?", offering Yes | No, the subject answered "Yes". Asked on 2026-10-02.',
    );
    // A drafted suggestion the operator chose is said so, for the digest to keep it whole; the record's own is not.
    expect(renderGuidanceSection(item({ chosen: 'invented' }))).toContain(
      ', choosing a drafted answer, the subject answered',
    );
    expect(renderGuidanceSection(item({ chosen: 'record' }))).not.toContain('drafted');
  });

  it('[BRW-17] takes only an item keyed by what its field asks', () => {
    expect(operatorGuidanceSchema.safeParse(item()).success).toBe(true);
    const keyless = { ...item(), field: { ...item().field, question: '' } };
    expect(operatorGuidanceSchema.safeParse(keyless).success).toBe(false);
  });

  it("[QL-40] composes a session's answers as a guidance chunk the document codec accepts and indexes", () => {
    const chunk = guidanceDocument(
      'session-1',
      'Alex Example',
      [item(), item({ answer: '7' })],
      '2026-10-02',
    );
    expect(documentChunkSchema.safeParse(chunk).success).toBe(true);
    expect(chunk.kind).toBe('guidance');
    expect(chunk.maxMemories).toBe(2);
    const index = readDocumentIndex(renderDocumentGoal(chunk));
    expect(index?.document.kind).toBe('guidance');
    expect(index?.evidence.map((e) => e.alias)).toEqual(['section.1', 'section.2']);
  });

  it("[QL-40] asks the digest for the subject's answer to its question, the question as the key, a scope, and provenance kept out of both", () => {
    const document = guidanceDocument('s', 'Alex', [item()], '2026-10-02');
    expect(document.rules).toEqual([...DOCUMENT_RULES, GUIDANCE_RULE]);
    expect(GUIDANCE_RULE).toMatch(/the question as quoted/);
    expect(GUIDANCE_RULE).toMatch(/scope is unit only when/);
    expect(GUIDANCE_RULE).toMatch(/where and when it was asked enters neither/);
    // The digest reads the rule where it reads every rule of the document.
    expect(renderDocumentGoal(document)).toContain(`- ${GUIDANCE_RULE}`);
  });

  it('[QL-40] takes at most the part cap and never fewer than one memory', () => {
    const many = Array.from({ length: DOCUMENT_MAX_PARTS + 5 }, () => item());
    expect(guidanceDocument('s', 'Alex', many, null).parts).toHaveLength(DOCUMENT_MAX_PARTS);
    expect(guidanceDocument('s', 'Alex', [], null).maxMemories).toBe(1);
  });
});
