import { DRAFT_SECTION_KEYS, DRAFT_SECTIONS, type SuccessCriterion } from '@sysdesign/contracts';

/** A `##` heading → the kind its rows become, from the contract's own section table; an unknown heading keeps the kind in force. */
const KIND_BY_HEADING = new Map(
  DRAFT_SECTION_KEYS.map((key) => [
    DRAFT_SECTIONS[key].heading.replace(/^#+\s*/, '').toLowerCase(),
    DRAFT_SECTIONS[key].kind,
  ]),
);

/**
 * A rubric from a markdown goal, by its own headings: one criterion per
 * bullet, numbered line or table row, kinded by the section it sits under
 * through the same declared table the generator renders with. The standing
 * criteria are not added here: the loop's deriver never adds them either, and
 * the studio closes every rubric with them itself. Deterministic, so a spec
 * can predict `c1…cN`; a goal with no lists at all still yields one criterion
 * of three canvas kinds. A test fixture, never a runtime rule: the real loop
 * derives through a model.
 */
export function criteriaFromMarkdown(goal: string): SuccessCriterion[] {
  const statements: { kind: string; statement: string }[] = [];
  let kind = 'functional';
  for (const raw of goal.split('\n')) {
    const line = raw.trim();
    const heading = /^#{2,}\s+(.+)$/.exec(line);
    if (heading) {
      kind = KIND_BY_HEADING.get(heading[1].trim().toLowerCase()) ?? kind;
      continue;
    }
    const item = /^(?:\d+\.|[-*])\s+(.+)$/.exec(line);
    if (item) {
      statements.push({ kind, statement: item[1] });
      continue;
    }
    const row = /^\|(.+)\|$/.exec(line);
    if (row) {
      const cells = row[1].split('|').map((cell) => cell.trim());
      if (cells.every((cell) => /^-+$/.test(cell))) continue;
      if (/^(kind|metric)$/i.test(cells[0] ?? '')) continue;
      statements.push({ kind, statement: cells.filter((cell) => cell.length > 0).join(' — ') });
    }
  }
  if (statements.length === 0) {
    statements.push(
      { kind: 'functional', statement: 'Do what the goal asks.' },
      { kind: 'non_functional', statement: 'Meet the stated quality target.' },
      { kind: 'constraint', statement: 'Break no stated rule.' },
    );
  }
  return statements.map((item, index) => ({
    id: `c${index + 1}`,
    kind: item.kind,
    statement: item.statement.slice(0, 300),
  }));
}
