# The agentic-memory runtime — a memory strategy, executed

_How `packages/agentic-memory` turns a strategy the `memory-architecture` pipeline
wrote into running memory: typed writes that reconcile, recall that routes by what
it is asked, consolidation that promotes episodes to lessons to playbooks, and a
lifecycle that ages short-term state away and keeps the index rebuildable._

The design tool ([memory-design-capability.md](memory-design-capability.md))
produces a **strategy**: registers, the typed interfaces over them, and the
workflows that move memory through them. This runtime is what executes one. It
follows `docs/memory/memory-designing.md`'s recommended starting design —
PostgreSQL as the source of truth, a derived and rebuildable Qdrant projection,
and a dedicated Memory Service with a provider-independent typed API — and keeps
facts, events, state and procedures apart, as that document insists.

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
  contracts, `analyzeStrategy`, over the typed declarations and the kind→role table
  (`CONSOLIDATION_ROLES`: episodes are the evidence, semantic registers keep the
  lessons, procedural registers keep the playbooks). The `memory-architecture`
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
valid-time field, its text template, whether it is projected, and its
consolidation role. The engine reads these and nothing else, so a new or changed
kind is a registry entry, not an engine edit.

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

In Postgres this is `partition = $p and scope <@ $request`. In Qdrant it is the
partition, then for every _other_ policy key either "unset on the point or equal
to the request's" or, when the request does not name the key, "unset" — a loop
over the policy's keys, never the request's, which would let a user's memory leak
tenant-wide.

## 8. The sweep

A periodic job across every space:

- **expires** short-term records past their time to live (`valid_to` = the expiry);
- **removes** the points of records that closed;
- **projects** every current record whose point is not in the current collection.

The collection name binds the embedding model and its width, so changing either
starts an empty collection that the sweep backfills from Postgres. Until it
finishes, recall by meaning has a gap; exact and temporal recall do not.

## 9. HTTP — `packages/agentic-system`, `/spaces`

| route                          | does                                                                                                                                                              |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /spaces { runId }`       | compile a settled `memory-architecture` run's best strategy into a space — finished or failed, never still running; 201 with its report, or 422 with the problems |
| `GET /spaces/:id`              | the space and its compile report                                                                                                                                  |
| `POST /spaces/:id/remember`    | `{ register, scope, candidate, provenance, metadata }`                                                                                                            |
| `POST /spaces/:id/update`      | `{ recordId, scope, candidate, provenance, metadata }`                                                                                                            |
| `POST /spaces/:id/invalidate`  | `{ recordId, scope, reason }`                                                                                                                                     |
| `POST /spaces/:id/history`     | `{ recordId, scope }` — every version                                                                                                                             |
| `POST /spaces/:id/recall`      | `{ scope, key?, text?, since?, until?, registers?, where? }`                                                                                                      |
| `POST /spaces/:id/consolidate` | `{ scope }`                                                                                                                                                       |

Every refusal has one declared status, its body carrying the refusal's `code`:

- **404** — `space.not_found`, `record.not_found`, `run.not_found`, each naming
  what is `missing` (`space`, `record`, `run`);
- **409** — `record.not_current`, `conflict`, and `run.in_flight` (a run still
  running has no settled strategy yet);
- **422** — the rest: an undeclared verb, an invalid scope, candidate or metadata,
  an unavailable consolidation, a space that no longer compiles, and
  `run.no_strategy`;
- **400** — a body the request schema refuses, naming every offending path;
- **502 / 503 / 504** — the quality loop refused, could not be reached, or was too
  slow, when `POST /spaces` reads the run.

## 10. What is deliberately not here (yet)

- **LLM digest.** `remember` takes typed memories. Extracting them from raw text is
  the next round: a quality-loop pipeline whose output schema is these candidate
  schemas, its endorsement reported, feeding this write path.
- **Measured defaults.** The policy's numbers are starting values, to be calibrated
  against recall@k / MRR on recorded traffic.
- **Paged backfill.** A projection backfill reads every due record at once; a very
  large store wants it paged.
- **Semantic lesson grouping.** Lessons group by their declared key, exactly; two
  keys that mean the same thing are two lessons until a digest names them one.

## 11. File map

- Engine: `packages/agentic-memory/src/` — `space/` (policy, scope, compile),
  `kinds/`, `write/`, `recall/`, `lifecycle/` (consolidate, sweep), `service/`
- Adapters: `src/adapters/mikro-orm/` (Postgres), `src/adapters/qdrant/`
- Fakes holding the same contract: `src/testing/` (and `record-store-contract.ts`,
  run against both stores)
- Wire shapes and the record vocabulary: `packages/contracts/src/lib/agentic-system/memory.ts`
- Tables: `memory_space`, `memory_record` (`packages/db`, migration
  `Migration20261017100002_memory_space_and_record`)
- Mount and policy: `packages/agentic-system/src/memory/`, `config/memory/standard.json`
- Criteria: `AGM-1`…`AGM-10` (`packages/criteria/src/agentic-memory.ts`)
