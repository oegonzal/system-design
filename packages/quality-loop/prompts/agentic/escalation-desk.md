# Prompt — Decide what a person has to look at

**Archetype:** agentic-workflow · **Difficulty:** standard

## Scenario

Agent workflows produce outcomes all day, and most of them are fine. A minority are not: the evidence was thin, the judges disagreed, a defect needed a decision nobody had authority to make, or the artifact was accepted at a score just over the line. A team of four reviewers can look at perhaps forty items a day between them, against thousands of runs. Today everything below a hand-set score goes to a queue, which is either flooded or empty depending on the week, and reviewers see the same kind of easy case over and over while genuinely ambiguous ones time out unseen. The team wants a desk that decides what a person must see from a stated policy, presents it with enough context to decide quickly, and gets better at the threshold over time — without ever letting the system quietly raise its own bar to reduce its workload. Design the desk.

## Capabilities

1. The desk takes outcomes of work over arbitrary input strings and decides which need a person, with no rule specific to a domain and no list of kinds it knows how to triage.
2. The decision follows a stated policy over the structured evidence — how much was assessed, how far judges disagreed, which gates were open, how close the score sat to a threshold — and no model output alone routes an item to or away from a person.
3. An item sent for review arrives with the evidence, the decision that was made, and the specific question the reviewer is being asked, rather than the whole record to read from scratch.
4. The queue is ordered by stated rules, and an item that has waited too long is escalated rather than starved by newer, higher-scoring ones.
5. Items that raise materially the same question are grouped so a reviewer answers once.
6. A reviewer's decision is recorded against the evidence that prompted it, in a form that can later be used to measure how well the policy predicted them.
7. Thresholds may be revised in light of those recorded decisions, but only through an explicit, reviewable change, never automatically by the desk itself.
8. When reviewers are unavailable, items queue with a stated waiting reason and nothing is auto-accepted to clear a backlog.
9. The desk reports what it sent, what it withheld, and how reviewers ruled, so the cost of the policy is visible.

## Interfaces that must hold

1. Whatever finishes a run hands the desk structured evidence — assessed share, judge disagreement, gate states, distance to the threshold — and never a recommendation about whether a person is needed.
2. An item crossing to a reviewer carries the specific question being asked alongside the evidence behind it, so the reviewer may assume no further reading is required to answer.
3. A reviewer's ruling returns attached to the evidence that prompted it, in a shape a later measurement can consume without knowing which reviewer gave it or when.
4. Whatever proposes a revised threshold consumes recorded rulings and produces a proposal for review; it has no path that applies one, so the desk cannot move its own bar.

## Properties

| Property     | What it must mean here                                                                                 |
| ------------ | ------------------------------------------------------------------------------------------------------ |
| determinism  | The same evidence and the same policy always route the same way                                        |
| integrity    | The system never widens its own threshold to shed load                                                 |
| auditability | Every withheld item can be shown to have met the stated policy                                         |
| degradation  | Reviewers being unavailable queues work with a stated reason; it never auto-accepts to drain a backlog |

## Constraints

- The work under review is about anything; nothing may triage by subject or by a catalogue of expected cases.
- Reviewer attention is the scarcest resource in the system and must be treated as a budget, not an overflow.
- A backlog must never be resolved by lowering the bar, because the record would then show agreement that never happened.
