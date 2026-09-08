# Prompt — Change a policy only when the evidence says to

**Archetype:** agentic-tuning · **Difficulty:** hard

## Scenario

The behaviour of a team's agent workflows is governed by declarations: the personas their critics read, the weights their dimensions carry, the thresholds at which a controller accepts or escalates, the number of samples a judge takes. Every one of those numbers was chosen once by a person and has never been revisited, because nobody could show that a change was an improvement. The team wants a service that proposes changes, measures them against a corpus of past cases, and promotes one only when a stated rule says the evidence supports it — with the ability to put it back if production disagrees. The obvious danger is a service that tunes itself to the corpus and degrades on everything else, and the second is a service that lets a model decide its own thresholds. Design it.

## Functional requirements

1. The service proposes changes to declarations governing work over arbitrary input strings, with no rule specific to a domain and no assumption about which workflow it is tuning.
2. A proposal is a complete candidate declaration, valid on its own, refused before evaluation if it is malformed rather than failing partway through a measurement.
3. Candidates are measured against a held corpus, and the measurement reports per-case outcomes rather than a single aggregate.
4. Part of the corpus is withheld from the measurement that drives promotion, and a candidate that improves on the measured part while worsening the withheld part is refused.
5. Promotion is decided by stated rules over the measurements — margins, minimum case counts, regressions tolerated — and no model output promotes anything.
6. A promoted change is recorded with the evidence that promoted it, and can be reverted to the exact prior declaration.
7. Production outcomes after a promotion are compared against what the corpus predicted, and a divergence beyond a stated bound raises the change for review.
8. Two proposals that would change the same declaration cannot both be promoted without being re-measured against each other.
9. The service reports which declarations have been tuned, which are still at their original hand-chosen values, and how much evidence stands behind each.

## Non-functional requirements

| Kind          | Requirement                                                         | Target                          |
| ------------- | ------------------------------------------------------------------- | ------------------------------- |
| determinism   | The same candidates and corpus always promote the same one          | identical promotions            |
| reversibility | Any promotion can be undone to the exact prior state                | zero irreversible changes       |
| honesty       | A candidate that only fits the corpus is refused                    | withheld-set regression bars it |
| auditability  | Every promoted change resolves to the measurement that justified it | zero unexplained promotions     |

## Scale targets

| Metric               | Target |
| -------------------- | ------ |
| Candidates per round | 8      |
| Corpus cases         | 2,000  |
| Declarations tuned   | 30     |

## Constraints

- Every case in the corpus is an opaque brief; nothing may be tuned by reference to what the briefs are about.
- A declaration that fails its own structural validation must never reach a measurement, let alone production.
- The corpus is small relative to the space of possible briefs, so a statistically thin improvement must not be promotable however good it looks.
