import { MISSION_FIXTURE, MISSION_WITH_DOCUMENTS } from '@sysdesign/contracts';

import { resolveDocuments } from './documents';
import { SessionRefused } from './unit-advice';

const RESUME = { name: 'resume', path: '/somewhere/resume.pdf' };

describe('the documents a run supplies', () => {
  it('[BRW-26] holds the supplied files to the declared documents: each declared one supplied, nothing undeclared, nothing twice', () => {
    expect(() => resolveDocuments(MISSION_WITH_DOCUMENTS, [RESUME])).not.toThrow();
    expect(() => resolveDocuments(MISSION_FIXTURE, [])).not.toThrow();
    expect(() => resolveDocuments(MISSION_WITH_DOCUMENTS, [])).toThrow(SessionRefused);
    expect(() => resolveDocuments(MISSION_WITH_DOCUMENTS, [])).toThrow(
      /declares the document resume and the run supplies no file for it/,
    );
    expect(() => resolveDocuments(MISSION_FIXTURE, [RESUME])).toThrow(
      /supplies resume, which the mission declares no document for — it declares none/,
    );
    expect(() =>
      resolveDocuments(MISSION_WITH_DOCUMENTS, [RESUME, { name: 'letter', path: '/x' }]),
    ).toThrow(/supplies letter, which the mission declares no document for — it declares resume/);
    expect(() => resolveDocuments(MISSION_WITH_DOCUMENTS, [RESUME, RESUME])).toThrow(
      /document resume is supplied twice/,
    );
  });
});
