import { describe, expect, it } from 'vitest';

import {
  DOCUMENT_MAX_MEMORIES,
  DOCUMENT_RULES,
  documentChunkSchema,
  readDocumentIndex,
  renderDocumentGoal,
} from '../quality-loop/document-digest';
import { stripIndexSection } from '../quality-loop/goal-index';
import {
  GUIDANCE_PROVENANCE_RULE,
  GUIDANCE_RULE,
  guidanceDocuments,
  operatorGuidanceSchema,
  renderGuidanceSection,
  type OperatorGuidanceDto,
} from './guidance';

/** The unit of work the fixture's answer was given in, as `unitKeyOf` names one declaring a company. */
const ACME = 'company=acme';

const item = (overrides: Partial<OperatorGuidanceDto> = {}): OperatorGuidanceDto => ({
  sessionId: 'session-1',
  capturedAt: '2026-10-02T21:15:00.000Z',
  field: {
    question: 'Years of experience with Python. Whole years, professional only.',
    type: 'number',
    options: null,
  },
  context: { taskLabel: 'Senior Engineer at Acme', unitKey: ACME, page: 'Additional questions' },
  answer: '6',
  about: 'subject',
  chosen: null,
  via: 'chat',
  ...overrides,
});

/** Each item as its own answer: what the session's teach hands the grouping. */
const documentsOf = (items: readonly OperatorGuidanceDto[], subject = 'Alex Example') =>
  guidanceDocuments('session-1', subject, items, (one) => one).map(({ document }) => document);

