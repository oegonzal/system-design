# Run an approval chain that survives absences and deadlines

**Archetype:** approval-workflow · **Difficulty:** standard

## Scenario

You own purchase approvals for a company where a request climbs a chain of approvers chosen by its amount and department. Approvers go on leave and delegate for a date range; a step that misses its deadline reminds, then escalates; a request amended mid-chain restarts only the steps its change invalidated. Finance's system of record takes approved requests in a nightly batch and must be able to attribute every decision to one named person. Design the workflow and the service that carries it.

## Functional requirements

1. A submitted request gets its chain from its amount and department, and the first approver is told.
2. An approver approves or rejects with a note; a rejection ends the chain and tells the requester why.
3. An approver delegates to a colleague for a date range; decisions the delegate makes are recorded as the delegate's.
4. A step that passes its deadline sends a reminder, and past a second deadline escalates to the approver's manager.
5. A request amended while in flight re-runs the steps its change invalidated and keeps the rest.
6. Anyone may read a request's exact state: where it is, who holds it, what happened and when.

## Domain and data

- A request, its steps, each decision, each delegation and each escalation are distinct records; the chain is built once and kept.
- A step has one active approver at a time; a delegation changes who that is without rewriting the step.
- A request moves through declared states — submitted, in review, approved, rejected, amended — and a decision is final once made.

## Interfaces

- Submit, decide, delegate and amend are commands keyed by request and step, so a retried command repeats nothing.
- Finance's batch reads approved requests through a contract that names the deciding person for every step.
- Reminders and escalations are events a notification service consumes; the workflow does not send mail itself.

## Non-functional requirements

| Kind         | Requirement                                                | Target                   |
| ------------ | ---------------------------------------------------------- | ------------------------ |
| durability   | No decision is ever lost or attributed to the wrong person |                          |
| consistency  | A deadline fires when it is due                            | within one minute        |
| availability | Approvers can decide during business hours                 | 99.9% during 07:00–20:00 |

## Decisions to make

- A state machine per request, or an event-sourced history replayed into one — and what each costs when an amendment restarts steps.
- Who holds the clock: a scheduler that fires deadlines, or a query over due dates that runs on a tick.
- What undo means when a delegate has already decided and the delegation is withdrawn.

## Constraints

- Finance's system of record is batch, nightly; it cannot be called per decision.
- A decision must be legally attributable to one named person, delegate or not.
