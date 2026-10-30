import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  FIELD_TYPES,
  fieldTypeOf,
  type EvidenceItem,
  type FieldType,
  type MemoryRecordDto,
} from '@sysdesign/contracts';
import { makeRunStamp } from '@sysdesign/run-dump';

import type { RecallReport } from '../../core/ports';
import type { RecordedField, RecordedStep } from './replay-fields-dumps';
import {
  citedFound,
  citedMatchOf,
  csvLine,
  foldWhitespace,
  verdictOf,
  type CitedMatch,
  type CsvCell,
  type KnownAnswers,
} from './replay-fields-measure';
import type { JudgedPage } from './replay-fields-page';

/**
 * What the replay writes: one row per recorded field, in the columns the
 * acceptance table reads, and the breakdowns the report file holds beside the
 * summary — by field type, by register, by origin — so textarea fields and
 * taught and ingested evidence read apart. Pure over what each page replayed.
 */

/** One page replayed: what was recorded for it, what was recalled now, and what the judge made of it. */
export interface PageReplay {
  step: RecordedStep;
  /** The evidence the recorded run was given; null when the loop no longer holds the run, or the step had none. */
  recorded: EvidenceItem[] | null;
  evidence: EvidenceItem[];
  /** The record behind each item of the evidence, in the same order, as the recall answered it. */
  records: MemoryRecordDto[];
  recall: RecallReport;
  /** Recalled records whose own scope leaks past the page's, counted. */
  leaks: { unit: number; tenant: number };
  judged: JudgedPage | null;
}

const ROWS_FILE = 'rows.csv';
const REPORT_FILE = 'report.json';

/** The columns, in the order the acceptance table reads them; the leak and latency columns are the page's, repeated on each of its fields. */
const COLUMNS = [
  'session',
  'step',
  'ref',
  'question',
  'fieldType',
  'unit',
  'recordedRoute',
  'recordedSource',
  'recordedRests',
  'recordedAdmission',
  'recordedCited',
  'recordedValue',
  'recordedOperatorAnswer',
  'newEvidence',
  'citedFound',
  'citedEqual',
  'citedByIdentity',
  'citedContained',
  'citedMissing',
  'newOnly',
  'unitLeak',
  'tenantLeak',
  'recallLatencyMs',
  'requests',
  'newRoute',
  'newSource',
  'newValue',
  'newAdmission',
  'newWithheld',
  'verdict',
] as const;
type Row = Readonly<Record<(typeof COLUMNS)[number], CsvCell>>;

/** The operator's answer a judged value is held to: this step's own, else the one on record for the question in the page's unit, or the subject's. */
const knownAnswerOf = (
  field: RecordedField,
  page: RecordedStep,
  known: KnownAnswers,
): string | null =>
  field.operatorAnswer ??
  (field.question === null
    ? null
    : known.for(field.question, page.task?.unitKey ?? null, field.about));

/** The recorded evidence texts a field's answer cited. */
const citedTextsOf = (field: RecordedField, recorded: readonly EvidenceItem[]): string[] =>
  field.cited.flatMap((alias) =>
    recorded.filter((item) => item.alias === alias).map((item) => item.text),
  );

/** How many of the cited texts each rule found, and how many were found by any. */
interface CitedCounts {
  found: number;
  equal: number;
  identity: number;
  contained: number;
}

const citedCountsOf = (matches: readonly CitedMatch[]): CitedCounts => ({
  found: matches.filter(citedFound).length,
  equal: matches.filter((match) => match.equal).length,
  identity: matches.filter((match) => match.identity).length,
  contained: matches.filter((match) => match.contained).length,
});

/**
 * One page's rows. A cited text is found when any of the declared rules finds
 * it among what was recalled now (`citedMatchOf`), each rule counted apart; a
 * page whose recorded run the loop no longer holds compares nothing, and its
 * cited columns stay empty. The judged columns are empty for a page that was
 * not judged.
 */
