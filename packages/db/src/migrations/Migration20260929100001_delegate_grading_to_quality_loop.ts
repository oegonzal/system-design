import { Migration } from '@mikro-orm/migrations';

/**
 * Grading leaves the studio. A prompt becomes one markdown document plus the
 * criteria the quality loop derives from it; a revision points at the
 * quality-loop run and iteration that judged it; the studio's own grading
 * tables — evaluation, finding, eval_job, improvement_run — go, along with
 * the archetype and scale facts that fed the deleted prompt generator.
 *
 * Existing prompts are rendered into the house markdown convention in pure
 * SQL so practice history survives; their criteria start empty and are
 * derived on first read. Stored graphs are rewritten to the new shape (config
 * as key/value entries, no workflow claims, no edge intent). Briefs and
 * requirement-keyed narrations are dropped: they were keyed to NFR ids and
 * requirement ordinals that no longer exist, and there is no mapping to a
 * criterion the loop has not derived yet. Old evaluations are deleted — they
 * were scored on a rubric that no longer exists; resubmit to regrade.
 *
 * No `down`: a data migration that drops four tables is not reversible, and
 * pretending otherwise would be worse than saying so.
 */
export class Migration20260929100001_delegate_grading_to_quality_loop extends Migration {
  override up(): void | Promise<void> {
    // 1. prompt: the new shape, nullable first so existing rows can be filled.
    this.addSql(`
      alter table "prompt"
        add column "markdown" text  null,
        add column "criteria" jsonb not null default '[]'::jsonb,
        add column "source"   text  null;
    `);

    // 2. Render every structured prompt into markdown. `x || null` is null and
    //    concat_ws skips nulls, so an absent target or retention line vanishes;
    //    string_agg over an empty set is null, so an empty section vanishes with
    //    its heading.
    this.addSql(`
      update "prompt" p set
        "markdown" = concat_ws(E'\\n\\n',
          '# ' || p."title",
          E'## Scenario\\n\\n' || p."scenario",
          E'## Functional requirements\\n\\n' || (
            select string_agg(format('%s. %s', ord, fr), E'\\n' order by ord)
            from unnest(p."functional_requirements") with ordinality as t(fr, ord)),
          E'## Non-functional requirements\\n\\n| Kind | Requirement | Target |\\n| --- | --- | --- |\\n' || (
            select string_agg(
              format('| %s | %s | %s |', n->>'kind', n->>'statement', coalesce(n->>'target', '—')),
              E'\\n')
            from jsonb_array_elements(p."non_functional_requirements") n),
          E'## Scale targets\\n\\n| Metric | Target |\\n| --- | --- |\\n' || concat_ws(E'\\n',
            '| Concurrent users | '    || (p."scale_targets"->>'concurrentUsers') || ' |',
            '| Requests per second | ' || (p."scale_targets"->>'requestsPerSecond') || ' |',
            '| Read:write ratio | '    || (p."scale_targets"->>'readWriteRatio') || ' |',
            '| p99 latency | '         || (p."scale_targets"->>'p99LatencyMs') || ' ms |',
            '| Availability | '        || (p."scale_targets"->>'availabilityPct') || ' % |',
            '| Data retention | '      || (p."scale_targets"->>'dataRetention') || ' |')),
        "source" = case when p."generator_version" = 'authored' then 'authored' else 'generated' end;
    `);

    // 3. Tighten, then drop the structured columns and the difficulty ladder.
    this.addSql(`
      alter table "prompt"
        alter column "markdown" set not null,
        alter column "source"   set not null,
        alter column "criteria" drop default,
        alter column "experience_id" drop not null;
    `);
    this.addSql(`
      alter table "prompt"
        add constraint "prompt_source_check" check (source in ('authored', 'generated', 'library'));
    `);
    this.addSql(`alter table "prompt" drop constraint "prompt_difficulty_check";`);
    this.addSql(`
      alter table "prompt"
        drop column "archetype",
        drop column "scenario",
        drop column "functional_requirements",
        drop column "functional_capabilities",
        drop column "non_functional_requirements",
        drop column "scale_targets",
        drop column "workflow_spec",
        drop column "difficulty",
        drop column "seed",
        drop column "generator_version",
        drop column "llm_enriched";
    `);

    // 4. prompt_generation: one row per generation run, claimed once.
    this.addSql(`
      create table "prompt_generation" (
        "run_id"        varchar(80) not null,
        "experience_id" uuid        null,
        "prompt_id"     uuid        null,
        "started_at"    timestamptz not null,
        constraint "prompt_generation_pkey" primary key ("run_id")
      );
    `);
    this.addSql(`
      alter table "prompt_generation"
        add constraint "prompt_generation_prompt_id_unique" unique ("prompt_id");
    `);
    this.addSql(`
      alter table "prompt_generation"
        add constraint "prompt_generation_experience_id_foreign"
        foreign key ("experience_id") references "experience_profile" ("id")
        on delete restrict;
    `);
    this.addSql(`
      alter table "prompt_generation"
        add constraint "prompt_generation_prompt_id_foreign"
        foreign key ("prompt_id") references "prompt" ("id")
        on delete cascade;
    `);

    // 5. design_revision: the run pointer and the lazy cache.
    this.addSql(`
      alter table "design_revision"
        add column "quality_run_id"    varchar(80)      null,
        add column "quality_iteration" int              null,
        add column "overall"           double precision null,
        add column "decision"          text             null,
        add column "evaluation_status" text             null;
    `);
    this.addSql(`
      alter table "design_revision"
        add constraint "design_revision_quality_run_id_quality_iteration_unique"
        unique ("quality_run_id", "quality_iteration");
    `);
    this.addSql(
      `create index "design_revision_quality_run_id_index" on "design_revision" ("quality_run_id");`,
    );
    this.addSql(`
      alter table "design_revision"
        add constraint "design_revision_decision_check"
        check (decision is null or decision in ('accept', 'revise', 'retry', 'escalate', 'reject'));
    `);
    this.addSql(`
      alter table "design_revision"
        add constraint "design_revision_evaluation_status_check"
        check (evaluation_status is null or evaluation_status in ('running', 'complete', 'failed'));
    `);

    // 6. Stored graphs → the new shape: operations lose fulfills/emits, edges
    //    lose intent and get an explicit kind, config records become entries.
    this.addSql(`
      update "design_revision" set "graph" = jsonb_build_object(
        'nodes', coalesce((
          select jsonb_agg(
            (case when n ? 'operations'
              then jsonb_set(n, '{operations}', (
                select coalesce(jsonb_agg(o - 'fulfills' - 'emits'), '[]'::jsonb)
                from jsonb_array_elements(n->'operations') o))
              else n end)
            || (case when n ? 'config' and jsonb_typeof(n->'config') = 'object'
              then jsonb_build_object('config', (
                select coalesce(jsonb_agg(jsonb_build_object('key', k, 'value', v)), '[]'::jsonb)
                from jsonb_each(n->'config') as c(k, v)))
              else '{}'::jsonb end))
          from jsonb_array_elements("graph"->'nodes') n), '[]'::jsonb),
        'edges', coalesce((
          select jsonb_agg(jsonb_set(e - 'intent', '{kind}', coalesce(e->'kind', '"sync"'::jsonb)))
          from jsonb_array_elements("graph"->'edges') e), '[]'::jsonb));
    `);

    // 7. Briefs were keyed by NFR id and mechanism, narrations by requirement
    //    ordinal: no mapping to a derived criterion exists.
    this.addSql(`
      update "design_revision" set
        "brief" = null,
        "narrative" = case when "narrative" is null then null
          else ("narrative" - 'flowNarrations') || '{"criterionNarrations": []}'::jsonb end;
    `);

    // 8. The studio's grading tables, children first.
    this.addSql(`drop table if exists "finding" cascade;`);
    this.addSql(`drop table if exists "eval_job" cascade;`);
    this.addSql(`drop table if exists "improvement_run" cascade;`);
    this.addSql(`drop table if exists "evaluation" cascade;`);

    // 9. experience_profile: the archetype and the scale facts fed the deleted generator.
    this.addSql(`alter table "experience_profile" drop constraint "experience_profile_archetype_check";`);
    this.addSql(`alter table "experience_profile" drop column "archetype", drop column "scale_facts";`);
  }
}
