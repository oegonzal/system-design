import { describe, expect, it } from 'vitest';

import { transcriptMarkdown } from './markdown-transcript';

describe('transcriptMarkdown', () => {
  it('[UX-27] lists the phases with their times and every turn in order, with what an interviewer turn disclosed', () => {
    const markdown = transcriptMarkdown({
      version: 1,
      phases: [
        {
          id: 'clarify',
          startedAt: '2026-10-20T10:00:00.000Z',
          endedAt: '2026-10-20T10:09:00.000Z',
        },
        { id: 'design', startedAt: '2026-10-20T10:09:00.000Z', endedAt: null },
      ],
      turns: [
        { role: 'candidate', phase: 'clarify', text: 'How fast must reads be?' },
        {
          role: 'interviewer',
          phase: 'clarify',
          text: 'Within 300 ms at p99.',
          disclosesCriterionIds: ['c3'],
        },
      ],
    });
    expect(markdown).toContain('| clarify | 2026-10-20T10:00:00.000Z | 2026-10-20T10:09:00.000Z |');
    expect(markdown).toContain('| design | 2026-10-20T10:09:00.000Z | — |');
    expect(markdown).toContain('1. **candidate** (clarify): How fast must reads be?');
    expect(markdown).toContain(
      '2. **interviewer** (clarify): Within 300 ms at p99. _(discloses c3)_',
    );
    expect(transcriptMarkdown({ version: 1, phases: [], turns: [] })).toContain('_None._');
  });
});
