# Prompt — Choose the right specialist graph for a brief you have never seen

**Archetype:** agentic-routing · **Difficulty:** hard

## Scenario

One endpoint receives every kind of work a team throws at it: review this change, research this question, migrate these files, explain this subsystem, audit this dependency. Each kind is best served by a different arrangement of agents — a review wants many finders and an adversarial verifier, a migration wants one worker per file in isolation, an explanation wants a single deep reader. Today a person picks the arrangement by hand, and the wrong pick is expensive in both directions: a heavyweight graph on a trivial question wastes an hour of machine time, and a lightweight one on a hard question produces a confident, shallow answer. The team wants the arrangement chosen automatically from declarative profiles, where a profile names the graph, the personas and the thresholds for one kind of work. The hard part is that new kinds of work arrive constantly and nobody can enumerate them in advance. Design the service that decides which profile a brief gets.

## Functional requirements

1. The service takes an arbitrary input string and selects a profile for it, with no rule that matches phrases in the brief, no per-domain branch, and no requirement that the brief announce its own kind.
2. A profile is a declaration — the graph to run, the personas to use, the thresholds to apply — and adding one requires no change to the routing engine.
3. A brief that matches no profile well is routed to a general-purpose path and answered, never refused for being unrecognised.
4. The selection is accompanied by a stated confidence and the evidence behind it, both recorded with the run.
5. Where confidence is below a stated threshold, the service takes the cheaper of the candidate profiles rather than the better-scoring one, and records that it did.
6. A profile may be selected on the strength of how similar the brief is to briefs that profile has served well before, so the choice improves as more runs complete.
7. The decision to route is made by stated rules over the evidence; no classifier output is by itself permitted to select a profile.
8. An operator can see, for any past run, which profiles were considered, what each scored, and which rule decided.
9. A profile can be retired or replaced without invalidating the records of runs that used it.

## Non-functional requirements

| Kind          | Requirement                                             | Target                         |
| ------------- | ------------------------------------------------------- | ------------------------------ |
| determinism   | The same brief and the same profiles route the same way | identical selection            |
| degradation   | Routing continues when the classifier is unavailable    | falls back to the general path |
| auditability  | Every routing decision is explainable after the fact    | zero unexplained routes        |
| extensibility | A new profile is data, never code                       | zero engine changes            |

## Scale targets

| Metric          | Target |
| --------------- | ------ |
| Profiles        | 25     |
| Routes per hour | 200    |
| Graph depth     | 5      |

## Constraints

- The brief is an opaque string of arbitrary length and subject. Nothing may key off its wording, its formatting, or a list of expected kinds.
- Profiles are authored by people who do not read the routing code, so a malformed profile must be refused with a stated reason rather than routing badly.
- Choosing wrongly must be recoverable: a run that turns out to be on the wrong profile should be re-routable without losing what has already been paid for.
