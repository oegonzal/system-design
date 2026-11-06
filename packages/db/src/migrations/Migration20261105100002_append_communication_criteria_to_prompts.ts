import { Migration } from '@mikro-orm/migrations';

/**
 * Every canvas rubric now closes with two standing communication criteria
 * after the three trade-off ones (`CANVAS_STANDING_CRITERIA` in contracts),
 * appended by the studio to every rubric it stores. Prompts stored before
 * that carry them here, with ids continuing their own sequence so every
 * binding keeps the id it names. A prompt whose rubric is still empty gets
 * them when its rubric is derived. Idempotent: a prompt already carrying the
 * first statement is left alone. The literals are the contract's, byte for
 * byte — `src/standing-criteria.spec.ts` reads this file and says so.
 */
const STANDING = [
  'Every hop between two components states its call style (sync or async) and the mechanism that carries it, and every request path is traced from where it enters to where it comes to rest.',
  'Every asynchronous hop names how a failed or repeated message is handled, and every synchronous hop its timeout and what the caller does when the callee does not answer.',
] as const;

export class Migration20261105100002_append_communication_criteria_to_prompts extends Migration {
  override name = 'Migration20261105100002_append_communication_criteria_to_prompts';

  override up(): void | Promise<void> {
    const literal = (text: string) => `'${text.replace(/'/g, "''")}'`;
    this.addSql(
      `update "prompt" set "criteria" = "criteria" || jsonb_build_array(` +
        `jsonb_build_object('id', 'c' || (jsonb_array_length("criteria") + 1), 'kind', 'communication', 'statement', ${literal(STANDING[0])}), ` +
        `jsonb_build_object('id', 'c' || (jsonb_array_length("criteria") + 2), 'kind', 'communication', 'statement', ${literal(STANDING[1])})) ` +
        `where jsonb_typeof("criteria") = 'array' and jsonb_array_length("criteria") > 0 ` +
        `and not exists (select 1 from jsonb_array_elements("criteria") as c where c->>'statement' = ${literal(STANDING[0])});`,
    );
  }

  override down(): void | Promise<void> {
    const literal = (text: string) => `'${text.replace(/'/g, "''")}'`;
    this.addSql(
      `update "prompt" set "criteria" = coalesce((select jsonb_agg(c) from jsonb_array_elements("criteria") as c ` +
        `where c->>'statement' not in (${literal(STANDING[0])}, ${literal(STANDING[1])})), '[]'::jsonb) ` +
        `where jsonb_typeof("criteria") = 'array';`,
    );
  }
}
