import { describe, expect, it } from 'vitest';

import { MISSION_FIXTURE, MISSION_WITH_DOCUMENTS } from './fixtures';
import { DOCUMENTS_BOUND, documentNamesOf, MissionDocumentMalformed } from './mission-documents';

const withDocuments = (lines: string): string => `${MISSION_FIXTURE}\n\n## Documents\n\n${lines}\n`;

describe('the documents a mission declares', () => {
  it("[BRW-26] reads every bullet of the Documents section as a name — what the document is stays the mission's prose — and none from a mission without one", () => {
    expect(documentNamesOf(MISSION_FIXTURE)).toEqual([]);
    expect(documentNamesOf(MISSION_WITH_DOCUMENTS)).toEqual(['resume']);
    expect(
      documentNamesOf(
        withDocuments('- resume: the résumé.\n- cover-letter: a letter for this opening.'),
      ),
    ).toEqual(['resume', 'cover-letter']);
    // The section ends at the next heading; a blank line is not a document.
    expect(
      documentNamesOf(
        `${withDocuments('- resume: the résumé.')}\n## Afterword\n\n- portfolio: not a document\n`,
      ),
    ).toEqual(['resume']);
    // A bullet still has to say what the document is: a name alone is not a document.
    expect(() => documentNamesOf(withDocuments('- resume:'))).toThrow(MissionDocumentMalformed);
  });

  it('[BRW-26] refuses a name the grammar does not read, a name declared twice, and more documents than the bound, naming the line', () => {
    expect(() => documentNamesOf(withDocuments('- Resume: capitals'))).toThrow(
      MissionDocumentMalformed,
    );
    expect(() => documentNamesOf(withDocuments('- resume the résumé, no colon'))).toThrow(
      /not a document — expected `- <name>: <what it is>`.*: - resume the résumé, no colon/,
    );
    expect(() => documentNamesOf(withDocuments('- resume: one.\n- resume: twice.'))).toThrow(
      /declared once: - resume: twice\./,
    );
    const many = Array.from(
      { length: DOCUMENTS_BOUND.ceiling + 1 },
      (_, i) => `- d${i}: document ${i}.`,
    );
    expect(() => documentNamesOf(withDocuments(many.join('\n')))).toThrow();
  });
});
