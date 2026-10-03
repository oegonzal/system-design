import { extname } from 'node:path';

import type { DocumentReader } from '../../core/ports';
import { markdownReader } from './markdown-reader';
import { pdfReader } from './pdf-reader';

/**
 * Which reader reads which file, by extension, as a declared table. An
 * extension the table does not name is refused by name — never sniffed,
 * never read as text on the chance it is.
 */
export const READERS: Readonly<Record<string, DocumentReader>> = {
  '.pdf': pdfReader,
  '.md': markdownReader,
  '.markdown': markdownReader,
  '.txt': markdownReader,
};

export class UnsupportedDocument extends Error {
  override readonly name = 'UnsupportedDocument';
  constructor(
    readonly path: string,
    readonly extension: string,
    readers: Readonly<Record<string, DocumentReader>>,
  ) {
    super(
      `${path}: no reader for ${extension === '' ? 'a file without an extension' : `"${extension}"`} — readers exist for ${Object.keys(readers).join(', ')}`,
    );
  }
}

/** One reader over the table: dispatches on the extension, or refuses. */
export const tableReader = (readers = READERS): DocumentReader => ({
  read(path: string): Promise<string> {
    const extension = extname(path).toLowerCase();
    const reader = Object.hasOwn(readers, extension) ? readers[extension] : undefined;
    if (reader === undefined) {
      return Promise.reject(new UnsupportedDocument(path, extension, readers));
    }
    return reader.read(path);
  },
});
