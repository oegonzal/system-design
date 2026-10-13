import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import type { DocumentWriter } from '../../core/ports';

/** A document on disk, its folder made first; an existing file is replaced whole. */
export const fsDocumentWriter: DocumentWriter = {
  async write(path: string, text: string): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, text, 'utf8');
  },
};
