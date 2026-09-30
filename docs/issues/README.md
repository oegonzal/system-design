# Known issues and recommended improvements

A register — not a changelog, not a roadmap. Every entry is a defect, a gap
against a requirement this project states, or a deliberate deferral that
someone would otherwise rediscover. Each carries the evidence it was verified
on and what would close it, so the next piece of work can cite an id instead
of re-deriving the problem.

| File                                                   | Area                                                           | Prefix   |
| ------------------------------------------------------ | -------------------------------------------------------------- | -------- |
| [quality-loop-engine.md](./quality-loop-engine.md)     | the generic loop: normaliser, scoring, controller, replay      | `ENG`    |
| [memory-and-retrieval.md](./memory-and-retrieval.md)   | recall, digest, admission, the vector store                    | `MEM`    |
| [llm-seam-and-runtime.md](./llm-seam-and-runtime.md)   | `packages/llm`, boot, the hook, CI                             | `SEAM`   |
| [studio-grading-engine.md](./studio-grading-engine.md) | the studio's grader, now the quality loop; closed entries kept | `STUDIO` |
| [platform-and-hygiene.md](./platform-and-hygiene.md)   | observability, hosting, Tilt, docs, repo hygiene               | `PLAT`   |

## Conventions

- **Id** `<AREA>-<n>`, never reused. A commit that closes an entry names the
  id in its message; the entry is then marked `closed` with the hash rather
  than deleted, so the reasoning stays findable.
- **Status.** `open` — a change is warranted and specified. `watch` —
  measured, not yet actionable; the entry names the number to watch.
  `accepted` — deliberate, not built by choice, with the reason. `blocked` —
  waits on data or a decision it names.
- **Severity.** `high` changes what a score, a decision or a stored lesson
  means, or contradicts a stated requirement. `medium` affects learning, cost
  or operability. `low` is hygiene. `watch` and `accepted` entries carry none.
- **Shape.** _Where · What · Evidence · Recommendation · Verify._ Evidence is
  a run id, a commit, a file, or a section of a page under `docs/`. An entry
  without evidence is a suspicion and does not belong here.

## Index

