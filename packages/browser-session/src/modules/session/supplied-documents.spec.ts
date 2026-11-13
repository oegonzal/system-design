import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import type { SessionFiles } from '../../core/ports';
import { SessionRefused } from '../../core/unit-advice';
import { checkingDocuments, presentDocuments } from './supplied-documents';

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

  it('[BRW-32] [BRW-26] looks for the supplied files only once the files beyond this machine are in place: one those files write passes, one still missing refuses by name, and the rest of the port passes through', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'browser-session-docs-'));
    try {
      const written = join(dir, 'Resume.pdf');
      const calls: string[] = [];
      const files: SessionFiles = {
        async profile(name) {
          calls.push(`profile ${name}`);
          return { kind: 'none' };
        },
        async saveProfile(name) {
          calls.push(`saveProfile ${name}`);
        },
        async documents() {
          calls.push('documents');
          writeFileSync(written, '%PDF');
        },
      };
      const checking = checkingDocuments(files, [{ name: 'resume', path: written }]);
      await expect(checking.documents()).resolves.toBeUndefined();
      await expect(checking.profile('p')).resolves.toEqual({ kind: 'none' });
      await checking.saveProfile('p');
      expect(calls).toEqual(['documents', 'profile p', 'saveProfile p']);

      const missing = join(dir, 'missing.pdf');
      const refusing = checkingDocuments(files, [{ name: 'cover-letter', path: missing }]);
      await expect(refusing.documents()).rejects.toThrow(
        `document cover-letter: no file at ${missing}`,
      );
      // The files were asked first: a bucket's documents are written before any is looked for.
      expect(calls).toEqual(['documents', 'profile p', 'saveProfile p', 'documents']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
