# Say where every claim in the answer came from

**Archetype:** agentic-workflow · **Difficulty:** hard

## Scenario

A team's workflows produce deliverables assembled from many sources: several agents contributed sections, some pulled from a retrieval store, some called tools that queried real systems, and a final agent wrote it all into one document. When somebody disputes a line in that document — this number is wrong, this recommendation contradicts our policy — nobody can say where the line came from. The agent that wrote it is gone, its context with it. The team has been bitten twice by confident sentences nobody could source, and now wants every claim in a deliverable traceable to the agent, tool call or retrieved item that produced it, with claims that cannot be sourced marked rather than quietly kept. The hard part is that the final agent rewrites and merges as it assembles, so provenance cannot simply be a copied label. Design the ledger.

## Capabilities

1. The ledger records provenance for deliverables over arbitrary input strings, with no rule that understands the subject and no per-domain notion of what a claim is.
2. Every contribution entering the assembly — an agent's output, a tool's result, a retrieved item — is recorded with enough identity to be fetched again later.
3. Claims in the finished deliverable are attributed to the contributions that support them, including when the assembling agent rewrote or merged the wording.
4. A claim that no contribution supports is marked as unsourced rather than dropped or silently kept, and appears in the deliverable's own report.
5. Attribution is checked rather than trusted: the assembler's account of where something came from is verified against the recorded contributions.
6. A contribution that was retrieved carries the query that retrieved it, so a claim can be traced past the agent to the store entry behind it.
7. The ledger answers, for any claim, the chain that produced it; and inversely, for any contribution, every claim that rests on it.
8. Removing or correcting a contribution reports which claims depended on it, rather than leaving them standing unchanged.
9. The record survives the run: a deliverable read a month later can still be traced without any agent's context.

## Interfaces that must hold

1. Every contributor hands its output across with an identity the ledger can record, and no path into the assembly bypasses that boundary — an unrecorded contribution must be impossible, not merely discouraged.
2. The assembler hands the ledger its account of what supports what, and the ledger treats that account as a claim to be verified against recorded contributions, never as fact.
3. A claim crosses into the deliverable carrying either its supporting chain or an explicit unsourced marker; there is no third state in which the question was not asked.
4. A retrieved contribution crosses in carrying the query that found it, so tracing continues past the agent boundary into the store without a second lookup path.

## Properties

| Property     | What it must mean here                                                                       |
| ------------ | -------------------------------------------------------------------------------------------- |
| traceability | Every claim resolves to the contributions behind it, or is visibly marked as resting on none |
| durability   | The record outlives the run and remains readable when no agent context survives              |
| honesty      | An unsourced claim is reported as unsourced rather than dropped to keep the report clean     |
| determinism  | The same contributions and the same deliverable produce the same attribution                 |

## Constraints

- The deliverable is about anything; nothing may attribute by parsing the subject or by a catalogue of expected claim kinds.
- The assembling agent rewrites as it works, so attribution cannot rely on the final wording matching a contribution's wording.
- An agent may assert a source that does not exist, so the assembler's own account of provenance is evidence and never authority.
