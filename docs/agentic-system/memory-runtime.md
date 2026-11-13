# The agentic-memory runtime — a memory strategy, executed

_How `packages/agentic-memory` turns a strategy the `memory-architecture` pipeline
wrote into running memory: typed writes that reconcile, recall that routes by what
it is asked, consolidation that promotes episodes to lessons to playbooks, and a
lifecycle that ages short-term state away and keeps the index rebuildable._

The design tool ([memory-design-capability.md](memory-design-capability.md))
produces a **strategy**: registers, the typed interfaces over them, and the
workflows that move memory through them. This runtime is what executes one. It
follows `docs/memory/memory-designing.md`'s recommended starting design —
PostgreSQL as the source of truth, a derived and rebuildable vector projection
(since 12 Nov 2026 a pgvector table in that same database; Qdrant before), and a
dedicated Memory Service with a provider-independent typed API — and keeps facts,
events, state and procedures apart, as that document insists.

It is a separate bounded context from the quality loop's own grading memory: it
neither reads nor widens it.

---

## 1. Topology from the strategy, numbers from a policy

A strategy is half typed data and half prose. The prose says things like
"TTL-expired after an hour" or "promote once confirmed across several episodes";
executing prose would mean guessing at it, which the repository forbids. So the
runtime takes:

- **the topology from the strategy's typed declarations** — each register's
  `kind`, `term` and `metadata` field names; the interfaces, read as the only verbs
  each register serves; and one workflow, `consolidation_promotion`, because it is
  the only one that says something the interfaces cannot (where lessons and
  playbooks go);
- **the numbers from a declared policy** (`packages/agentic-system/config/memory/standard.json`):
  the scope keys, each term's time to live, the recall budget and rank weights,
  and the support a lesson and a playbook need.

A space keeps both as snapshots, so it compiles the same on every load and does
not change when the run or the policy file does.

## 2. Compile

`compileSpace(strategy, policy, behaviors)` is pure and runs on every load.

- The strategy's **reference rule** is the contract's (`validateStrategyReferences`),
  the same one the pipeline blocks on: a dangling register or operation, or a
  register declared twice, is a **problem**, and no space is created.
- A register whose kind has no behavior is a problem (`register.kind_unsupported`).
- **Warnings** state what the space cannot serve, naming the register:
  `metadata.not_a_field` (an entry like `kind=working` is not a field name, so it
  is not filterable), `register.no_entry` (nothing can write into it),
  `register.unread` (no recall), `register.unforgettable` (long-term, and no
  `invalidate`, so nothing it keeps can be forgotten), `operation.no_effect`, and the
  consolidation-route warnings.
- The warnings and the consolidation route come from one pure analysis in the
  contracts, `analyzeStrategy`, over the typed declarations and the role each kind
  declares (`REGISTER_KIND_DECLARATIONS`: episodes are the evidence, semantic
  registers keep the lessons, procedural registers keep the playbooks). The `memory-architecture`
  pipeline runs the same analysis over every draft as its `executability`
  validator, so the coach is told what would not run before a space is ever made.
- The **consolidation route** is resolved by the role each kind declares — the
  register whose records are evidence (`consolidate` on an episodic register), the
  one lessons go to (`remember` on a semantic register), the one playbooks go to
  (`consolidate` on a procedural register) — independent of step order. Zero or
  several candidates leave consolidation unavailable, with a warning; the runtime
  never picks "the first".

Two specs make the no-prose rule mechanical: rewriting **every prose field** of a
strategy compiles to the identical space, and **reversing every list** — registers,
interfaces, workflows, steps — does too.

The live strategy from 2026-10-17 compiles with six warnings — working memory's
`kind=working` entry, working memory being unread, the relational register having
no way in (it declares only `update` and `recall`), and three long-term registers
that declare no `invalidate` — and consolidation routed episodes → `semantic_fact` →
`procedural_playbook`. A later strategy that kept its lessons inside the episodic
register "told apart by status" compiled with consolidation unavailable
(`consolidation.no_lesson_target`): the typed kinds cannot place a lesson there,
and the runtime does not guess.

## 3. The kinds, as data

