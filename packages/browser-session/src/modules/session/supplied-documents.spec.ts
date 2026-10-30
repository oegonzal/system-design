import { resolve } from 'node:path';

import { SessionRefused } from '../../core/unit-advice';
import { presentDocuments } from './supplied-documents';

describe('the documents the command line supplies', () => {
  it('[BRW-26] resolves each file and refuses, before any row, a document whose file is not there', async () => {
    const seen: string[] = [];
    const present = async (path: string): Promise<boolean> => {
      seen.push(path);
      return !path.endsWith('missing.pdf');
    };
    await expect(
      presentDocuments([{ name: 'resume', path: 'docs/resume.pdf' }], present),
    ).resolves.toEqual([{ name: 'resume', path: resolve('docs/resume.pdf') }]);
    await expect(
      presentDocuments([{ name: 'cover-letter', path: 'docs/missing.pdf' }], present),
    ).rejects.toThrow(SessionRefused);
    await expect(
      presentDocuments([{ name: 'cover-letter', path: 'docs/missing.pdf' }], present),
    ).rejects.toThrow(`document cover-letter: no file at ${resolve('docs/missing.pdf')}`);
    expect(seen).toEqual([
      resolve('docs/resume.pdf'),
      resolve('docs/missing.pdf'),
      resolve('docs/missing.pdf'),
    ]);
    await expect(presentDocuments([], present)).resolves.toEqual([]);
  });
});
