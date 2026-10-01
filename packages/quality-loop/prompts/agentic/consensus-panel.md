# Get one answer out of several that disagree

**Archetype:** agentic-workflow · **Difficulty:** standard

## Scenario

For questions where being wrong is expensive, a team stopped asking one agent and started asking several independently, then taking whatever most of them said. It went badly in a way that took months to see. On the questions where the agents agreed, one agent would have done. On the questions where they disagreed — exactly the hard ones — the majority was frequently the confident wrong answer, and the dissenting agent that had actually reasoned it through was outvoted and discarded. The team now wants disagreement treated as information rather than noise: a panel of independent answers, a deterministic aggregation that weighs how the panel split and how each member reasoned, and an honest "unsettled" when the panel genuinely does not converge. Design the panel.

## Capabilities

1. The panel answers questions posed as arbitrary input strings, with no rule that understands the subject and no per-domain aggregation.
2. Several members answer independently, without seeing each other's answers, and the number and composition of the panel are declared as data.
3. Members may be given different approaches to the same question rather than identical instructions, and that set of approaches is declared rather than coded.
4. Each member returns a structured answer with its reasoning and a confidence, so the aggregator never has to interpret prose to combine.
5. Answers that are the same answer in different words are recognised as agreeing, and answers that differ only in detail are distinguished from those that conflict.
6. Aggregation is a stated rule over the structured answers — how they split, how confident each was, how well each is supported — and no member's answer wins by being the majority alone.
7. A lone answer that is better supported than the majority can win, and when it does the record says why.
8. A panel that does not converge returns unsettled with the positions preserved, rather than a majority presented as agreement.
9. The record shows every member's answer, how they were grouped, and the rule that produced the result.

## Interfaces that must hold

1. Each member receives the question and its own approach and nothing about the other members, so independence is a property of the boundary rather than of the members' good behaviour.
2. A member hands back a structured answer with reasoning and confidence; a member that fails hands back a stated reason in the same envelope, so an absent answer is never counted as an abstention by accident.
3. Whatever groups answers hands the aggregator equivalence classes rather than raw text, so the aggregation rule never performs its own comparison of wording.
4. An unsettled outcome crosses to the caller with the competing positions intact, in the same shape a settled one uses, so a caller cannot mistake it for a decision.

## Properties

| Property     | What it must mean here                                                                  |
| ------------ | --------------------------------------------------------------------------------------- |
| independence | No member is influenced by another's answer, by construction rather than by instruction |
| determinism  | The same answers always aggregate to the same result                                    |
| honesty      | A panel that does not converge says so rather than presenting a majority as agreement   |
| auditability | Every result explains which answers it rested on and which rule produced it             |

## Constraints

- The question is an opaque string and may be about anything; nothing may aggregate by reference to what it is about.
- A majority of agents can be confidently wrong in the same direction, so a rule that counts votes alone is unacceptable however well it performs on easy questions.
- Members are expensive, so the panel must be able to stop early when a stated rule says more answers cannot change the outcome.