Every kind is a declared behavior (`kinds/behaviors.ts`): its candidate schema,
the fields its identity is made of, the values an exact recall finds it by, its
valid-time field, its text template, whether it is projected, and the identity
values it keeps for the lessons consolidation writes into it. The engine reads
these and nothing else, so a new or changed kind is a registry entry, not an
engine edit. What the design, the digest (§9) and the runtime share about a kind
is declared once, in the contracts' `REGISTER_KIND_DECLARATIONS`: the words the
design pipeline is shown, the role it plays in consolidation, its candidate
schema and the candidate field its valid time comes from. The database holds no
list of kinds: a space refuses at compile a kind its runtime has no behavior for
(`register.kind_unsupported`), so a new kind is one declaration and one behavior,
never a migration.

| kind       | identity                    | exact keys      | valid from              | projected | role      |
| ---------- | --------------------------- | --------------- | ----------------------- | --------- | --------- |
| working    | key                         | key             | recorded                | no        | —         |
| semantic   | subject + predicate         | subject         | `validFrom` or recorded | yes       | lessons   |
| episodic   | none — appends              | subject         | `occurredAt`            | yes       | evidence  |
| procedural | name                        | name            | recorded                | yes       | playbooks |
| relational | subject + relation + object | subject, object | `validFrom` or recorded | no        | —         |

A relation's identity includes its object, so several edges stand at once (an
account's several contacts); an edge ends by invalidation. Relations and working
state are found by key, never by similarity, so neither is embedded.

The semantic register consolidation keeps its lessons in has one identity
reserved: every lesson is written under the predicate `lesson`, so a writer's
memory under it would reconcile with, and replace, the lesson of the same
subject. The write brief names it on that register (§4), and a digest withholds a
memory that takes it.

## 4. Writing

