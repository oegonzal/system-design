# db

Every Postgres table the workspace shares, as MikroORM entities with hand-written SQL migrations: the studio's sessions, revisions and coaching runs; the quality loop's runs and orchestrations; govcon's notices, bids, awards and registrants; the browser session's ledger; and the notifications service's event bus and the prompts it put to people. `ormOptions` is the one object every DbModule and the migration CLI configure from, so an app and the CLI cannot disagree about a column name.

```bash
pnpm db:migrate                 # apply pending migrations to DB_NAME (default sysdesign)
pnpm db:migrate:check           # fail if the entities and the migrated schema disagree
pnpm db:migrate:create          # scaffold the next migration (then rewrite it as SQL by hand)
DB_NAME=sysdesign_test_<lane> pnpm db:migrate   # a test lane; `ensureDatabase()` does this for specs
```

Where the migrations live and which table records them is declared once, in `src/migrator.ts`: the CLI and `ensureDatabase()` apply them with `migratorSettings`, and an app that must not run against a database behind its checkout calls `assertMigrated(em)` before it touches a row — the browser session does, and refuses with the migrations to apply.

Conventions: a status column is `text` with a `@Check` built from an `as const satisfies` copy of the contracts vocabulary, so a word added to `@sysdesign/contracts` fails compilation here until the check is widened by a migration. Ids the quality loop mints are `varchar(80)` columns, never foreign keys — the loop is another service that sweeps its own rows. Specs that touch Postgres call `ensureDatabase()` first and empty tables only through `truncateTestTables`.

## Browser session ledger

`browser_session` (the goal as run, the profile, the rails, how it ended, a heartbeat), `browser_task` (one unit of work per `taskStart` … `taskDone`) and `browser_decision` (one row per plan, field answer or termination, naming the loop run that took it). `question` on a decision is the field's label — the join key the learning queries below rest on.

Ask rate per session over time — how often a field had to go to the operator, against everything decided about a field. A row the operator's earlier answer or blank in the unit settled carries `cached` in its payload, and was no ask:

```sql
select s.started_at::date as day, s.id as session,
       count(*) filter (where d.source = 'operator' and not coalesce((d.payload->>'cached')::boolean, false)) as asked,
       count(*) as fields,
       round(100.0 * count(*) filter (where d.source = 'operator' and not coalesce((d.payload->>'cached')::boolean, false)) / count(*), 1) as ask_pct
from browser_decision d
join browser_session s on s.id = d.session_id
where d.kind = 'field-answer'
group by s.started_at::date, s.id
order by day, s.started_at;
```

Time from a question's first operator answer to its first answer from memory — the teach-back working, one label at a time:

```sql
with asked as (
  select question, min(created_at) as first_asked
  from browser_decision
  where kind = 'field-answer' and source = 'operator'
    and not coalesce((payload->>'cached')::boolean, false)
  group by question
),
recalled as (
  select question, min(created_at) as first_from_memory
  from browser_decision
  where kind = 'field-answer' and source = 'memory'
  group by question
)
select a.question, a.first_asked, r.first_from_memory,
       r.first_from_memory - a.first_asked as learned_after
from asked a
left join recalled r using (question)
order by a.first_asked;
```

Questions still unanswered by memory — what the next ingest should cover:

```sql
select question, count(*) as times_asked, max(created_at) as last_asked
from browser_decision
where kind = 'field-answer' and source = 'operator'
  and not coalesce((payload->>'cached')::boolean, false)
  and question not in (
    select question from browser_decision
    where kind = 'field-answer' and source = 'memory' and question is not null
  )
group by question
order by times_asked desc, last_asked desc;
```
