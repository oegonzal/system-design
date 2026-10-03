import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { PAGE_SEPARATOR } from './pdf-reader';
import { READERS, tableReader, UnsupportedDocument } from './reader-table';

/**
 * A small PDF with one Helvetica line per page, built here so the PDF
 * reader is proven against bytes and not a fixture nobody can read.
 */
function pdfOf(pages: readonly string[]): Buffer {
  const objects: string[] = [];
  const add = (body: string): number => objects.push(body);
  const catalog = add('<< /Type /Catalog /Pages 2 0 R >>');
  const tree = add('(pages, filled below)');
  const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const kids = pages.map((text) => {
    const stream = `BT /F1 12 Tf 20 100 Td (${text}) Tj ET`;
    const contents = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    return add(
      `<< /Type /Page /Parent ${tree} 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${contents} 0 R >>`,
    );
  });
  objects[tree - 1] =
    `<< /Type /Pages /Kids [${kids.map((kid) => `${kid} 0 R`).join(' ')}] /Count ${kids.length} >>`;

  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(out, 'latin1'));
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) out += `${String(offset).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

describe('tableReader', () => {
  let dir: string;
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'memory-ingest-readers-'));
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('[ING-2] declares its readers by extension', () => {
    expect(Object.keys(READERS)).toEqual(['.pdf', '.md', '.markdown', '.txt']);
  });

  it('[ING-2] reads markdown and plain text verbatim, whatever the case of the extension', async () => {
    const reader = tableReader();
    const text = '# Title\r\n\r\n- item one  \n  trailing spaces kept\n';
    await writeFile(join(dir, 'notes.md'), text, 'utf8');
    await writeFile(join(dir, 'plain.txt'), 'just text', 'utf8');
    await writeFile(join(dir, 'LONG.MARKDOWN'), 'long form', 'utf8');
    expect(await reader.read(join(dir, 'notes.md'))).toBe(text);
    expect(await reader.read(join(dir, 'plain.txt'))).toBe('just text');
    expect(await reader.read(join(dir, 'LONG.MARKDOWN'))).toBe('long form');
  });

  it('[ING-2] reads a PDF page by page, the pages joined with form feeds', async () => {
    const path = join(dir, 'two-pages.pdf');
    await writeFile(path, pdfOf(['Page one text', 'Page two text']));
    const text = await tableReader().read(path);
    const pages = text.split(PAGE_SEPARATOR);
    expect(pages).toHaveLength(2);
    expect(pages[0]).toContain('Page one text');
    expect(pages[1]).toContain('Page two text');
  });

  it('[ING-2] refuses an extension the table does not name, by name, and never guesses', async () => {
    const reader = tableReader();
    const docx = join(dir, 'resume.docx');
    await writeFile(docx, 'not read', 'utf8');
    await expect(reader.read(docx)).rejects.toBeInstanceOf(UnsupportedDocument);
    await expect(reader.read(docx)).rejects.toThrow(
      `${docx}: no reader for ".docx" — readers exist for .pdf, .md, .markdown, .txt`,
    );
    await expect(reader.read(join(dir, 'README'))).rejects.toThrow(
      'no reader for a file without an extension',
    );
    // Refused before any read: the path need not exist.
    await expect(reader.read('/nowhere/file.rtf')).rejects.toThrow('no reader for ".rtf"');
  });

  it('[ING-2] takes another table, so a spec can prove the dispatch without the shipped readers', async () => {
    const reader = tableReader({ '.abc': { read: async (path) => `read ${path}` } });
    expect(await reader.read('/x/y.abc')).toBe('read /x/y.abc');
    await expect(reader.read('/x/y.md')).rejects.toThrow('readers exist for .abc');
  });
});