describe('guidance', () => {
  it('[QL-40] [BRW-17] [BRW-20] renders one answer as one section: the question and the answer first, where, when and on which channel it was asked after', () => {
    expect(renderGuidanceSection(item())).toBe(
      'Asked "Years of experience with Python. Whole years, professional only.", the subject answered "6". Asked on 2026-10-02 in the unit of work "Senior Engineer at Acme" (Additional questions); answered via chat.',
    );
    expect(
      renderGuidanceSection(
        item({
          field: { question: 'Authorised?', type: 'select', options: ['Yes', 'No'] },
          context: { taskLabel: null, unitKey: null, page: null },
          answer: 'Yes',
          via: 'terminal',
        }),
      ),
    ).toBe(
      'Asked "Authorised?", offering Yes | No, the subject answered "Yes". Asked on 2026-10-02; answered via terminal.',
    );
    // A drafted suggestion the operator chose is said so, for the digest to keep it whole; the record's own is not.
    expect(renderGuidanceSection(item({ chosen: 'invented' }))).toContain(
      ', choosing a drafted answer, the subject answered',
    );
    expect(renderGuidanceSection(item({ chosen: 'record' }))).not.toContain('drafted');
  });

  it('[BRW-17] [BRW-20] takes only an item keyed by what its field asks and naming the channel its answer came on', () => {
    expect(operatorGuidanceSchema.safeParse(item()).success).toBe(true);
    const keyless = { ...item(), field: { ...item().field, question: '' } };
    expect(operatorGuidanceSchema.safeParse(keyless).success).toBe(false);
    // An answer no channel vouches for is nobody's to teach: the channel is never null and never absent.
    const { via, ...unvouched } = item();
    void via;
    expect(operatorGuidanceSchema.safeParse(unvouched).success).toBe(false);
    expect(operatorGuidanceSchema.safeParse({ ...item(), via: null }).success).toBe(false);
    expect(operatorGuidanceSchema.safeParse({ ...item(), via: '' }).success).toBe(false);
  });

  it('[BRW-17] [QL-71] records the unit of work an answer was given in — null outside any, never absent — and keeps it out of the section the digest reads', () => {
    const outside = item({ context: { ...item().context, unitKey: null } });
    expect(operatorGuidanceSchema.safeParse(outside).success).toBe(true);
    const { unitKey, ...unnamed } = item().context;
    void unitKey;
    expect(operatorGuidanceSchema.safeParse({ ...item(), context: unnamed }).success).toBe(false);
    // Where it was given is provenance the digest never reads: the section is the same either way.
    expect(renderGuidanceSection(item())).toBe(renderGuidanceSection(outside));
    expect(renderGuidanceSection(item())).not.toContain(ACME);
  });

  it('[BRW-17] carries the scope the answerer declared the question holds in — null when no artifact answered the field, never absent — as data for whoever stores the answer, never in the section', () => {
    expect(operatorGuidanceSchema.safeParse(item({ about: 'unit' })).success).toBe(true);
    expect(operatorGuidanceSchema.safeParse(item({ about: null })).success).toBe(true);
    const { about, ...undeclared } = item();
    void about;
    expect(operatorGuidanceSchema.safeParse(undeclared).success).toBe(false);
    expect(operatorGuidanceSchema.safeParse({ ...item(), about: 'everywhere' }).success).toBe(
      false,
    );
    // The section is the same whatever the scope says: the digest reads the rules it is given, the teach reads the data.
    expect(renderGuidanceSection(item({ about: 'unit' }))).toBe(
      renderGuidanceSection(item({ about: null })),
    );
  });

  it("[QL-40] composes a session's answers as a guidance chunk the document codec accepts and indexes", () => {
    const [chunk] = documentsOf([item(), item({ answer: '7' })]);
    expect(documentChunkSchema.safeParse(chunk).success).toBe(true);
    expect(chunk.kind).toBe('guidance');
    expect(chunk.maxMemories).toBe(2);
    // Dated by the day its first answer was given.
    expect(chunk.date).toBe('2026-10-02');
    const index = readDocumentIndex(renderDocumentGoal(chunk));
    expect(index?.document.kind).toBe('guidance');
    expect(index?.evidence.map((e) => e.alias)).toEqual(['section.1', 'section.2']);
  });

  it('[QL-71] is one document per unit of work the answers were given in, and one for those given outside any — each naming its unit in the index alone, in the order given', () => {
    const globex = 'company=globex';
    const asked = [
      item({ answer: '1' }),
      item({ answer: '2', context: { ...item().context, unitKey: null } }),
      item({ answer: '3', context: { ...item().context, unitKey: globex } }),
      item({ answer: '4' }),
    ];
    const grouped = guidanceDocuments('session-1', 'Alex Example', asked, (one) => one);
    // Each document comes back with the answers it holds, so a caller links each one's rows.
    expect(grouped.map(({ answers }) => answers.map((one) => one.answer))).toEqual([
      ['1', '4'],
      ['2'],
      ['3'],
    ]);
    const documents = grouped.map(({ document }) => document);
    expect(documents.map((document) => document.unitKey)).toEqual([ACME, undefined, globex]);
    expect(documents[1]).not.toHaveProperty('unitKey');
    const named = renderDocumentGoal(documents[0]);
    expect(readDocumentIndex(named)?.document.unitKey).toBe(ACME);
    // The index is the only place it is written: no lens is told of it.
    expect(stripIndexSection(named)).not.toContain(ACME);
  });

  it("[QL-40] [BRW-20] asks the digest for the subject's answer to its question with the options it was chosen among, the question as the key, a scope, and provenance — where, when, on which channel — kept out of both", () => {
    const [document] = documentsOf([item()], 'Alex');
    expect(document.rules).toEqual([...DOCUMENT_RULES, GUIDANCE_RULE, GUIDANCE_PROVENANCE_RULE]);
    expect(GUIDANCE_RULE).toMatch(/the question as quoted/);
    expect(GUIDANCE_RULE).toMatch(/scope is unit only when/);
    expect(GUIDANCE_RULE).toMatch(/with the options it was chosen among/);
    expect(GUIDANCE_PROVENANCE_RULE).toMatch(/on which channel/);
    expect(GUIDANCE_PROVENANCE_RULE).toMatch(/enters neither the insight nor the appliesWhen/);
    // The digest reads the rules where it reads every rule of the document.
    expect(renderDocumentGoal(document)).toContain(`- ${GUIDANCE_RULE}`);
    expect(renderDocumentGoal(document)).toContain(`- ${GUIDANCE_PROVENANCE_RULE}`);
  });

  it('[QL-40] splits one unit’s answers past what one document’s memories hold, and makes no document of none', () => {
    const many = Array.from({ length: DOCUMENT_MAX_MEMORIES + 5 }, () => item());
    expect(documentsOf(many).map((document) => document.parts.length)).toEqual([
      DOCUMENT_MAX_MEMORIES,
      5,
    ]);
    expect(documentsOf(many).map((document) => document.maxMemories)).toEqual([
      DOCUMENT_MAX_MEMORIES,
      5,
    ]);
    expect(documentsOf([])).toEqual([]);
  });
});
