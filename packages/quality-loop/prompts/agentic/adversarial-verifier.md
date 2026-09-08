# Prompt — Decide which claims survive being attacked

**Archetype:** agentic-verification · **Difficulty:** standard

## Scenario

A fleet of finder agents produces claims about a body of work: this line has a race condition, this requirement is unmet, this number contradicts that one. Finders are productive and unreliable in a specific way — the claims read well, cite real locations, and are wrong perhaps a third of the time. Acting on a wrong claim is expensive, and reporting one destroys trust in the rest. The team's answer is to attack every claim before believing it: independent agents, each given a different angle and each instructed to refute rather than confirm, with a rule deciding what survives. Nobody wants the refuters to vote on the final answer themselves, because a majority of confident agents can be confidently wrong in the same direction. Design the service that takes claims and returns the ones worth acting on.

## Functional requirements

1. The service accepts claims about an arbitrary subject supplied as an opaque string, and verifies them with no rule that understands the subject, no per-domain checks, and no registry of claim kinds.
2. Each claim is challenged by several independent agents that do not see each other's verdicts.
3. Challengers are given distinct angles rather than repeating one instruction, and the set of angles is declared as data.
4. A challenger returns a structured verdict with its reasoning and a confidence, never a free-form opinion that the system must interpret.
5. Survival is decided by stated rules over the verdicts — how many challenged it, how they split, how confident they were — and no single verdict decides on its own.
6. A claim that can be checked without a model is checked that way first, and a deterministic result overrides every opinion about it.
7. Claims that are the same claim in different words are recognised as one and challenged once.
8. The output distinguishes claims that survived, claims that were refuted, and claims the process could not settle, and the third category is never silently merged into either of the others.
9. For any claim, the record shows every challenge it received and the rule that decided its fate.

## Non-functional requirements

| Kind         | Requirement                                               | Target                     |
| ------------ | --------------------------------------------------------- | -------------------------- |
| independence | No challenger is influenced by another's verdict          | zero shared context        |
| determinism  | The same verdicts always yield the same survival decision | identical outcomes         |
| auditability | Every surviving claim can be traced to what upheld it     | zero unexplained survivals |

## Scale targets

| Metric                | Target |
| --------------------- | ------ |
| Claims per batch      | 60     |
| Challengers per claim | 3      |
| Distinct angles       | 6      |

## Constraints

- The subject under scrutiny is an opaque string. No component may parse it or hold knowledge of what kind of thing it is.
- Challengers are told to default to refuting when uncertain, so the process is deliberately biased toward discarding claims, and the design must account for losing true ones.
- A challenger may fail, time out, or return an unusable answer, and a claim must still reach a decision or be honestly reported as unsettled.
