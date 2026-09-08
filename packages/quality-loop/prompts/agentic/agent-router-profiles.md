# Prompt — Choose the right specialist graph for a brief you have never seen

**Archetype:** agentic-workflow · **Difficulty:** hard

## Scenario

One endpoint receives every kind of work a team throws at it: review this change, research this question, migrate these files, explain this subsystem, audit this dependency. Each kind is best served by a different arrangement of agents — a review wants many finders and an adversarial verifier, a migration wants one worker per file in isolation, an explanation wants a single deep reader. Today a person picks the arrangement by hand, and the wrong pick is expensive in both directions: a heavyweight graph on a trivial question wastes an hour of machine time, and a lightweight one on a hard question produces a confident, shallow answer. The team wants the arrangement chosen automatically from declarative profiles, where a profile names the graph, the personas and the thresholds for one kind of work. The hard part is that new kinds of work arrive constantly and nobody can enumerate them in advance. Design the service that decides which profile a brief gets.

## Capabilities

1. The service takes an arbitrary input string and selects a profile for it, with no rule that matches phrases in the brief, no per-domain branch, and no requirement that the brief announce its own kind.
2. A profile is a declaration — the graph to run, the personas to use, the thresholds to apply — and adding one requires no change to the routing engine.
3. A brief that matches no profile well is routed to a general-purpose path and answered, never refused for being unrecognised.
4. The selection is accompanied by a stated confidence and the evidence behind it, both recorded with the run.
5. Where confidence is below a stated threshold, the service takes the cheaper of the candidate profiles rather than the better-scoring one, and records that it did.
6. A profile may be selected on the strength of how similar the brief is to briefs that profile has served well before, so the choice improves as more runs complete.
7. The decision to route is made by stated rules over the evidence; no classifier output is by itself permitted to select a profile.
8. An operator can see, for any past run, which profiles were considered, what each scored, and which rule decided.
9. A profile can be retired or replaced without invalidating the records of runs that used it.

## Interfaces that must hold

1. Whatever scores a brief against the available profiles hands the decider evidence and a confidence, never a chosen profile — the choice crosses the boundary in one direction only.
2. A profile declaration is validated before it can be offered to anything; a malformed one is refused at that boundary with a stated reason, so the decider may assume every candidate it sees is runnable.
3. Whatever selects hands the executor a profile together with the reason it was chosen, and the executor may assume the profile's graph, personas and thresholds are internally consistent.
4. A re-route consumes what the first route already paid for, so whatever executes must expose completed work in a shape a second, different profile can adopt without re-running it.

## Properties

| Property      | What it must mean here                                                                                     |
| ------------- | ---------------------------------------------------------------------------------------------------------- |
| determinism   | The same brief and the same set of profiles route the same way every time                                  |
| degradation   | Routing continues when the classifier is unavailable, falling back to the general path rather than failing |
| auditability  | Every routing decision is explainable after the fact, including the ones that took the cheaper option      |
| extensibility | A new profile is data; adding, retiring or replacing one costs no engine change                            |

## Constraints

- The brief is an opaque string of arbitrary length and subject. Nothing may key off its wording, its formatting, or a list of expected kinds.
- Profiles are authored by people who do not read the routing code, so a malformed profile must be refused with a stated reason rather than routing badly.
- Choosing wrongly must be recoverable: a run that turns out to be on the wrong profile should be re-routable without losing what has already been paid for.
