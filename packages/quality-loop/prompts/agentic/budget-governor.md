# Prompt — Spend a fixed budget across a running graph and defend the cuts

**Archetype:** agentic-workflow · **Difficulty:** standard

## Scenario

A run of agents can cost anything from a few thousand tokens to several million, and the difference is rarely visible when the run is declared. A graph that fans out over a list discovered at runtime might spawn four agents or four hundred. Teams currently control this by guessing a concurrency limit up front and killing runs that take too long, which wastes everything the run had already paid for and produces no answer at all. What they want instead is a governor: a fixed budget handed to a run, spent across the graph as it executes, with the decisions about where to spend more and where to go shallow made by stated rules rather than by whichever node asked first. Above all, a run that cannot afford everything must say what it left out, because a truncated answer that looks complete is worse than an honest partial one. Design the governor.

## Capabilities

1. The governor administers a budget for work over an arbitrary input string, with no rule that estimates cost from the brief's subject and no per-domain allowance.
2. A run is given a total budget at the start, and every agent call is charged against it before the next allocation decision is made.
3. When a fan-out would exceed what remains, the governor decides how many branches to run by stated rules, rather than starting them all and failing partway.
4. The rules can prefer depth or breadth according to the declared workflow, and that preference is data rather than code.
5. Work that has already been paid for is never discarded to make room for new work.
6. Anything the governor declines to run is recorded as declined, with the reason and what it would have covered, and appears in the run's result.
7. A run that exhausts its budget returns what it has, marked as partial, rather than failing or silently presenting a subset as the whole.
8. The governor reports remaining budget while the run is in flight, so a caller can raise it before work is cut.
9. Two runs sharing a pool cannot starve one another, and the sharing rule is stated rather than emergent.

## Interfaces that must hold

1. Every caller that would spend asks the governor first and receives either an allowance or a stated refusal; a zero allowance and a refusal are distinguishable, so a caller never reads silence as permission.
2. Whatever executes a call reports the actual cost back afterwards, and the governor may assume a reported cost is final and will not be revised.
3. A declined branch crosses to whatever assembles the result in the same shape a completed one does, carrying its reason and what it would have covered, so the assembler cannot omit it by forgetting to look.
4. A caller raising or lowering a budget mid-run reaches the governor through the same path as the initial grant, so there is one place where the budget changes and one order in which changes apply.

## Properties

| Property     | What it must mean here                                                                   |
| ------------ | ---------------------------------------------------------------------------------------- |
| honesty      | A partial result is always labelled as partial, and never presented as the whole         |
| determinism  | The same budget and the same graph produce the same allocation decisions                 |
| auditability | Every declined branch is recorded with its reason, so nothing is omitted unexplained     |
| fairness     | Two runs sharing a pool cannot starve one another, by a rule stated rather than emergent |

## Constraints

- The brief is opaque, so the cost of answering it cannot be predicted from it and must be discovered as the run proceeds.
- Agent costs are known only after a call returns, so allocation must work from estimates that are sometimes wrong in both directions.
- A caller may raise or lower a running budget at any time, and the governor must honour it without abandoning work in flight.
