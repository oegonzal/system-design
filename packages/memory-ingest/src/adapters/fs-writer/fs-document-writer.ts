import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import type { DocumentWriter } from '../../core/ports';

/** Documents on disk: one written has its folder made first and replaces a file there whole; one removed is unlinked. */
export const fsDocumentWriter: DocumentWriter = {
  async write(path: string, text: string): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, text, 'utf8');
  },

  async remove(path: string): Promise<boolean> {
    try {
      await unlink(path);
      return true;
    } catch (error) {
      // A path that holds no document has nothing to remove; any other failure is the caller's to see.
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw error;
    }
  },
};
