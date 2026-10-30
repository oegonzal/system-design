import {
  composeFieldGoal,
  FIELD_ANSWER_PIPELINE_ID,
  fieldSpecOf,
  observedElement,
  type EvidenceItem,
} from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { readRecordedEvidenceItems } from './recorded-evidence';

/** One item as the loop's recall wrote it before the source was generalised: the recorded goals carry this shape. */
interface PreviousItem {
  alias: string;
  text: string;
  when: string;
  scope: 'subject' | 'unit';
  source: { runId: string; pipeline: string; ref: string; kind: string };
}

/**
 * The line the previous codec wrote for an item — copied from
 * `packages/contracts/src/lib/browser-session/field-goal.ts` at f93252b2
 * (`evidenceLine`), so the read is proven against the grammar the recorded
 * goals hold, not against a reading of it.
 */
const previousEvidenceLine = (item: PreviousItem): string =>
  `- [${item.alias}] ${item.source.kind} · ${item.scope} — ${item.text.trim()} · stored ${item.when} · ${item.source.pipeline} ${item.source.ref} (run ${item.source.runId})`;

const FIELD = fieldSpecOf(
  observedElement('e1', 'textbox', 'Work authorisation', { kind: 'fillable', inputType: 'text' }),
);
const KINDS = [
  { kind: 'profile_fact', use: 'one thing true of the subject' },
  { kind: 'standing_answer', use: "the subject's own answer to a question a form asked" },
];

const item = (alias: string, overrides: Partial<EvidenceItem> = {}): EvidenceItem => ({
  alias,
  text: 'Ada is authorised to work in the country without sponsorship.',
  when: '2026-10-03',
  scope: 'subject',
  kind: 'profile_fact',
  source: { origin: 'document-digest', ref: '2026-10-03T10-00-00-000-abcdef-quality#c3' },
  ...overrides,
});

const currentGoal = (evidence: readonly EvidenceItem[], unitKey?: string): string =>
  composeFieldGoal({
    pipeline: FIELD_ANSWER_PIPELINE_ID,
    prose: '# Mission\n\nAnswer the form.',
    fields: [FIELD],
    evidence,
    kinds: KINDS,
    ...(unitKey === undefined ? {} : { unitKey }),
  });

/** A goal as the previous codec wrote it: today's goal with each item line in the previous grammar. */
const previousGoal = (items: readonly PreviousItem[], unitKey?: string): string => {
  const lines = currentGoal(
    items.map((previous) =>
      item(previous.alias, {
        text: previous.text,
        when: previous.when,
        scope: previous.scope,
        kind: previous.source.kind,
        source: { origin: previous.source.pipeline, ref: 'x#y' },
      }),
    ),
    unitKey,
  ).split('\n');
  const byAlias = new Map(items.map((previous) => [previous.alias, previous]));
  return lines
    .map((line) => {
      const alias = /^- \[(m\d+)\] /.exec(line)?.[1];
      const previous = alias === undefined ? undefined : byAlias.get(alias);
      return previous === undefined ? line : previousEvidenceLine(previous);
    })
    .join('\n');
};

const PREVIOUS: PreviousItem[] = [
  {
    alias: 'm1',
    text: 'Ada is authorised to work in the country without sponsorship.',
    when: '2026-10-03',
    scope: 'subject',
    source: {
      runId: '2026-10-03T10-00-00-000-abcdef-quality',
      pipeline: 'document-digest',
      ref: 'c3',
      kind: 'profile_fact',
    },
  },
  {
    // A text holding the line's own separators and words still reads back whole.
    alias: 'm2',
    text: 'Asked "Do you know anyone here?" · stored twice, Ada answered "No".',
    when: '2026-10-12',
    scope: 'unit',
    source: {
      runId: '2026-10-12T09-00-00-000-123456-quality',
      pipeline: 'document-digest',
      ref: 'guidance-1',
      kind: 'standing_answer',
    },
  },
];

describe('readRecordedEvidenceItems', () => {
  it("reads a goal today's codec wrote by that codec", () => {
    const evidence = [item('m1'), item('m2', { scope: 'unit', kind: 'standing_answer' })];
    expect(readRecordedEvidenceItems(currentGoal(evidence, 'company=acme'))).toEqual(evidence);
    expect(readRecordedEvidenceItems(currentGoal([]))).toEqual([]);
  });

  it("reads a goal the previous codec wrote by its grammar, mapped onto today's shape", () => {
    expect(readRecordedEvidenceItems(previousGoal(PREVIOUS, 'company=acme'))).toEqual([
      {
        alias: 'm1',
        text: PREVIOUS[0]?.text,
        when: '2026-10-03',
        scope: 'subject',
        kind: 'profile_fact',
        source: {
          origin: 'document-digest',
          ref: '2026-10-03T10-00-00-000-abcdef-quality#c3',
        },
      },
      {
        alias: 'm2',
        text: PREVIOUS[1]?.text,
        when: '2026-10-12',
        scope: 'unit',
        kind: 'standing_answer',
        source: {
          origin: 'document-digest',
          ref: '2026-10-12T09-00-00-000-123456-quality#guidance-1',
        },
      },
    ]);
  });

  it('answers null for a goal no form codec wrote, and for one neither grammar reads whole', () => {
    expect(readRecordedEvidenceItems('# Mission\n\nNo index here.')).toBeNull();
    // A line the previous grammar does not read voids the read rather than half-reading it.
    const broken = previousGoal(PREVIOUS).replace(
      previousEvidenceLine(PREVIOUS[0] as PreviousItem),
      '- [m1] profile_fact · subject — a line with no tail',
    );
    expect(readRecordedEvidenceItems(broken)).toBeNull();
    // Lines that read but are not the items the index lists are refused the same way.
    const missing = previousGoal(PREVIOUS)
      .split('\n')
      .filter((line) => !line.startsWith('- [m2] '))
      .join('\n');
    expect(readRecordedEvidenceItems(missing)).toBeNull();
  });
});
