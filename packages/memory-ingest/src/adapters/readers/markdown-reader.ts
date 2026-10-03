import { readFile } from 'node:fs/promises';

import type { DocumentReader } from '../../core/ports';

/** Markdown and plain text, verbatim: the chunker reads the structure itself. */
export const markdownReader: DocumentReader = {
  read: (path: string): Promise<string> => readFile(path, 'utf8'),
};
