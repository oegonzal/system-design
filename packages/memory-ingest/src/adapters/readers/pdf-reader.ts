import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import type { TextItem, TextMarkedContent } from 'pdfjs-dist/types/src/display/api';

import type { DocumentReader } from '../../core/ports';
import { pageText, type PositionedText } from './pdf-blocks';

/** Pages are joined with form feeds, so the chunker reads a page break as a paragraph break. */
export const PAGE_SEPARATOR = '\f';

/** A text item, as against the marked-content markers the engine lists beside them. */
const isTextItem = (item: TextItem | TextMarkedContent): item is TextItem => 'str' in item;

const positioned = (item: TextItem): PositionedText => {
  const matrix = item.transform as number[];
  return {
    text: item.str,
    x: matrix[4] ?? 0,
    y: matrix[5] ?? 0,
    // The height the engine reports, else the font matrix's vertical scale.
    height: item.height > 0 ? item.height : Math.hypot(matrix[2] ?? 0, matrix[3] ?? 0),
    font: item.fontName,
  };
};

/**
 * A PDF's text layer, page by page, read from the engine's positioned items
 * and cut into blocks by the page's own geometry (`pdf-blocks.ts`), so the
 * chunker sees a heading, an employer line and a bullet as the separate
 * things the layout made them. The engine is an ES module loaded on first
 * use; its worker is pointed at the engine's own file, so nothing is
 * downloaded and no fake-worker warning is printed. A PDF with no text layer
 * reads as empty, which the ingest reports rather than guesses at.
 */
export const pdfReader: DocumentReader = {
  async read(path: string): Promise<string> {
    const engine = await import('pdfjs-dist/legacy/build/pdf.mjs');
    engine.GlobalWorkerOptions.workerSrc ||= pathToFileURL(
      require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs'),
    ).href;
    const document = await engine.getDocument({
      data: new Uint8Array(await readFile(path)),
      useSystemFonts: true,
      isEvalSupported: false,
      disableFontFace: true,
    }).promise;
    try {
      const pages: string[] = [];
      for (let number = 1; number <= document.numPages; number += 1) {
        const page = await document.getPage(number);
        const content = await page.getTextContent();
        pages.push(pageText(content.items.filter(isTextItem).map(positioned)));
      }
      return pages.join(PAGE_SEPARATOR);
    } finally {
      await document.destroy();
    }
  },
};
