# Keep an audit log that stands up in a dispute

**Archetype:** audit-log · **Difficulty:** standard

## Scenario

You own the audit log of a regulated product. Every change to a customer's data must be recorded with who made it, when, from where, and what it changed; auditors query years back and must be able to prove no entry was altered or removed; and a customer may demand the erasure of their personal data without breaking the proof for everyone else. Services across the product write to it, some synchronously and some not. Design the model and the service that keeps it.

## Functional requirements

1. Record every change with the actor, the time, the origin, the resource and the before and after values.
2. Prove, for any range of entries, that none was altered, removed or inserted after the fact.
3. Search entries by actor, resource and time, and page through years of them.
4. Redact a person's personal fields from past entries while the entries themselves stay provable.
5. Export a range for an auditor in a form they can verify without the system.

## Domain and data

- An entry, its actor, its resource, its change set and its place in the chain are distinct; an entry is append-only once written.
- Entries carry a retention class that says how long they must be kept and who may change that.
- A redaction leaves a tombstone that says a field was removed, by whom and under which request, without saying what it held.

## Interfaces

- Every service writes through one contract; the contract says whether a write is confirmed before the caller continues or applied after.
- The auditor's read API pages by cursor and never by offset, so a range read twice reads the same entries.
- A redaction request is a command of its own, recorded in the log it edits.

## Non-functional requirements

| Kind       | Requirement                                            | Target                  |
| ---------- | ------------------------------------------------------ | ----------------------- |
| durability | No gap in the chain, ever                              | zero                    |
| security   | A redacted value is unrecoverable from anything kept   |                         |
| cost       | Years of entries stay affordable to keep and to search | retention met in budget |

## Decisions to make

- A hash chain over every entry, or signed batches — and what each costs a writer, a verifier and a redaction.
- One log for the product, or one per service federated for the auditor — and who then owns the ordering.
- Redaction by crypto-shredding the field's key, or by rewriting the entry with a tombstone — and which proof survives each.

## Constraints

- No entry may be deleted before its retention period ends, whatever a customer asks.
- The legal team, not engineering, approves a change to a retention class.
