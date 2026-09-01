import { Migration } from '@mikro-orm/migrations';

/**
 * A prompt now states what its functional requirements DEMAND, not just what
 * they say. The engine used to gate rules by grepping the requirement prose,
 * which made a grade hostage to wording; `functional_capabilities` is the
 * machine-readable half, exactly as `targetSpec` is for an NFR's prose target.
 *
 * The backfill below is the last time those regexes ever run: it converts
 * existing rows forward so prompts generated before this migration keep
 * grading the way they did, and then the patterns leave the codebase.
 */
export class Migration20260901100001_add_prompt_functional_capabilities extends Migration {
  override up(): void | Promise<void> {
    // Added nullable, backfilled, then tightened — a NOT NULL column cannot
    // be added to a populated table without a default, and the entity supplies
    // the default in TypeScript rather than in the schema.
    this.addSql(`
      alter table "prompt"
        add column "functional_capabilities" jsonb;
    `);
    this.addSql(`
      update "prompt" as p
        set "functional_capabilities" = coalesce(
          (
            select jsonb_agg(capability)
            from (
              select 'search' as capability
              where lower(array_to_string(p."functional_requirements", ' ')) like '%search%'
              union all
              select 'analytics'
              where lower(array_to_string(p."functional_requirements", ' ')) ~ '(dashboard|analytic|report)'
              union all
              select 'payments'
              where lower(array_to_string(p."functional_requirements", ' ')) ~ '(purchase|checkout|payment)'
              union all
              select 'scheduled-work'
              where lower(array_to_string(p."functional_requirements", ' ')) ~ '(delay|wait|schedul|timer)'
            ) as derived
          ),
          '[]'::jsonb
        );
    `);
    this.addSql(`
      alter table "prompt"
        alter column "functional_capabilities" set not null;
    `);
  }

  override down(): void | Promise<void> {
    this.addSql(`
      alter table "prompt"
        drop column "functional_capabilities";
    `);
  }
}
