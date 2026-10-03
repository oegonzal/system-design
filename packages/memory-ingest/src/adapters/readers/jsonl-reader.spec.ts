import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { chunkDocument, CONTEXT_SEPARATOR, PARTS_PER_CHUNK } from '../../core/chunk';
import {
  demoteHeadings,
  EmptyDocument,
  jsonlReader,
  jsonlText,
  JSONL_RECORD_FIELDS,
  MalformedRecord,
  qualifierLabel,
  stringAt,
  UnreadableRecord,
  type JsonlRecordFields,
} from './jsonl-reader';

/** A record in the shape the career corpus writes: prose under `text`, everything else under `metadata`. */
const record = (title: string, text: string, evidence = 'resume_reported'): string =>
  JSON.stringify({
    id: title.toLowerCase().replace(/\W+/g, '-'),
    text,
    metadata: { title, evidence_status: evidence, career_usage: 'preserve_qualifiers' },
  });

const PATH = '/corpus/records.jsonl';

describe('jsonl reader', () => {
  it('[ING-2] writes each record as a titled section whose heading carries the record’s own qualifiers', () => {
    const text = jsonlText(record('Backend services', 'Oscar built the gateway.'), PATH);
    expect(text).toBe(
      '# Backend services — evidence status: resume_reported · career usage: preserve_qualifiers\n\n' +
        'Oscar built the gateway.',
    );
    // A record no qualifier key matches is titled by its heading alone, with no dangling dash.
    expect(jsonlText(JSON.stringify({ text: 'body', title: 'Plain' }), PATH)).toBe(
      '# Plain\n\nbody',
    );
    // Records are apart by a blank line, which is what the chunker reads as a part break.
    const two = jsonlText(`${record('One', 'first')}\n\n${record('Two', 'second')}\n`, PATH);
    expect(two.split('\n\n')).toHaveLength(4);
  });

  it('[ING-2] carries the qualifier into every chunk of a record, including one that begins mid-record', () => {
    // Two records whose prose is long enough that the pack must cut inside one.
    const paragraphs = (n: number, word: string): string =>
      Array.from(
        { length: n },
        (_, i) => `${word} paragraph ${i + 1}. ${'detail '.repeat(20)}`,
      ).join('\n\n');
    const text = jsonlText(
      `${record('Agent engine', paragraphs(12, 'Engine'), 'discussed_design_not_verified_deployment')}\n` +
        `${record('Backend services', paragraphs(12, 'Backend'))}\n`,
      PATH,
    );
    const { chunks } = chunkDocument({
      text,
      kind: 'notes',
      title: 'records.jsonl',
      subject: 'Oscar Gonzalez-Barrios',
      date: '2026-10-02',
      partsPerChunk: PARTS_PER_CHUNK,
      chunkBytes: 3000,
    });
    // 26 parts over two records: the pack's 8-part ceiling must cut inside one.
    expect(chunks.length).toBeGreaterThan(3);
    // Every chunk either opens with the record's own heading or names it as context —
    // so a fact's qualifier is never out of the digest's sight.
    for (const { chunk } of chunks) {
      const opensWithHeading = (chunk.parts[0] ?? '').startsWith('# ');
      const named = `${chunk.context ?? ''}${opensWithHeading ? (chunk.parts[0] as string) : ''}`;
      expect(named).toContain('evidence status:');
    }
    // And never another record's qualifier. A record is nested under no other:
    // the chunker splices its heading path at `level - 1`, so records written
    // one level too deep leave the first record pinned above every later one,
    // and a design-only record's marking would be stamped on 67 other records'
    // facts. One heading per context, and one qualifier named per chunk.
    for (const { chunk } of chunks) {
      if (chunk.context !== null) {
        expect(chunk.context.split(CONTEXT_SEPARATOR)).toHaveLength(1);
      }
      const named = `${chunk.context ?? ''}${chunk.parts[0] ?? ''}`;
      const qualifiers = ['discussed_design_not_verified_deployment', 'resume_reported'];
      expect(qualifiers.filter((q) => named.includes(q))).toHaveLength(1);
    }
    // Both records are represented across the chunks, so the check above is not vacuous.
    const all = chunks
      .map(({ chunk }) => `${chunk.context ?? ''}${chunk.parts[0] ?? ''}`)
      .join('|');
    expect(all).toContain('discussed_design_not_verified_deployment');
    expect(all).toContain('resume_reported');
  });

  it('[ING-2] pushes a record’s own headings below its title, so a record can never reset the heading path', () => {
    expect(demoteHeadings('# Top\ntext\n### Deep', 1)).toBe('## Top\ntext\n#### Deep');
    // Markdown bottoms out at six: a heading already there stays there.
    expect(demoteHeadings('##### Five\n###### Six', 2)).toBe('###### Five\n###### Six');
    // A hash that is not a heading is prose and is left alone.
    expect(demoteHeadings('#nothash\n#', 1)).toBe('#nothash\n#');
    const text = jsonlText(JSON.stringify({ title: 'R', text: '# Own\n\nbody' }), PATH);
    expect(text).toBe('# R\n\n## Own\n\nbody');
  });

  it('[ING-2] refuses a record it cannot read, by name, and never skips one', async () => {
    expect(() => jsonlText('{not json}', PATH)).toThrow(MalformedRecord);
    expect(() => jsonlText('{not json}', PATH)).toThrow(`${PATH}:1: not JSON`);
    // The line number is the line in the file, counted through blank lines.
    expect(() => jsonlText(`${record('A', 'a')}\n\nnope`, PATH)).toThrow(`${PATH}:3:`);

    expect(() => jsonlText(JSON.stringify({ title: 'A', text: '   ' }), PATH)).toThrow(
      UnreadableRecord,
    );
    expect(() => jsonlText(JSON.stringify({ title: 'A' }), PATH)).toThrow(
      `${PATH}:1: no text — none of text, content, body holds a non-empty string on this record`,
    );
    expect(() => jsonlText(JSON.stringify({ text: 'body' }), PATH)).toThrow(
      'no heading — none of metadata.title, title, metadata.topic, id',
    );
    // A file of only blank lines holds no records, and says so rather than chunking to nothing.
    expect(() => jsonlText('\n  \n', PATH)).toThrow(EmptyDocument);
    expect(() => jsonlText('', PATH)).toThrow(`${PATH}: holds no JSON Lines records`);
  });

  it('[ING-2] reads its keys from a declared map, so another corpus is a map and not new code', async () => {
    const fields: JsonlRecordFields = {
      text: ['payload.prose'],
      heading: ['payload.name'],
      qualifiers: ['payload.maturity'],
    };
    const line = JSON.stringify({ payload: { prose: 'body', name: 'Thing', maturity: 'planned' } });
    expect(jsonlText(line, PATH, fields)).toBe('# Thing — maturity: planned\n\nbody');
    // The shipped map does not read that corpus, and refuses it rather than guessing.
    expect(() => jsonlText(line, PATH)).toThrow(UnreadableRecord);
    expect(qualifierLabel('metadata.evidence_status')).toBe('evidence status');

    // Dotted lookup walks objects only, and takes nothing but a non-empty string.
    expect(stringAt({ a: { b: 'x' } }, 'a.b')).toBe('x');
    expect(stringAt({ a: { b: ' ' } }, 'a.b')).toBeUndefined();
    expect(stringAt({ a: 1 }, 'a.b')).toBeUndefined();
    expect(stringAt({ a: null }, 'a.b')).toBeUndefined();
    // An array is an object, so a dotted path indexes one; a key no object holds is nothing.
    expect(stringAt({ a: ['x'] }, 'a.0')).toBe('x');
    expect(stringAt({ a: ['x'] }, 'a.1')).toBeUndefined();
    expect(JSONL_RECORD_FIELDS.qualifiers).toContain('metadata.career_usage');
  });

  it('[ING-2] reads the file from disk through the port', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'memory-ingest-jsonl-'));
    try {
      const path = join(dir, 'records.jsonl');
      await writeFile(path, `${record('One', 'first')}\n`, 'utf8');
      expect(await jsonlReader().read(path)).toContain('# One — evidence status: resume_reported');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
