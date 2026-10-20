import { Migration } from '@mikro-orm/migrations';

/**
 * Every canvas rubric now closes with the three standing trade-off criteria
 * (`CANVAS_STANDING_CRITERIA` in contracts), appended by the studio to every
 * rubric it stores. Prompts stored before that carry them here, with ids
 * continuing their own sequence so every binding keeps the id it names. A
 * prompt whose rubric is still empty gets them when its rubric is derived.
 * Idempotent: a prompt already carrying the first statement is left alone.
 */
const STANDING = [
  'Every load-bearing decision records at least one alternative considered and the cost accepted.',
  'Where a requirement could be held by more than one mechanism, its binding says why the chosen one and not the other.',
  'The assumptions the design depends on are stated, not smuggled into the drawing.',
] as const;

export class Migration20261020100001_append_standing_criteria_to_prompts extends Migration {
  override name = 'Migration20261020100001_append_standing_criteria_to_prompts';

  override up(): void | Promise<void> {
    const literal = (text: string) => `'${text.replace(/'/g, "''")}'`;
    this.addSql(
      `update "prompt" set "criteria" = "criteria" || jsonb_build_array(` +
        `jsonb_build_object('id', 'c' || (jsonb_array_length("criteria") + 1), 'kind', 'tradeoff', 'statement', ${literal(STANDING[0])}), ` +
        `jsonb_build_object('id', 'c' || (jsonb_array_length("criteria") + 2), 'kind', 'tradeoff', 'statement', ${literal(STANDING[1])}), ` +
        `jsonb_build_object('id', 'c' || (jsonb_array_length("criteria") + 3), 'kind', 'tradeoff', 'statement', ${literal(STANDING[2])})) ` +
        `where jsonb_typeof("criteria") = 'array' and jsonb_array_length("criteria") > 0 ` +
        `and not exists (select 1 from jsonb_array_elements("criteria") as c where c->>'statement' = ${literal(STANDING[0])});`,
    );
  }

  override down(): void | Promise<void> {
    const literal = (text: string) => `'${text.replace(/'/g, "''")}'`;
    this.addSql(
      `update "prompt" set "criteria" = coalesce((select jsonb_agg(c) from jsonb_array_elements("criteria") as c ` +
        `where c->>'statement' not in (${literal(STANDING[0])}, ${literal(STANDING[1])}, ${literal(STANDING[2])})), '[]'::jsonb) ` +
        `where jsonb_typeof("criteria") = 'array';`,
    );
  }
}
