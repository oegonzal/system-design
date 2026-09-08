# Prompt — Build workflows out of other workflows

**Archetype:** agentic-workflow · **Difficulty:** hard

## Scenario

A team has accumulated a dozen workflows that each do one thing well: verify a set of claims, plan retrieval for a brief, digest a finished run into lessons, decide what a person must see. Larger pieces of work want several of them in sequence — retrieve, then produce, then verify, then digest — and today that is done by copying the inner workflows' declarations into one large flat declaration. The copies drift from the originals immediately, an improvement to the verifier reaches only whichever copies someone remembers, and a large declaration that fails halfway gives no clue which of its embedded pieces was at fault. The team wants workflows to be composable: a step in one workflow may be another whole workflow, referenced rather than copied. The hard requirement is that a composition whose pieces do not fit must be refused before anything runs, not discovered when an inner workflow receives something it cannot use. Design the composer.

## Capabilities

1. The composer runs compositions over arbitrary input strings, with no rule that reads the brief and no assumption about what the composed workflows are for.
2. A step in a workflow may be a reference to another workflow, and referencing one requires no change to either it or the composer.
3. A composition declares how the outer brief and each step's results reach an inner workflow, and that mapping is data rather than code.
4. A composition whose pieces do not fit — an inner workflow needing something no earlier step produces — is refused before execution with a stated reason naming the gap.
5. An inner workflow improved in place is used in its improved form by every composition that references it, without those compositions being edited.
6. A composition may pin a specific version of an inner workflow where its behaviour must not move, and pinning is explicit rather than the default.
7. Failure inside an inner workflow is reported as a failure of that named step, and the outer composition decides what to do from stated rules rather than aborting by default.
8. Composition may nest, and the depth at which nesting stops is declared and enforced rather than discovered by exhausting something.
9. A finished composition produces one record from which the whole execution, inner workflows included, can be reconstructed.

## Interfaces that must hold

1. An inner workflow declares what it requires and what it produces, and the composer checks a composition against those declarations before execution, so an inner workflow may assume its inputs are present when it starts.
2. The mapping from the outer brief and earlier results into an inner workflow's input crosses as a declared translation; an inner workflow never reaches outside itself for context it was not given.
3. A failure inside an inner workflow crosses outward named as that step's failure with the inner reason preserved, so the outer rules branch on which piece failed rather than on that something did.
4. The record an inner workflow produces nests inside the outer record in the same shape it would have standing alone, so one reader serves both.

## Properties

| Property      | What it must mean here                                                                                    |
| ------------- | --------------------------------------------------------------------------------------------------------- |
| extensibility | A new composition is a declaration; composing two existing workflows costs no change to either            |
| determinism   | The same composition and inputs produce the same execution, including the order steps are considered      |
| auditability  | An outer record explains the whole execution, inner workflows included, with nothing opaque               |
| degradation   | A failing inner workflow is a named step's failure the outer rules can act on, never an unexplained abort |

## Constraints

- The brief is an opaque string; neither the composer nor any inner workflow may branch on what it is about.
- Inner workflows are improved independently and constantly, so a composition must not freeze them by default, and must be able to freeze one deliberately.
- A composition that cannot work must be refused before it spends anything, because the cost of discovering the mismatch at the third step is everything paid for the first two.
