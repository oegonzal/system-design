# Prompt — Run a declared graph of agents over a brief nobody anticipated

**Archetype:** agentic-orchestration · **Difficulty:** hard

## Scenario

A team automates review, research and migration work by spawning Claude Code CLI processes, each a separate operating-system process that reads a prompt and returns text or a structured object. Today every piece of work is a bespoke script: someone writes a loop, hard-codes how many processes to start, and hand-rolls the collection of results. The scripts diverge, none of them resume after a crash, and nobody can say afterwards why a particular process ran. The team wants workflows expressed as data — a set of nodes and the edges between them — so that a new kind of work is a new declaration rather than new engine code, and so a run that dies halfway can continue without paying for the agents that already answered. Their house pattern is already fixed: something proposes, critics look for defects, evaluators measure against criteria, and a controller decides what happens next from stated rules. Design the engine that executes these graphs.

## Functional requirements

1. The engine accepts an arbitrary input string as the brief for a run — a markdown document nobody wrote the engine for — and executes the declared graph against it without any rule that inspects the brief's prose, branches on its subject, or requires it to match a known shape.
2. A workflow is a declaration of nodes and edges, submitted as data; adding a new workflow requires no change to the engine.
3. A node spawns one agent process with a prompt, and either returns free text or is required to answer a declared schema, in which case a non-conforming answer is retried and then failed rather than passed on.
4. A node may fan out over a list computed at runtime, and a downstream node may either join all of its results or begin as soon as any single upstream chain reaches it.
5. A run that is interrupted can be resumed, replaying the results of nodes whose prompt and inputs are unchanged and re-executing only what changed or never ran.
6. Concurrency is bounded, and the engine states what it queued rather than starting everything it was asked to.
7. A node that fails, is skipped, or returns nothing leaves a recorded reason from a closed vocabulary, and its dependents are told rather than silently receiving nothing.
8. Every run produces a record from which the execution can be reconstructed: which nodes ran, in what order, with what inputs, and why the run ended.
9. Progress is observable while the run is in flight, not only after it finishes.

## Non-functional requirements

| Kind         | Requirement                                                     | Target                      |
| ------------ | --------------------------------------------------------------- | --------------------------- |
| determinism  | The same declaration and inputs produce the same execution plan | identical node ordering     |
| auditability | Any completed run can be explained from its record alone        | zero unexplained nodes      |
| degradation  | One failing node never leaves the run unable to report          | zero silent abandonments    |
| isolation    | One run's failure cannot affect another in flight               | zero cross-run interference |

## Scale targets

| Metric          | Target |
| --------------- | ------ |
| Agents per run  | 40     |
| Graph depth     | 6      |
| Concurrent runs | 8      |

## Constraints

- The brief is an opaque string. No component may parse it for structure, key off headings or phrases in it, or hold a registry of the kinds of brief it knows.
- Agent processes are slow, occasionally hang, and sometimes return prose where an object was demanded; none of that may take down the run.
- A workflow declaration may describe a graph that cannot be executed — a cycle, a node depending on one that does not exist — and the engine must refuse it before spending anything rather than partway through.
