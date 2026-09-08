# Prompt — Decide what to retrieve for a brief you cannot anticipate

**Archetype:** agentic-workflow · **Difficulty:** hard

## Scenario

A team keeps a store of lessons learned from past agent runs, each filed under the condition it applies to. When a new brief arrives they want the relevant lessons put in front of the agent that will answer it. The obvious approach failed: embedding the whole brief as one query and taking the nearest lessons put the least relevant ones first, because a brief is a problem statement and a lesson is an instruction, and averaging every demand a brief makes into one point loses the demands. What is needed is a planner that works out what the brief is actually asking of a design, searches for each of those things separately, combines the results honestly, and is willing to conclude that the store holds nothing worth offering. Design that planner.

## Capabilities

1. The planner takes an arbitrary input string as the brief and plans retrieval for it with no rule that splits it on formatting, keys off its headings, or assumes it follows a template.
2. The brief is decomposed into several short statements of what it demands, each searched independently, so that a demand mentioned once is not drowned by the rest of the document.
3. Stored items may be indexed in more than one form, and the planner chooses which form each query is compared against.
4. Results from separate queries are combined into one ranked list by a stated rule that does not assume the queries' scores are on a common scale.
5. The same item found by several queries appears once, and its provenance records every query that found it.
6. Retrieved candidates are judged for usefulness against the brief before any of them is used, and the judgement may conclude that none is useful.
7. What survives is handed on as clearly advisory, marked so that whatever consumes it cannot mistake it for part of the brief or derive a requirement from it.
8. When the decomposition step is unavailable, retrieval still happens using the brief alone, and the result is never worse than doing nothing.
9. For any request the planner can report what it searched for, what each query found, and why the final set was chosen.

## Interfaces that must hold

1. Whatever decomposes the brief hands the searcher short, self-contained statements, and the searcher may assume each stands alone without the brief around it.
2. Each search returns items carrying the query that found them, so whatever fuses the results can combine rankings without assuming two queries' scores share a scale.
3. What survives crosses to the consuming agent explicitly marked advisory, in a shape that cannot be read as part of the brief or turned into a requirement downstream.
4. When decomposition is unavailable it hands on the brief itself as a single statement, leaving the searcher's contract unchanged — the degraded path differs in quality, never in shape.

## Properties

| Property     | What it must mean here                                                                        |
| ------------ | --------------------------------------------------------------------------------------------- |
| honesty      | An empty or irrelevant store yields nothing rather than filler                                |
| degradation  | A failure in planning falls back to the simplest search and is never worse than doing nothing |
| auditability | Every offered item traces to the query that found it                                          |
| isolation    | Advisory material can never become a requirement, however it is worded                        |

## Constraints

- The brief is opaque and may be about anything; the decomposition cannot come from parsing its typography, because a rule over blank lines and headings produces mostly headings.
- The store is small at first and large later, and the design must behave sensibly at both ends, including when everything in it is returned for every query.
- Nothing retrieved is trusted on arrival — retrieval decides only what gets considered, never what gets used.
