import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { resumeChunk } from '../browser-session/fixtures';
import {
  DOCUMENT_MAX_PARTS,
  DOCUMENT_PART_MAX_LENGTH,
  declaredScopeLimit,
  documentChunkSchema,
  isUnitBound,
  MEMORY_SCOPES,
  readDocumentIndex,
  renderDocumentGoal,
  DOCUMENT_RULES,
  DOCUMENT_MAX_MEMORIES,
  SCOPE_RULE,
  UNIT_BOUND_SCOPES,
  type DocumentChunk,
} from './document-digest';
import { documentDigestReportSchema } from './document-memory';
import {
  GOAL_BUDGET_BYTES,
  readFencedIndex,
  renderIndexSection,
  sectionAlias,
  stripIndexSection,
  textBytes,
} from './goal-index';
import { z } from 'zod';

/**
 * The bytes a document goal spends on itself — heading, rules, kind guidance,
 * limits and the index — before any section text. Pinned rather than derived, so
 * that growing it is a decision someone makes rather than a side effect they
 * ship; every byte here is a byte of content a chunk cannot carry.
 */
const FIXED_GOAL_BYTES = 2144;
/**
 * The smallest `--chunk-bytes` worth packing to; below half of it a chunk is
 * mostly instructions. Raised from 3200 on 2026-10-12, when the scope rule
 * added 165 bytes to the fixed text (1571 → 1736), and from 3600 to 4800 on
 * 2026-10-13, when the tenure and scope-test rules added 408 (1736 → 2144); the ingester's
 * default chunk is 6000, so a chunk packed to this floor is still two parts
 * content.
 */
const MIN_SENSIBLE_CHUNK_BYTES = 4800;

/**
 * A chunk that declares no scope, every other head field set, and the sha256
 * of its goal as rendered on 2026-10-13, before a document could declare one:
 * the ingester's manifest names a chunk by exactly this hash. Built here rather
 * than from a fixture, so editing a fixture never moves it. The rules are
 * `DOCUMENT_RULES`, as the ingester renders them, so editing a rule moves it —
 * and moves every recorded chunk's hash with it, which is a decision to make
 * on purpose.
 */
const UNDECLARED: DocumentChunk = {
  kind: 'notes',
  title: 'Standing answers',
  subject: 'Alex Example',
  date: '2026-03-01',
  chunk: { index: 2, of: 3 },
  context: 'Answers',
  parts: [
    'Alex Example has the right to work in Portugal.',
    'Alex Example answers No to whether he has worked for any organization other than Acme.',
  ],
  rules: [...DOCUMENT_RULES],
  maxMemories: 4,
};
const UNDECLARED_GOAL_SHA256 = '355fc5455c8dafa9d37d38c2237b5216dc314cd9d1e7bd4fde4e40d8407f9855';

const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

// The two lines that close the Limits: an undeclared goal's, and a declared one's, which names
// the store as what holds every memory to the declared scope.
const VALIDATED = '- Validators check these limits; they are not criteria.';
const HELD_BY_THE_STORE =
  '- The store keeps every memory under the declared scope, and validators check the other limits; they are not criteria.';

