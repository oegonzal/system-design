# Decide what a finished run is allowed to remember

**Archetype:** agentic-workflow · **Difficulty:** hard

## Scenario

Every run a team's agents complete leaves a record: what was produced, what the critics found, what the evaluators measured, what the controller decided and why. Buried in those records are lessons worth carrying forward — that a particular kind of claim is usually unsupported, that a particular arrangement of components fails a particular way. The team wants those lessons extracted and stored so future runs on entirely different briefs can draw on them. The trap is obvious once seen: it is easy to store a note that only makes sense for the run that produced it, full of that run's names and numbers, which then surfaces for an unrelated brief and misleads. It is equally easy to store a note so general it changes nobody's behaviour. What is stored must be specific enough to act on and portable enough to travel. Design the service that turns a finished run into memory.

## Capabilities

1. The service reads a finished run of any kind, for a brief that is an arbitrary input string, and extracts lessons with no rule that understands the brief's domain and no per-kind extraction logic.
2. A lesson is stored as a separable instruction and the condition under which it applies, so that the condition can be matched against a future brief independently of the instruction.
3. Every lesson names the specific evidence in the run it rests on, and a lesson that cannot point to evidence is not stored.
4. A lesson that holds only for the run that produced it — its identifiers, its numbers, its particular arrangement — is identified and refused, and refusal here is absolute rather than a deduction from a score.
5. A lesson that duplicates one already stored is recognised as such even when worded differently, and does not become a second entry.
6. Lessons are judged before they are stored, by the same arrangement of critics, evaluators and a deterministic controller that the team uses elsewhere; a run whose judgement did not clear the bar contributes nothing.
7. An individual lesson that a confirmed defect names is excluded on its own, without discarding the others from the same run.
8. Re-processing a run replaces what that run contributed rather than adding a second copy of it.
9. The store can report, for any lesson, where it came from and how often it has since proved useful.

## Interfaces that must hold

1. A finished run crosses to whatever extracts lessons as a generic record; the extractor may rely only on facts every workflow produces, never on a particular artifact shape or producer.
2. A lesson crosses to the store as a separable instruction and condition, so that whatever searches later can match the condition without ever reading the instruction.
3. Whatever judges candidate lessons returns a verdict per lesson rather than per run, so one refused lesson does not discard its siblings.
4. Re-processing a run replaces that run's contribution, so whatever writes to the store must be able to identify everything a given run previously contributed from the run alone.

## Properties

| Property     | What it must mean here                                                                              |
| ------------ | --------------------------------------------------------------------------------------------------- |
| portability  | A stored lesson is usable by a brief in an unrelated domain; nothing run-specific survives the gate |
| traceability | Every lesson resolves to the evidence that justified it                                             |
| idempotence  | Re-processing a run leaves the store in the same state as processing it once                        |
| degradation  | An unavailable store never fails the run that was being digested                                    |

## Constraints

- The brief is an opaque string and the run record is generic; nothing may assume a particular producer, artifact shape or subject.
- Storing is optional and must never be on the critical path of the work that produced the record.
- A lesson's worth cannot be known when it is written, so the design must allow its usefulness to be measured later and acted on.