| Id       | Title                                                                    | Status   | Severity |
| -------- | ------------------------------------------------------------------------ | -------- | -------- |
| ENG-1    | Penalty-only dimensions carry weight without information                 | open     | high     |
| ENG-2    | One lost sample voids a whole lens                                       | open     | high     |
| ENG-3    | Defect grouping chains through shared refs                               | open     | medium   |
| ENG-4    | No `evidenceRefs` distinct from `locationRefs`                           | accepted | —        |
| ENG-5    | Memory reaches the producer only through the goal                        | accepted | —        |
| ENG-6    | The trace lands only when the loop ends                                  | accepted | —        |
| ENG-7    | No response memoisation; a re-grade re-bills                             | open     | medium   |
| ENG-8    | `agentic-design` accepts 6 of 40 iterations                              | watch    | —        |
| ENG-9    | `replay` reads one page and does not say so                              | open     | low      |
| ENG-10   | A boot sweep fails another process's live run; its close cannot undo it  | closed   | —        |
| MEM-1    | Persona compliance still costs admission                                 | open     | medium   |
| MEM-2    | Memory transfers, but improving answers is unproven                      | open     | high     |
| MEM-3    | No retrieval score floor; RRF trades sharpness for breadth               | open     | medium   |
| MEM-4    | A one-domain store injects little across domains                         | watch    | —        |
| MEM-5    | Write-time deduplication, measured and not built                         | accepted | —        |
| MEM-6    | Nothing prunes either store; the embedding cache never expires           | open     | low      |
| MEM-7    | Prepared but unused: keyword indexes, payload fields, an untyped `using` | accepted | —        |
| MEM-8    | `reindex` and `retrieval-report` have no specs                           | open     | medium   |
| MEM-9    | Not built by choice, listed so nobody rediscovers them                   | accepted | —        |
| MEM-10   | The digest routinely ends `revise` at its iteration cap                  | watch    | —        |
| MEM-11   | `MemoryStepDto.counts` keys are a convention, not a vocabulary           | open     | low      |
| SEAM-1   | The no-op client is still wired in                                       | closed   | —        |
| SEAM-2   | No retry on a schema miss                                                | open     | high     |
| SEAM-3   | No temperature, seed or memoisation at the seam                          | open     | medium   |
| SEAM-4   | The boot sweep interrupts in-flight runs from any process                | closed   | —        |
| SEAM-5   | The pre-commit review runs no critics on the subscription route          | open     | medium   |
| SEAM-6   | CI never calls a model; no judge-regression harness                      | open     | medium   |
| STUDIO-1 | Archetypes still drive prompt generation and coverage                    | closed   | —        |
| STUDIO-2 | Two grading engines coexist                                              | closed   | —        |
| STUDIO-3 | Critic and evaluator collapse into one weakness ordinal; no controller   | closed   | —        |
| STUDIO-4 | Judge robustness is containment, not measurement                         | closed   | —        |
| STUDIO-5 | A thin finding contract and two display leaks                            | closed   | —        |
| STUDIO-6 | Lenses are code, not records, and run serially                           | closed   | —        |
| STUDIO-7 | Dumps are read by nothing; no incident loop                              | open     | medium   |
| STUDIO-8 | `EVAL_DETERMINISTIC` grades with rules alone                             | closed   | —        |
| PLAT-1   | No observability integration                                             | open     | high     |
| PLAT-2   | Nothing declared or deployed on AWS                                      | open     | medium   |
| PLAT-3   | Tilt covers the studio but not the vector store or the quality loop      | open     | medium   |
| PLAT-4   | The quality-loop client has no browser journey                           | open     | low      |
| PLAT-5   | Stale counts in four places                                              | open     | low      |
| PLAT-6   | A root-level file outside every gate                                     | open     | low      |
| PLAT-7   | A tracked note that trips the branding tripwire, already in history      | open     | high     |
| PLAT-8   | Not built at single-user scale: review queue, monitors, canary           | accepted | —        |
| PLAT-9   | No docs index                                                            | open     | low      |

## Recommended improvements, by leverage

Ordered by how much of what the system reports would change meaning if the
entry were closed, then by cost. Each points at the entry that specifies it.

1. **Fail fast without a model** — closed: SEAM-1, and STUDIO-8 before it.
   The loop boots only with a model provider and exits naming both variables
   otherwise; the no-op client is gone, so no run can look graded when it was
   not. ENG-10 and SEAM-4 closed beside it: a running row heartbeats, only a
   stale one is swept, and a late close reclaims a swept row with the truth.
2. **Retry a schema miss once** — SEAM-2, ENG-2. One lost sample currently
   escalates a whole run and withholds every memory it would have injected.
3. **Every declared dimension earns** — ENG-1. Twenty-three points of every
   `system-design` score are a constant; four of its six finding types are
   free.
4. **Prove memory improves answers** — MEM-2. Transfer is measured; benefit
   is not. A paired experiment is one script and ten runs.
5. **One grading engine** — closed: STUDIO-2 and the entries that folded
   into it. The studio grades, coaches and drafts prompts through the loop.
6. **OpenTelemetry, then a vendor** — PLAT-1. The metrics worth a dashboard
   (schema-miss rate, escalation rate, admission ratio) are already in the
   records; nothing exports them.
7. **Admission semantics as data** — MEM-1. The remaining admission loss is a
   persona asking for what a declaration could guarantee.
8. **Anchor-based defect grouping** — ENG-3, gated by a replay over the
   recorded raw reports.
9. **The incident loop** — STUDIO-7. Dumps into fixtures; the doctrine's last
   stage.
10. **A retrieval floor, after re-measuring** — MEM-3. Deferred at six chunks;
    the store is at 287.

## Adding an entry

Take the next number in the area. Write the five parts; if you cannot name
evidence, measure first. Add the row to the index above. If the entry
supersedes another, say so in both. Keep the title a claim, not a topic —
"one lost sample voids a whole lens", not "sampling".
