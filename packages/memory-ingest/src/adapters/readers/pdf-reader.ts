import { readFile } from 'node:fs/promises';

import { PDFParse } from 'pdf-parse';

import type { DocumentReader } from '../../core/ports';

/** Pages are joined with form feeds, so the chunker reads a page break as a paragraph break. */
export const PAGE_SEPARATOR = '\f';

/**
 * A PDF's text layer, page by page, through `pdf-parse`. Nothing is inferred
 * about the layout beyond what the library reports as lines; a PDF with no
 * text layer reads as empty, which the ingest reports rather than guesses at.
 */
export const pdfReader: DocumentReader = {
  async read(path: string): Promise<string> {
    const parser = new PDFParse({ data: await readFile(path) });
    try {
      const result = await parser.getText();
      return result.pages.map((page) => page.text).join(PAGE_SEPARATOR);
    } finally {
      await parser.destroy();
    }
  },
};
