# Roll features out gradually and roll them back faster

**Archetype:** feature-flags · **Difficulty:** standard

## Scenario

You own the way a product with web and mobile clients ships change. Product managers want percentage rollouts, targeting by customer, a kill switch that bites in seconds, and an answer to "which users saw the new path on that date". Mobile clients may run a month-old build and spend hours offline. Design the flag system and how a change travels through it.

## Functional requirements

1. Define a flag with rules: a percentage, a list of customers, a segment, a date range.
2. Evaluate a flag for a user the same way on every device and every request, so a user does not flip between paths.
3. Change a flag's rules without a deploy, and switch a flag off everywhere in seconds.
4. Record which users were exposed to which path, so a question about a date can be answered.
5. Retire a flag once a feature is permanent, and find the code that still asks about it.

## Domain and data

- A flag, its rules, a segment and an exposure are distinct records; a flag has a lifecycle from temporary to permanent to retired.
- An evaluation context — user, customer, device, build — is what a rule reads; it is never guessed from a request.
- An exposure is recorded once per user per flag per version of its rules, not once per request.

## Interfaces

- The client SDK contract: how a client bootstraps its flags, learns of changes, and what it does with a flag it has never heard of.
- Exposure events are published for analysis; the evaluation path never waits for them.
- Rule changes are commands with an author and a reason, so a rollback knows what it undoes.

## Non-functional requirements

| Kind         | Requirement                                        | Target                |
| ------------ | -------------------------------------------------- | --------------------- |
| availability | An evaluation never blocks a request               |                       |
| consistency  | A kill switch reaches every online client          | within thirty seconds |
| durability   | Exposures are kept long enough to answer a dispute | ninety days           |

## Decisions to make

- Evaluate on the server and ship decisions, or ship rules and evaluate on the client — and what each costs offline and in secrecy.
- The sticky bucketing key: user, device or session, and what happens when a user signs in on a second device.
- How a client degrades on a stale rule set: last known decisions, defaults, or refusing the new path.

## Constraints

- Mobile clients may run a build a month old and must still behave sensibly.
- Rules are edited by product managers, not engineers; the editing surface is part of the design.