describe('renderDocumentGoal', () => {
  it('[QL-40] writes one aliased section per part and an index naming each as section evidence', () => {
    const chunk = resumeChunk();
    const goal = renderDocumentGoal(chunk);
    expect(goal).toContain('### [section.1]\n\nAlex Example — alex@example.test');
    const index = readDocumentIndex(goal);
    expect(index?.pipeline).toBe('document-digest');
    expect(index?.maxMemories).toBe(3);
    expect(index?.document).toEqual({
      kind: 'resume',
      title: 'Résumé',
      subject: 'Alex Example',
      date: '2026-03-01',
      chunk: { index: 1, of: 1 },
    });
    expect(index?.evidence).toEqual(
      chunk.parts.map((_, i) => ({
        alias: sectionAlias(i),
        kind: 'section',
        ref: sectionAlias(i),
      })),
    );
  });

  it('[QL-40] keeps the index last, so a part carrying its own fenced block does not disturb it', () => {
    const chunk = {
      ...resumeChunk(),
      parts: ['notes\n```json\n{"pipeline":"document-digest"}\n```'],
    };
    expect(readDocumentIndex(renderDocumentGoal(chunk))?.evidence).toHaveLength(1);
  });

  it('[QL-40] the goal\u2019s fixed text is pinned, because every byte of it is a byte of content a chunk cannot carry', () => {
    // The rules, the kind guidance and the limits render into every document goal
    // whatever it holds, so they come out of the `--chunk-bytes` budget the
    // ingester packs against. Measured 2026-10-03: the fourth rule and the
    // per-memory kind line together grew this from roughly 950 to 1573, which is
    // 26% of the ingester's default 6000 and cost about 12% more chunks per
    // document. That was bought deliberately. (1571 since 2026-10-08, when a
    // rule's role word gave way to "the subject".) What was missing is anything
    // noticing the next one — a rule or kind added without updating this number
    // surfaces as an unexplained rise in ingest cost, somewhere that does not
    // name the cause.
    // Built here rather than from a fixture: a fixture's own title, subject and
    // context would be counted as fixed text and would move this number whenever
    // someone edited the fixture. One character of each isolates what the codec
    // itself spends.
    const minimal = {
      kind: 'notes' as const,
      title: 't',
      subject: 's',
      date: null,
      chunk: { index: 1, of: 1 },
      context: null,
      parts: ['x'],
      rules: [...DOCUMENT_RULES],
      maxMemories: DOCUMENT_MAX_MEMORIES,
    };
    const fixed = textBytes(renderDocumentGoal(minimal)) - 1;
    expect(fixed).toBe(FIXED_GOAL_BYTES);
    // And it stays a minority of the smallest budget worth packing to, or a chunk
    // is mostly instructions — a document declaring its scope, its limit stated
    // in the scope test's place, too.
    expect(fixed).toBeLessThan(MIN_SENSIBLE_CHUNK_BYTES / 2);
    for (const scope of MEMORY_SCOPES) {
      expect(textBytes(renderDocumentGoal({ ...minimal, scope })) - 1).toBeLessThan(
        MIN_SENSIBLE_CHUNK_BYTES / 2,
      );
    }
  });

  it('[QL-69] a document that declares no scope renders byte for byte as before one could, so no chunk the ingester recorded is named anew', () => {
    const goal = renderDocumentGoal(UNDECLARED);
    expect(sha256(goal)).toBe(UNDECLARED_GOAL_SHA256);
    expect(readDocumentIndex(goal)?.document).not.toHaveProperty('scope');
  });

  it('[QL-69] a declared scope takes the scope test’s place: one limit every lens reads, one fact of the index, the store named where the limits close, and nothing else changed', () => {
    const undeclared = renderDocumentGoal(UNDECLARED);
    // Undeclared, the scope test is a rule like any other, and validators close the limits.
    expect(undeclared).toContain(`\n- ${SCOPE_RULE}\n`);
    expect(undeclared).toContain(`\n${VALIDATED}\n`);
    for (const scope of MEMORY_SCOPES) {
      const limit = declaredScopeLimit(scope);
      // The producer is told the scope to write; the judges, that it is not theirs to fault.
      expect(limit).toContain(`the scope ${scope}:`);
      expect(limit).toMatch(/the scope test does not apply/);
      expect(limit).toMatch(/no memory is faulted for its scope/);
      const goal = renderDocumentGoal({ ...UNDECLARED, scope });
      expect(goal).toContain(`\n${limit}\n`);
      // A limit, not a rule: the deriver writes no criterion from the Limits.
      expect(goal.indexOf(limit)).toBeGreaterThan(goal.indexOf('## Limits'));
      // The document decided what the scope test decides, so no rule states the test.
      expect(goal).not.toContain(SCOPE_RULE);
      // No validator checks the declaration: the store holds every memory to it, and the goal says so.
      expect(goal).toContain(`\n${HELD_BY_THE_STORE}\n`);
      expect(goal).not.toContain(VALIDATED);
      expect(readDocumentIndex(goal)?.document).toEqual({
        ...readDocumentIndex(undeclared)?.document,
        scope,
      });
      expect(
        stripIndexSection(goal).replace(`${limit}\n`, '').replace(HELD_BY_THE_STORE, VALIDATED),
      ).toBe(stripIndexSection(undeclared).replace(`- ${SCOPE_RULE}\n`, ''));
    }
    expect(documentChunkSchema.safeParse({ ...UNDECLARED, scope: 'subject' }).success).toBe(true);
    expect(documentChunkSchema.safeParse({ ...UNDECLARED, scope: 'everywhere' }).success).toBe(
      false,
    );
    // Absent is the only way to declare nothing: a null is refused, not read as undeclared.
    expect(documentChunkSchema.safeParse({ ...UNDECLARED, scope: null }).success).toBe(false);
  });

  it('[QL-71] a document names the unit of work its unit-bound memories were recorded for in its index alone: no lens is told of it, the report carries it, and a document naming none hashes as before', () => {
    const unitKey = 'company=acme';
    const undeclared = renderDocumentGoal(UNDECLARED);
    for (const scope of [undefined, ...MEMORY_SCOPES]) {
      const head = scope === undefined ? {} : { scope };
      const goal = renderDocumentGoal({ ...UNDECLARED, ...head, unitKey });
      expect(readDocumentIndex(goal)?.document).toEqual({
        ...readDocumentIndex(renderDocumentGoal({ ...UNDECLARED, ...head }))?.document,
        unitKey,
      });
      // Not the head line, the rules or the limits: only the index changed.
      expect(stripIndexSection(goal)).toBe(
        stripIndexSection(renderDocumentGoal({ ...UNDECLARED, ...head })),
      );
    }
    expect(sha256(undeclared)).toBe(UNDECLARED_GOAL_SHA256);
    // What the digest step reports is the index's document, the unit with it.
    const named = readDocumentIndex(renderDocumentGoal({ ...UNDECLARED, unitKey }))?.document;
    expect(documentDigestReportSchema.safeParse(named).success).toBe(true);
    // Absent is the only way to name none: a null or an empty key is refused.
    expect(documentChunkSchema.safeParse({ ...UNDECLARED, unitKey: null }).success).toBe(false);
    expect(documentChunkSchema.safeParse({ ...UNDECLARED, unitKey: '' }).success).toBe(false);
  });

  it('[QL-71] which scopes bind a memory to a unit of work is one total table: unit does, subject does not, and a memory stored with no scope is bound to none', () => {
    expect(UNIT_BOUND_SCOPES).toEqual(['unit']);
    expect(MEMORY_SCOPES.map((scope) => [scope, isUnitBound(scope)])).toEqual([
      ['subject', false],
      ['unit', true],
    ]);
    expect(isUnitBound(undefined)).toBe(false);
  });

  it('[QL-69] the scope test is left out by its constant, never by its wording: a rule that shares its words is stated', () => {
    const sharing = SCOPE_RULE.slice(0, SCOPE_RULE.indexOf('?') + 1);
    for (const scope of MEMORY_SCOPES) {
      expect(renderDocumentGoal({ ...UNDECLARED, scope, rules: [SCOPE_RULE, sharing] })).toContain(
        `## Rules\n\n- ${sharing}\n\n## Limits`,
      );
      // A declared chunk whose one rule is the scope test states none.
      expect(renderDocumentGoal({ ...UNDECLARED, scope, rules: [SCOPE_RULE] })).toContain(
        '## Rules\n\n(none)\n\n## Limits',
      );
    }
  });

  it('[QL-40] renders a maximal chunk under the engine budget, and the schema refuses one past the part cap', () => {
    const maximal: DocumentChunk = {
      ...resumeChunk(),
      parts: Array.from({ length: DOCUMENT_MAX_PARTS }, () => 'p'.repeat(DOCUMENT_PART_MAX_LENGTH)),
      maxMemories: 16,
    };
    // Declared or not: a declared scope states its limit and leaves the scope test out.
    for (const chunk of [maximal, ...MEMORY_SCOPES.map((scope) => ({ ...maximal, scope }))]) {
      expect(textBytes(renderDocumentGoal(chunk))).toBeLessThan(GOAL_BUDGET_BYTES);
    }
    expect(
      documentChunkSchema.safeParse({
        ...maximal,
        parts: ['p'.repeat(DOCUMENT_PART_MAX_LENGTH + 1)],
      }).success,
    ).toBe(false);
  });
});

describe('goal index fence', () => {
  it('[QL-39] reads back what it wrote, the last fenced block only', () => {
    const schema = z.object({ a: z.number() });
    const goal = `prose\n${renderIndexSection({ a: 1 })}\nmore\n${renderIndexSection({ a: 2 })}`;
    expect(readFencedIndex(goal, schema)).toEqual({ a: 2 });
    expect(readFencedIndex('no fence', schema)).toBeNull();
    expect(readFencedIndex('```json\nnot json\n```', schema)).toBeNull();
  });
});
