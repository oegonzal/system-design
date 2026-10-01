# Improve an artifact until the checks pass or the budget ends

**Archetype:** agentic-workflow · **Difficulty:** hard

## Scenario

A team asks agents to produce artifacts — a design, a patch, a migration plan, a summary — and the first attempt is rarely good enough. What they have today is a loop that asks the model whether it is happy and stops when it says yes, which produces confident bad output and no record of why anything was accepted. They want the judgement taken away from the producer entirely: cheap deterministic checks first, then several critics looking for different classes of defect, then evaluators scoring against criteria derived from the brief itself, and finally a controller that applies stated thresholds and decides whether to revise, start over, hand to a person, or stop. The producer should be told what to fix in words, but nothing it says may move the decision. Design the loop.

## Capabilities

1. The loop accepts an arbitrary input string as the brief, derives its own success criteria from that brief, and runs with no rule that parses the brief's prose or presumes a domain.
2. Deterministic checks run before any judging agent, and a check that fails hard stops the iteration before a single judging call is paid for.
3. Several critics look for defects, each with a declared area of expertise, and each reports structured findings that cite where in the artifact they apply.
4. Evaluators score the artifact against the derived criteria, and each criterion is judged by exactly one evaluator so that two opinions never contend for the same measurement.
5. Judging agents are sampled more than once, and a finding counts only if independent samples agree on it.
6. The controller decides from the structured evidence alone, using declared thresholds and rules; the prose the judges wrote reaches the producer as instructions but never reaches the decision.
7. When the loop revises, it revises against specific selected defects rather than against a score, and the same defect persisting across iterations is visible as such.
8. The loop stops on acceptance, on exhausting its iterations, on ceasing to improve, or on a defect that needs a person, and it says which of those happened.
9. Every iteration's evidence and decision are recorded so that the final outcome can be re-derived without rerunning anything.

## Interfaces that must hold

1. The deterministic checks hand the loop a verdict before any judging call is made, and a hard failure crosses straight to the controller without critics or evaluators running at all.
2. Critics return findings citing locations in the artifact, so the artifact must expose a naming scheme that both a critic and the producer can use to mean the same place.
3. Evaluators consume criteria and return exactly one result per criterion, so whatever normalises the evidence may assume no criterion arrives judged twice.
4. The controller consumes structured evidence only; the prose the judges wrote crosses to the producer as instructions on a separate path that never reaches the decision.

## Properties

| Property     | What it must mean here                                                            |
| ------------ | --------------------------------------------------------------------------------- |
| determinism  | The same evidence and the same policy always produce the same decision            |
| auditability | Every number in the outcome is reproducible from the record alone                 |
| honesty      | Without a working model the loop reports incapacity rather than inventing a score |
| degradation  | A failing judge reduces confidence rather than stopping the loop                  |

## Constraints

- The brief is an opaque string; the criteria must come from it rather than from a catalogue of known briefs.
- No output of any model may by itself accept, reject or route an artifact — the decision belongs to stated rules over structured evidence.
- Judges are expensive, so anything a deterministic check can settle must never be asked of a model.