export function rowsOf(page: PageReplay, known: KnownAnswers): Row[] {
  const newTexts = new Set(page.evidence.map((item) => foldWhitespace(item.text)));
  const recordedTexts =
    page.recorded === null ? null : new Set(page.recorded.map((item) => foldWhitespace(item.text)));
  const newOnly =
    recordedTexts === null
      ? null
      : page.evidence.filter((item) => !recordedTexts.has(foldWhitespace(item.text))).length;
  return page.step.fields.map((field, position) => {
    const cited =
      page.recorded === null
        ? null
        : citedCountsOf(
            citedTextsOf(field, page.recorded).map((text) =>
              citedMatchOf(text, page.records, newTexts),
            ),
          );
    const knownAnswer = knownAnswerOf(field, page.step, known);
    const readout = page.judged?.readouts[position] ?? null;
    return {
      session: page.step.sessionId,
      step: page.step.step,
      ref: field.field.ref,
      question: field.question,
      fieldType: fieldTypeOf(field.field),
      unit: page.step.task?.unitKey ?? null,
      recordedRoute: field.route,
      recordedSource: field.source,
      recordedRests: field.rests,
      recordedAdmission: page.step.admission,
      recordedCited: field.cited.join(' '),
      recordedValue: field.value,
      recordedOperatorAnswer: knownAnswer,
      newEvidence: page.evidence.length,
      citedFound: cited?.found ?? null,
      citedEqual: cited?.equal ?? null,
      citedByIdentity: cited?.identity ?? null,
      citedContained: cited?.contained ?? null,
      citedMissing:
        cited === null || page.recorded === null
          ? null
          : citedTextsOf(field, page.recorded).length - cited.found,
      newOnly,
      unitLeak: page.leaks.unit,
      tenantLeak: page.leaks.tenant,
      recallLatencyMs: page.recall.latencyMs,
      requests: page.recall.requests,
      newRoute: readout?.route ?? null,
      newSource: readout?.source ?? null,
      newValue: readout?.value ?? null,
      newAdmission: page.judged?.admission ?? null,
      newWithheld: readout === null ? null : readout.withheld.length,
      verdict:
        readout === null ? null : verdictOf(field.route, readout.route, readout.value, knownAnswer),
    };
  });
}

export const count = <T>(items: readonly T[], test: (item: T) => boolean): number =>
  items.filter(test).length;

/** The numbers among the cells, added; an empty cell counts nothing. */
export const sum = (values: readonly CsvCell[]): number =>
  values.reduce<number>((total, value) => total + (typeof value === 'number' ? value : 0), 0);

interface FieldTypeCounts {
  fields: number;
  cited: number;
  citedFound: number;
}

/** Per field type, how many fields were replayed and how their cited evidence fared — the textarea fields read apart, as the acceptance asks. */
export function byFieldType(rows: readonly Row[]): Record<FieldType, FieldTypeCounts> {
  const table = Object.fromEntries(
    FIELD_TYPES.map((type) => [type, { fields: 0, cited: 0, citedFound: 0 }]),
  ) as Record<FieldType, FieldTypeCounts>;
  for (const row of rows) {
    const cell = table[row.fieldType as FieldType];
    cell.fields += 1;
    cell.cited += sum([row.citedFound, row.citedMissing]);
    cell.citedFound += sum([row.citedFound]);
  }
  return table;
}

/** How often each value of one item field was recalled over every page — by register, by origin — so taught and ingested evidence read apart. */
export function countedBy(
  pages: readonly PageReplay[],
  of: (item: EvidenceItem) => string,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of pages.flatMap((page) => page.evidence)) {
    counts[of(item)] = (counts[of(item)] ?? 0) + 1;
  }
  return counts;
}

/** The rows and the report written under a folder stamped by the clock; where they landed. */
export async function writeReplay(
  out: string,
  now: Date,
  rows: readonly Row[],
  detail: unknown,
): Promise<string> {
  const outDir = join(out, makeRunStamp(now.getTime()));
  await mkdir(outDir, { recursive: true });
  const lines = [
    csvLine(COLUMNS),
    ...rows.map((row) => csvLine(COLUMNS.map((column) => row[column]))),
  ];
  await writeFile(join(outDir, ROWS_FILE), `${lines.join('\n')}\n`);
  await writeFile(join(outDir, REPORT_FILE), `${JSON.stringify(detail, null, 2)}\n`);
  return outDir;
}
