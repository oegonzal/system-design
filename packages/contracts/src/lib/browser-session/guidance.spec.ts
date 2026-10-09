import { describe, expect, it } from 'vitest';

import {
  DOCUMENT_MAX_PARTS,
  documentChunkSchema,
  readDocumentIndex,
  renderDocumentGoal,
} from '../quality-loop/document-digest';
import { guidanceDocument, renderGuidanceSection, type OperatorGuidanceDto } from './guidance';

const item = (overrides: Partial<OperatorGuidanceDto> = {}): OperatorGuidanceDto => ({
  sessionId: 'session-1',
  capturedAt: '2026-10-02T21:15:00.000Z',
  field: {
    label: 'Years of experience with Python',
    question: 'Whole years, professional only.',
    type: 'number',
    options: null,
  },
  context: { taskLabel: 'Senior Engineer at Acme', page: 'Additional questions' },
  answer: '6',
  ...overrides,
});

describe('guidance', () => {
  it('[QL-40] renders one answer as one section that names the field, the question, the unit of work and the day', () => {
    expect(renderGuidanceSection(item())).toBe(
      'Form field "Years of experience with Python" — Whole years, professional only. in the unit of work "Senior Engineer at Acme" (Additional questions), 2026-10-02: the operator answered "6".',
    );
    expect(
      renderGuidanceSection(
        item({
          field: { label: 'Authorised?', question: null, type: 'select', options: ['Yes', 'No'] },
          context: { taskLabel: null, page: null },
          answer: 'Yes',
        }),
      ),
    ).toBe('Form field "Authorised?", offering Yes | No, 2026-10-02: the operator answered "Yes".');
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

  it('[QL-40] takes at most the part cap and never fewer than one memory', () => {
    const many = Array.from({ length: DOCUMENT_MAX_PARTS + 5 }, () => item());
    expect(guidanceDocument('s', 'Alex', many, null).parts).toHaveLength(DOCUMENT_MAX_PARTS);
    expect(guidanceDocument('s', 'Alex', [], null).maxMemories).toBe(1);
  });
});
