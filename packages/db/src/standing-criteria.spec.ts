import { readFileSync } from 'node:fs';

import { CANVAS_STANDING_CRITERIA } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

/**
 * The migrations that appended the standing criteria to stored prompts hold
 * the contract's statements as literals — the db package cannot import
 * contracts at migration time — so this spec reads each file and holds its
 * literals to the contract, byte for byte, and to nothing but its own rows.
 * It lives beside the migrator, not among the migrations: the migrator loads
 * every file of that folder as a migration.
 */
const ROWS: Readonly<Record<string, readonly (typeof CANVAS_STANDING_CRITERIA)[number][]>> = {
  'Migration20261020100001_append_standing_criteria_to_prompts.ts': CANVAS_STANDING_CRITERIA.slice(
    0,
    3,
  ),
  'Migration20261105100002_append_communication_criteria_to_prompts.ts':
    CANVAS_STANDING_CRITERIA.slice(3, 5),
  'Migration20261106100001_append_tracing_criterion_to_prompts.ts': CANVAS_STANDING_CRITERIA.slice(
    5,
    6,
  ),
  'Migration20261106100002_append_operations_criterion_to_prompts.ts':
    CANVAS_STANDING_CRITERIA.slice(6),
};

describe('the standing-criteria migrations', () => {
  it('[EVAL-7] [EVAL-8] each carries its rows of the contract byte for byte, and no other row', () => {
    expect(Object.values(ROWS).flat()).toEqual([...CANVAS_STANDING_CRITERIA]);
    for (const [file, rows] of Object.entries(ROWS)) {
      const text = readFileSync(new URL(`./migrations/${file}`, import.meta.url), 'utf8');
      expect(rows.length, file).toBeGreaterThan(0);
      for (const row of rows) expect(text, file).toContain(row.statement);
      for (const other of CANVAS_STANDING_CRITERIA) {
        if (!rows.includes(other)) expect(text, file).not.toContain(other.statement);
      }
    }
  });
});
