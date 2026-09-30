import type { SuccessCriterion } from '@sysdesign/contracts';

const KIND_BY_HEADING: readonly [RegExp, string][] = [
  [/non-functional|quality/i, 'non_functional'],
  [/scale/i, 'scale'],
  [/constraint/i, 'constraint'],
  [/functional/i, 'functional'],
];

/**
 * A rubric from a markdown goal, by its own headings: one criterion per
 * bullet, numbered line or table row, kinded by the section it sits under.
 * Deterministic, so a spec can predict `c1…cN`; a goal with no lists at all
 * still yields one criterion of each kind the canvas pipeline declares. A
 * test fixture, never a runtime rule: the real loop derives through a model.
 */
export function criteriaFromMarkdown(goal: string): SuccessCriterion[] {
  const statements: { kind: string; statement: string }[] = [];
  let kind = 'functional';
  for (const raw of goal.split('\n')) {
    const line = raw.trim();
    const heading = /^#{2,}\s+(.+)$/.exec(line);
    if (heading) {
      kind = KIND_BY_HEADING.find(([pattern]) => pattern.test(heading[1]))?.[1] ?? kind;
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
      statements.push({ kind, statement: cells.join(' — ') });
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
