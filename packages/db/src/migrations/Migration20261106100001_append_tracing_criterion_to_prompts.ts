import { Migration } from '@mikro-orm/migrations';

/**
 * Every canvas rubric now closes with a third standing communication
 * criterion — the tracing of the whole design: the way in of every request
 * from outside, every traced path at rest, every component on or beside a
 * traced path (`CANVAS_STANDING_CRITERIA` in contracts). Prompts stored
 * before carry it here, with an id continuing their own sequence so every
 * binding keeps the id it names; a prompt whose rubric is still empty gets it
 * when its rubric is derived, and one already at the pipeline's cap keeps
 * its rows. Idempotent: a prompt already carrying the statement is left
 * alone. A prompt migrated on a platform ends `…constraint, communication`
 * where a prompt written after ends `…communication, constraint`: ids are the
 * prompt's own and nothing reads their order. The literal is the contract's,
 * byte for byte — `src/standing-criteria.spec.ts` reads this file and
 * says so.
 */
const STATEMENT =
  "Where a request enters from outside the system, its path shows every stage the goal's request lifecycle lists for that entry — name resolution, transport security, edge protection, the access layer and identity — or says why a stage is absent; every traced path comes to rest; and every component drawn lies on or beside a traced path.";

/** The pipeline's `maxCriteria` (`CANVAS_MAX_CRITERIA`): a rubric at it takes no further row. */
const CAP = 33;

export class Migration20261106100001_append_tracing_criterion_to_prompts extends Migration {
  override name = 'Migration20261106100001_append_tracing_criterion_to_prompts';

  override up(): void | Promise<void> {
    const literal = (text: string) => `'${text.replace(/'/g, "''")}'`;
    this.addSql(
      `update "prompt" set "criteria" = "criteria" || jsonb_build_array(` +
        `jsonb_build_object('id', 'c' || (jsonb_array_length("criteria") + 1), 'kind', 'communication', 'statement', ${literal(STATEMENT)})) ` +
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
