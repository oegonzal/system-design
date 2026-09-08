# Prompt — Decide what a finished run is allowed to remember

**Archetype:** agentic-memory-write · **Difficulty:** hard

## Scenario

Every run a team's agents complete leaves a record: what was produced, what the critics found, what the evaluators measured, what the controller decided and why. Buried in those records are lessons worth carrying forward — that a particular kind of claim is usually unsupported, that a particular arrangement of components fails a particular way. The team wants those lessons extracted and stored so future runs on entirely different briefs can draw on them. The trap is obvious once seen: it is easy to store a note that only makes sense for the run that produced it, full of that run's names and numbers, which then surfaces for an unrelated brief and misleads. It is equally easy to store a note so general it changes nobody's behaviour. What is stored must be specific enough to act on and portable enough to travel. Design the service that turns a finished run into memory.

## Functional requirements

1. The service reads a finished run of any kind, for a brief that is an arbitrary input string, and extracts lessons with no rule that understands the brief's domain and no per-kind extraction logic.
2. A lesson is stored as a separable instruction and the condition under which it applies, so that the condition can be matched against a future brief independently of the instruction.
3. Every lesson names the specific evidence in the run it rests on, and a lesson that cannot point to evidence is not stored.
4. A lesson that holds only for the run that produced it — its identifiers, its numbers, its particular arrangement — is identified and refused, and refusal here is absolute rather than a deduction from a score.
5. A lesson that duplicates one already stored is recognised as such even when worded differently, and does not become a second entry.
6. Lessons are judged before they are stored, by the same arrangement of critics, evaluators and a deterministic controller that the team uses elsewhere; a run whose judgement did not clear the bar contributes nothing.
7. An individual lesson that a confirmed defect names is excluded on its own, without discarding the others from the same run.
8. Re-processing a run replaces what that run contributed rather than adding a second copy of it.
9. The store can report, for any lesson, where it came from and how often it has since proved useful.

## Non-functional requirements

| Kind         | Requirement                                                      | Target                    |
| ------------ | ---------------------------------------------------------------- | ------------------------- |
| portability  | A stored lesson is usable by a brief in an unrelated domain      | zero run-specific entries |
| traceability | Every lesson resolves to the evidence that justified it          | zero unsourced lessons    |
| idempotence  | Re-processing a run leaves the store in the same state           | zero duplicated runs      |
| degradation  | An unavailable store never fails the run that was being digested | zero cascading failures   |

## Scale targets

| Metric              | Target |
| ------------------- | ------ |
| Lessons per run     | 8      |
| Stored lessons      | 5,000  |
| Runs digested daily | 60     |

## Constraints

- The brief is an opaque string and the run record is generic; nothing may assume a particular producer, artifact shape or subject.
- Storing is optional and must never be on the critical path of the work that produced the record.
- A lesson's worth cannot be known when it is written, so the design must allow its usefulness to be measured later and acted on.
