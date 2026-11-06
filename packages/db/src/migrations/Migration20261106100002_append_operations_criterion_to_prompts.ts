import { Migration } from '@mikro-orm/migrations';

/**
 * Every canvas rubric now closes with a standing evolution criterion — how the
 * design is operated: built, delivered, rolled out and back, observed, backed
 * up (`CANVAS_STANDING_CRITERIA` in contracts). Prompts stored before carry it
 * here, with an id continuing their own sequence so every binding keeps the id
 * it names; a prompt whose rubric is still empty gets it when its rubric is
 * derived, and one already at the pipeline's cap keeps its rows. Idempotent: a
 * prompt already carrying the statement is left alone. The literal is the
 * contract's, byte for byte — `src/standing-criteria.spec.ts` reads this file
 * and says so.
 */
const STATEMENT =
  'The design says how it is operated: how each deployable is built, delivered, rolled out and rolled back, what observes it, and what backs up and restores its data — declared on blocks of the delivery, observability and backup roles or in config, as far as the goal asks.';

/** The pipeline's `maxCriteria` (`CANVAS_MAX_CRITERIA`): a rubric at it takes no further row. */
const CAP = 34;

export class Migration20261106100002_append_operations_criterion_to_prompts extends Migration {
  override name = 'Migration20261106100002_append_operations_criterion_to_prompts';

  override up(): void | Promise<void> {
    const literal = (text: string) => `'${text.replace(/'/g, "''")}'`;
    this.addSql(
      `update "prompt" set "criteria" = "criteria" || jsonb_build_array(` +
        `jsonb_build_object('id', 'c' || (jsonb_array_length("criteria") + 1), 'kind', 'evolution', 'statement', ${literal(STATEMENT)})) ` +
        `where jsonb_typeof("criteria") = 'array' and jsonb_array_length("criteria") > 0 and jsonb_array_length("criteria") < ${CAP} ` +
        `and not exists (select 1 from jsonb_array_elements("criteria") as c where c->>'statement' = ${literal(STATEMENT)});`,
    );
  }

  override down(): void | Promise<void> {
    const literal = (text: string) => `'${text.replace(/'/g, "''")}'`;
    this.addSql(
      `update "prompt" set "criteria" = coalesce((select jsonb_agg(c) from jsonb_array_elements("criteria") as c ` +
        `where c->>'statement' <> ${literal(STATEMENT)}), '[]'::jsonb) ` +
        `where jsonb_typeof("criteria") = 'array';`,
    );
  }
}
