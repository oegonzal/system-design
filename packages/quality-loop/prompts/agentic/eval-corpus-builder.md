# Turn failures into a corpus that stays worth running

**Archetype:** agentic-workflow · **Difficulty:** standard

## Scenario

A team changes the personas, thresholds and policies of its agent workflows constantly, and has no way of knowing whether a change helped. Every day the workflows produce failures worth learning from: an artifact that was accepted and should not have been, a defect that three critics missed, a decision that escalated when it should have resolved. The team wants those failures captured as a corpus that any candidate change can be run against. Two failure modes have already killed earlier attempts at this. The corpus filled with fifty variations of the same easy failure, so a change that fixed one appeared to fix everything. And it went stale — cases were kept long after the behaviour they guarded had been deliberately changed, so the suite failed for reasons nobody wanted fixed. Design the service that builds and maintains this corpus.

## Capabilities

1. The service turns a finished run over an arbitrary input string into a reusable case, with no rule that understands the brief's subject and no per-domain conversion.
2. A case records the input, what happened, and what should have happened, in a form that can be replayed against a changed configuration without the original run.
3. A candidate case that is materially the same as one already held is recognised even when worded differently, and does not become a second case.
4. The corpus is kept balanced across the kinds of failure it holds, and the service reports which kinds are thin rather than silently over-representing whichever fails most often.
5. A case whose expected outcome no longer reflects intended behaviour is flagged for review rather than either failing forever or being deleted automatically.
6. Cases carry the evidence that justified them, so a reviewer can see why the outcome was called a failure.
7. Running the corpus against a configuration produces a comparable result, and two runs of the same corpus against the same configuration agree.
8. Cases can be retired, and a retired case's history remains readable so that a regression it once caught is not forgotten.
9. The service reports what the corpus covers and what it does not, in terms of the failure kinds rather than raw counts.

## Interfaces that must hold

1. A finished run crosses to whatever builds cases as input, outcome and evidence alone; the builder may assume nothing about which producer made the artifact or what shape the artifact took.
2. A candidate case is compared for sameness against the held corpus before admission, and that comparison consumes the case's own content rather than where it came from, so two runs of different workflows can still collide.
3. A case handed to whatever replays it carries everything the replay needs, so the runner never reaches back to the original run — which may by then have been deleted.
4. A case whose expectation has gone stale crosses to review carrying what changed; there is no path from staleness to deletion that does not pass a person.

## Properties

| Property      | What it must mean here                                                                      |
| ------------- | ------------------------------------------------------------------------------------------- |
| balance       | No single failure kind dominates the corpus, and thin kinds are reported rather than hidden |
| determinism   | The same corpus and the same configuration give the same result                             |
| traceability  | Every case resolves to the run that produced it, and every retirement stays readable        |
| extensibility | A new kind of failure is data; capturing one costs no change to the builder                 |

## Constraints

- The inputs are opaque strings of arbitrary subject, so cases cannot be grouped by parsing what they are about.
- A case is only worth keeping if it would fail against the configuration that produced it and pass against the fix, and the service must be able to establish both.
- Reviewers are scarce; anything demanding human attention must be rare, batched and clearly justified.