`remember` asserts a typed candidate. It is drafted (identity, keys, text, valid
time, expiry from the term's TTL), resolved against the current record in the same
register and exact scope, and reconciled by one rule:

- no current record → **inserted** (version 1);
- the current one says the same — the same content and the same declared
  metadata → **unchanged**;
- otherwise → **superseded**: the old row closes (`valid_to` = the later of the two
  valid times) and the new one is the next version under the same lineage.

An episode appends; it is deduplicated by a hash over the register, the scope, the
body and its provenance's source run — so a retry is idempotent, and the same
episode from another run is more evidence rather than a duplicate.

Writes are safe under concurrency: the close is a compare-and-set (it applies only
while the old row is current), and a partial unique index allows one current row
per identity and exact scope. A write that loses a race is re-resolved once
against what won, then refused as `conflict`.

`update` supersedes one **addressed, current** record, keeping its identity and
scope (it never inserts). `invalidate` closes one with its reason. `history` reads
every version of its lineage. Any verb addressed by id answers "not found" for a
record outside the caller's scope, so a record's existence does not leak.

Postgres is written first and is the truth. The record is then embedded and its
point upserted; a projection that fails leaves the record unmarked for the sweep —
exact and temporal recall still find it meanwhile.

The runtime briefs a writer before it writes (`MemoryService.writeBrief`,
`write/brief.ts`), and the brief writes nothing. It is refused as a write would
be — a space not kept or not compiling, a scope the policy does not declare — and
answers every register that declares `remember`, less the one consolidation
promotes playbooks into (its versions are consolidation's): each with what its
strategy says it holds, the fields it reconciles on, and the identities it keeps
reserved. No route serves it on its own; a digest is composed from it (§9).

## 5. Recalling

A recall routes by what the request **declares**, never by reading its words:

- a `key` runs the **exact** route (Postgres);
- a `text` runs the **semantic** route (embed, then search the index);
- both together merge into one ranking, the doc's hybrid;
- a time range **filters every route**, and runs alone as the **temporal** route
  only when nothing else is named.

Every semantic hit is a candidate until Postgres confirms its record is current,
unexpired and visible; a stale point is dropped and counted, never served. A route
that cannot run says why (`no_projected_register`, `embedder_disabled`,
`embedding_failed`, `index_failed`).

Results rank by a declared, deterministic formula — no similarity floor, since a
universal threshold is not set without measuring it:

```
score = w.similarity · cosine (floored at 0)
      + w.exact      · (found by its key ? 1 : 0)
      + w.recency    · 0.5 ^ (age in days / half-life)
      + w.support    · (1 − 1 / support)
```

Ties break by the newer valid time, then by id. The budget (`maxItems`,
`maxChars`) fills in rank order, skipping an item too long for what is left. Each
item comes back cited: its record, its score and its factors, and the routes that
found it.

## 6. Consolidating

Consolidation is a deterministic function of the verified episodes in scope,
recomputed whole on every pass:

1. Group episodes whose verified outcome proposes a lesson, by their **exact scope
   and the lesson's declared key**. Scopes never merge.
2. **Support** = the number of distinct source runs behind a group.
3. A group with at least `minSupport` becomes a **lesson** in the lesson register,
   citing its episodes. A standing lesson is reinforced in place when its evidence
   changed, superseded when its text did, and **withdrawn** when its support falls
   short — for instance after an episode is invalidated.
4. Lessons with at least `promoteAt` support that name a playbook become its
   **rules** — every qualifying lesson, sorted by key. A playbook gets a new
   version only when those rules change.

A pass over the same evidence changes nothing; a pass over more evidence counts
all of it. What consolidation wrote is known by what it wrote (a non-empty
`derivedFrom`), never by reading text.

## 7. Scope

Every request names the policy's first scope key, the **partition**, and only
declared keys. A memory is **visible** to a request whose scope contains its own:
a tenant-wide fact reaches every user in the tenant, a user's fact that user alone,
and a sibling sees nothing. A consolidation reads **within** a scope — everything
at or below it.

In the record store this is `partition = $p and scope <@ $request`. In the
pgvector index it is the partition, then for every _other_ policy key either
"unset on the point or equal to the request's" (`(scope->>$k) is null or
scope->>$k = $v`) or, when the request does not name the key, "unset" — a loop
over the policy's keys, never the request's, which would let a user's memory leak
tenant-wide. The key names are bound as values, never spelled into the SQL, and
the in-memory index of the specs states the same rule in code; the live spec
holds the two to the same answers.

The standard policy (`config/memory/standard.json`) declares four keys — `tenant`,
`project`, `user` and `unit` — the fourth binding a memory to the one unit of work it
was recorded for, so a request naming no unit never reads another unit's memory.
A space keeps the policy snapshot it was compiled with and reports its keys as
`scopeKeys`; the spaces made before the fourth key keep their three.

## 8. The sweep

A periodic job across every space:

- **expires** short-term records past their time to live (`valid_to` = the expiry);
- **removes** the points of records that closed — and forgets the mark of a closed record whose
  collection is no longer current (every record closed before the move to `v2` is marked `v1`),
  asking nothing of the index, since that collection's table holds no point to remove;
- **projects** every current record whose point is not in the current collection.

The collection name binds the index generation, the embedding model and its
width, so changing any of them starts an empty collection that the sweep
backfills from Postgres. Until it finishes, recall by meaning has a gap; exact
and temporal recall do not. A collection is one table of the app's own
database (`vec_agentic_memory__v2__<model>__<width>`, made with its indexes on
first use), and `memory_record.projected_into` still names the collection, not
the table. The move from Qdrant on 12 Nov 2026 bumped the generation to `v2`
for exactly this reason: the old points never crossed over, so every current
record still marked as projected into the `v1` collection is due again, and the
first sweep rebuilds the index — one embedding call per page of 100 records,
about 13 for the 1,250 records the laptop held projected when they were counted
on 11 Nov 2026 — while a closed record still marked `v1` has its mark forgotten.

## 9. HTTP — `packages/agentic-system`, `/spaces`

| route                                      | does                                                                                                                                                                                                                                                                              |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /spaces { runId }`                   | compile a settled `memory-architecture` run's best strategy into a space — finished or failed, never still running; 201 with its report, or 422 with the problems                                                                                                                 |
| `GET /spaces/:id`                          | the space and its compile report                                                                                                                                                                                                                                                  |
| `PUT /spaces/by-name/:name { runId }`      | ensure the space under a name (lower-case letters, digits and hyphens, else 400): made from the run when none holds the name, the same space when that run made it; 200 with `{ space, created }`; a name another run holds, or a concurrent claim won, is 409 `space.name_taken` |
| `GET /spaces/by-name/:name`                | the space under the name; an unknown name is 404 `space.not_found`                                                                                                                                                                                                                |
| `POST /spaces/:id/remember`                | `{ register, scope, candidate, provenance, metadata }`                                                                                                                                                                                                                            |
| `POST /spaces/:id/update`                  | `{ recordId, scope, candidate, provenance, metadata }`                                                                                                                                                                                                                            |
| `POST /spaces/:id/invalidate`              | `{ recordId, scope, reason }`                                                                                                                                                                                                                                                     |
| `POST /spaces/:id/history`                 | `{ recordId, scope }` — every version                                                                                                                                                                                                                                             |
| `POST /spaces/:id/recall`                  | `{ scope, key?, text?, since?, until?, registers?, where? }`                                                                                                                                                                                                                      |
| `POST /spaces/:id/consolidate`             | `{ scope }`                                                                                                                                                                                                                                                                       |
| `POST /spaces/:id/digests`                 | `{ title, parts: [{ label, at, text }], rules?, registers?, scope, provenance }` — digest a text into typed memories on the quality loop; 202 with the orchestration, which runs for minutes                                                                                      |
| `GET /spaces/:id/digests/:runId`           | the digest as the loop recorded it: the orchestration's status; the digest step's status, reason, note and counts; the run it opened; its report as read, or null; and the apply, once there is one                                                                               |
| `POST /spaces/:id/digests/:runId/remember` | no body — remember what the digest endorsed, once; 200 with each memory's outcome or refusal                                                                                                                                                                                      |

Every refusal has one declared status, its body carrying the refusal's `code` —
the runtime's codes and the host's (`run.*`, `digest.*`) with their statuses in one
contracts table (`packages/contracts/src/lib/agentic-system/space-host.ts`), read by
`src/memory/refusals.ts`:

- **404** — `space.not_found`, `record.not_found`, `run.not_found`, each naming
  what is `missing` (`space`, `record`, `run`); a digest the loop does not have,
  one another orchestrator ran, or one whose goal names another space is
  `run.not_found` too, so a digest's existence does not leak across spaces;
- **409** — `record.not_current`, `conflict`, `run.in_flight` (a run or a digest
  still running has settled nothing yet), `digest.applied` (the digest was
  remembered already), and `space.name_taken` (another run holds the name, or a
  concurrent claim won it);
- **422** — the rest: an undeclared verb, an invalid scope, candidate or metadata,
  an unavailable consolidation, a space that no longer compiles,
  `run.no_strategy`, and a digest with no register left to write
  (`digest.no_registers`, naming those the space lets a writer remember into),
  one whose goal would not fit the engine's budget (`digest.too_large`), or one
  whose step left no report that reads (`digest.no_report`, saying how the step
  ended);
- **400** — a body the request schema refuses, naming every offending path;
- **502 / 503 / 504** — the quality loop refused, could not be reached, or was too
  slow, when `POST /spaces` reads the run or a digest route starts or reads its
  orchestration.

### Digesting a text

A program that owns a text — a conversation, a passage, a tool's result — hands
it to a space already split into parts, each with the label and the time it
declares; the host splits nothing and reads no prose. The text is digested on
the quality loop, by the `register-memory` orchestrator over the
`register-digest` pipeline, and checked at four points before anything is
recorded:

1. **Before any model call** (`POST …/digests`). The runtime briefs the
   request's scope (§4), so a digest is refused wherever its writes would be; the
   brief's registers are narrowed to the ones `registers` names, and `null` keeps
   every one; and the goal is composed by the contracts codec
   (`renderRegisterDigestGoal`): each part quoted under its `section.N` alias with
   its label and time, each register with what it holds, the fields it reconciles
   on and the identities it keeps reserved, the caller's rules, the limits, and
   last the index — the only place the space, the scope and the provenance
   appear, so no model is shown them and none can write them. One orchestration
   starts on it under the declared budget (`REGISTER_DIGEST_MAX_ITERATIONS`), and
   the host keeps nothing.
2. **Before a row exists** (the loop). `register-memory` refuses a goal with no
   register-digest index, and a request that hands in an output or a rubric.
3. **Before anything is endorsed** (the loop's reader). The digest files each
   memory in the runtime's own candidate shape. A confirmed finding of a type
   that withholds, or a warning validator — a section the goal does not list, a
   register it does not list, anything but one slot of that register's kind, a
   candidate the runtime's strict schema refuses, a reserved identity — withholds
   that memory alone. The step endorses the rest only from a run the engine admits,
   whose every declared lens answered, and in which no safeguard criterion
   settled `fail`; otherwise it endorses none and says why (`not-accepted`,
   `no-rubric`, `no-artifact`, `judges-lost`, `safeguard-failed`), and it says
   `no-memories` when nothing was left to endorse.
4. **Before any write** (`POST …/remember`). The orchestration has settled, its
   digest step completed with a report that reads, its index names this space,
   and no apply of it is recorded. Each endorsed memory is then remembered in
   report order under the index's scope and provenance, with no metadata, and
   the apply is recorded once, after the writes (`memory_space_digest`).

A refusal of one memory (`register.unknown`, `operation.undeclared`,
`candidate.invalid`, `metadata.undeclared`) comes back as that memory's item,
beside the others; a refusal of the whole apply (`space.not_found`,
`space.not_compiled`, `scope.invalid`, `conflict`) aborts it with nothing
recorded, so the apply can be sent again whole. A digest that endorsed nothing
applies as an apply that wrote nothing. A withheld memory is reported by `GET`
and never written. Nothing is held between the three calls — the loop's record
is the job — so a host restart loses nothing; a loop that restarts mid-digest
leaves its digest step closed as `interrupted`, `remember` answers 422, and
digesting again is the recovery.

What the caller owns:

- **Provenance** is the text's own origin, `{ source, sourceRunId }`; the
  orchestration and the digest run sit on the ledger row beside each record id.
- **A text chunked into several digests** shares one `sourceRunId`, since
  consolidation counts distinct source runs, and its chunks are applied in text
  order, since supersession follows the order of the writes.
- **A re-digest** of the same text is its owner's to prevent, as memory-ingest's
  own ledger does for documents.

## 10. What is deliberately not here (yet)

- **Re-digest dedupe.** Nothing stops one text being digested twice; its owner
  keeps that ledger. Under the same `sourceRunId` a reworded episode appends
  beside the first and adds no support.
- **Same identity within one digest.** Two endorsed memories of one identity are
  both written, in report order, so the later supersedes the earlier, and the
  apply's items show it (`superseded`). No validator looks for it; the ledger
  measures it first.
- **Supersession by valid time.** A write supersedes the current record whatever
  their valid times, so applying an older text after a newer one rolls a fact
  back. A valid-time rule belongs to a runtime round of its own.
- **Digest metadata.** A digested memory is written with no metadata: a
  strategy's metadata mixes system, scope and body fields, and nothing declares
  which of them a text may ground.
- **Measured defaults.** The policy's numbers are starting values, to be calibrated
  against recall@k / MRR on recorded traffic.
- **Paged backfill.** A projection backfill reads every due record at once; a very
  large store wants it paged.
- **Semantic lesson grouping.** Lessons group by their declared key, exactly; two
  keys that mean the same thing are two lessons until a digest names them one.

## 11. File map

- Engine: `packages/agentic-memory/src/` — `space/` (policy, scope, compile),
  `kinds/`, `write/` (and the write brief, `brief.ts`), `recall/`, `lifecycle/`
  (consolidate, sweep), `service/`
- Adapters: `src/adapters/mikro-orm/` (the record and space stores),
  `src/adapters/pgvector/` (the vector index: the table and filter in
  `collection.ts`, the statements in `pgvector-vector-index.ts`, over the
  `SqlExecutor` of `@sysdesign/pgvector-kit` that `@sysdesign/db` implements
  on the ORM's entity manager)
- Fakes holding the same contract: `src/testing/` (and `record-store-contract.ts`
  and `space-store-contract.ts`, each run against both stores)
- Wire shapes and the record vocabulary: `packages/contracts/src/lib/agentic-system/memory.ts`
  (with the space name grammar); beside it, the space routes' refusal table (`space-host.ts`), a digest's goal codec (`register-digest.ts`) and its step report and
  host DTOs (`register-memory.ts`)
- Tables: `memory_space`, `memory_record` (`packages/db`, migration
  `Migration20261017100002_memory_space_and_record`; the space name and its partial
  unique index, `Migration20261024010002_memory_space_name`), and the digest apply ledger
  `memory_space_digest` (`Migration20261018100001_memory_space_digest`)
- Mount and policy: `packages/agentic-system/src/memory/`, `config/memory/standard.json`
- Digests: `packages/agentic-system/src/memory/digests/` — the service, the
  controller, the ledger port, and in `persistence/` its Postgres and in-memory
  adapters with the contract both run (`digest-ledger-contract.ts`); on the loop,
  `packages/quality-loop/src/pipelines/register-digest/` and
  `src/orchestrators/register-memory/`
- Criteria: `AGM-1`…`AGM-11` (`packages/criteria/src/agentic-memory.ts`); the
  mount's `AGS-8`…`AGS-12` (`agentic-system.ts`); the digest's goal, pipeline and
  orchestrator, `QL-75`…`QL-78` (`quality-loop.ts`)
