# The job assistant's memory plan

_Written 28 Oct 2026 (UTC). The files are in the working tree, not yet committed._

This folder holds the memory plan (a _memory strategy_) the job assistant's memory space is made from, as data beside the brief it answers. Three files:

| File                   | What it is                                                                                                                                                                                                                                                                                                                  |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `brief.md`             | The brief, in prose: what memory a form-filling assistant acting for one person needs, what it must do and its constraints. It was the goal of the judged run, byte for byte.                                                                                                                                               |
| `strategy.json`        | The plan, written by hand against the brief: four long-term `semantic` registers (`profile_fact`, `profile_story`, `claim_boundary`, `standing_answer`), 13 operations and 3 routines, plus the prose the judges read (summary, assumptions, safeguards, trade-offs, risks). This is the file the loop was handed to judge. |
| `strategy.judged.json` | The same plan as the loop kept it in the judged run's one round. Its content is identical to `strategy.json`; only the order of the keys differs, because the loop writes a strategy in its own order. The memory space was compiled from the loop's copy of the run, so this file shows exactly what the space runs.       |

## How it was judged

The loop judged the plan as provided, with no drafting of its own, in one round (the RUNBOOK's command, under "The job assistant's own memory space": `main.js run --pipeline memory-architecture --goal brief.md --output strategy.json --iterations 1`). The run is `2026-10-27T23-52-55-161-d2f2e4-quality`, 23:52 to 00:04 UTC on 27–28 Oct 2026, 11.7 minutes and 17 model calls.

- **Decision:** "revise", 56.7 of 100, all 24 checklist items graded, 11 confirmed problems. By area: governance 25, retrieval 50, completeness 57.1, scoping 62.5, lifecycle 62.5, ingestion 66.7.
- **What held it back:** both reviewer answers raised a `poisoning_risk` and a `constraint_violation`, and two constraint items (c12, c24) failed. The checks in code passed: the schema and every reference are valid; the coverage check warned that the `invalidate` operations are named by no routine; the size check noted 13 operations where 12 were asked for (15 are kept).
- **The decision does not stop a space.** A space is made from any settled run, as the two earlier live spaces were.

## How the space uses it

`PUT /spaces/by-name/job-assistant` with that run's id made the space at 00:05 UTC on 28 Oct 2026. Its compile report has no problems and no warnings; its scope keys are `tenant`, `project`, `user`, `unit`; it has no episodic register, so consolidation is unavailable by design, and nothing in it expires. The job assistant's brain settings, `packages/browser-session/config/brain/memory.json`, name the same run under `binding.space.runId`, and the document ingester reaches the space by its name (`MEMORY_SPACE_NAME`, or `--space` on its commands).

## To change the plan

Edit `strategy.json`, judge it again (a new run, so a new run id), and ensure the space under a **new** name from that run: a name is held for good by the run that first ensured it, and there is no route yet to free one. Then write the new run id and name into the brain file, and the new name wherever the ingester and its commands name the space. Keep the loop's copy of the new run beside the edited plan, as `strategy.judged.json` is kept here.

## Where to read more

- [Agentic memory: what's built and how it works](../../overview.md), Part 4, for the client, the memory brain, the ingester's space store and what has been measured on this space.
- [The memory designer](../../memory-design-capability.md), for what a strategy is and how the loop judges one.
- [The RUNBOOK](../../../../RUNBOOK.md), "The job assistant's own memory space", for the commands that judge, bind, seed and replay.
