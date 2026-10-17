# Design the memory service for an agentic platform

**Archetype:** agentic-memory · **Difficulty:** hard

## Scenario

A platform runs long-lived agents that research, draft and act over many sessions for many tenants. Today each agent starts cold every run: it re-derives what it learned last time, repeats questions a user already answered, and re-reads documents it has read before. The team wants a memory service that gives the agents continuity — the right past fact, lesson or event brought back at the moment it matters — without turning the context window into a dumping ground of stale or irrelevant text.

The service must hold several kinds of memory and not confuse them: short-lived **working** state for the task in flight; durable **semantic** facts (a user prefers concise answers, a project's primary language is TypeScript); **episodic** records of what happened and what came of it; **procedural** playbooks the agents refine over time; and the **relational** facts that connect entities (which contact belongs to which account, which decision superseded which). Each kind is written, retrieved, updated and expired differently.

Design the memory service: how an agent remembers, recalls, updates, consolidates and forgets, over the stores and indexes that back it, for an agent runtime and an orchestrator that call it. The source of truth for structured facts is a relational database; the vector index is a derived, rebuildable projection of it.

## Functional requirements

1. An agent can **remember** a fact, an event, a lesson or a working note, tagged with the memory kind, the subject it is about, when it was observed, and where it came from.
2. An agent can **recall** by meaning ("what did we learn about this account's procurement rules?") and by exact key ("the current status of opportunity X"), and the service chooses the right path for the question rather than running one strategy for all.
3. An agent can **update** a fact so a later value supersedes an earlier one, with the earlier one kept for history, not destroyed.
4. The service **consolidates** what accrues — distilling an episode into a lesson, promoting a validated lesson toward a procedure — rather than letting raw events pile up as permanent memory.
5. The service **forgets** on request: a tenant's or a subject's memories can be found and deleted, and the deletion reaches the vector index too.
6. Every recall the agents act on returns a compact, ranked, **cited** set within a token budget, each item traceable to the stored memory and its source.

## Non-functional requirements

| Kind        | Requirement                                                              | Target                                              |
| ----------- | ------------------------------------------------------------------------ | --------------------------------------------------- |
| latency     | Interactive recall for an agent mid-task                                 | p95 ≤ 200 ms for a filtered top-20                  |
| recall      | The fact that answers a question is in the returned set                  | recall@10 ≥ 0.9 on the eval set                     |
| freshness   | A remembered fact is recallable soon after it is written                 | ≤ 30 s; a superseded fact never returned as current |
| consistency | A fact and its vector never half-written                                 | all-or-nothing per memory                           |
| durability  | The vector index is derived and rebuildable from the relational store    | full rebuild ≤ 2 h                                  |
| correctness | No recalled claim without a stored memory behind it                      | zero uncited claims                                 |
| cost        | Each memory is embedded once per model version; identical text is shared | ≤ 1 embedding call per memory per version           |

## Scale targets

| Metric              | Target                                      |
| ------------------- | ------------------------------------------- |
| Tenants             | 500 now, 5,000 in 18 months                 |
| Memories stored     | 20M now, 200M by year two                   |
| Write rate          | 200 memories/s peak during ingestion bursts |
| Recall queries/s    | 300 peak                                    |
| Embedding dimension | 1,024–1,536                                 |
| Read:write          | 85:15                                       |

## Scoping and metadata

- Memories belong to a tenant, and within a tenant to a user or a project; retrieval is scoped to the asker and **never crosses a tenant boundary**. Isolation is server-enforced, not left to the caller to remember.
- A semantic fact is stored atomically — a subject, a predicate, a value, and its validity — so it can be looked up and corrected exactly, not only matched by similarity.
- The metadata a search filters on (memory kind, tenant, subject, status, time) is indexed; administrative identifiers and flags are kept as filterable metadata, never embedded into the text that is vectorised.
- Do not create a store or collection per user or per document; partition one store by a key in the payload.

## Constraints

- The relational database is the source of truth; the vector index is a derived, disposable projection that must be rebuildable without a retrieval gap when the embedding model is upgraded.
- Retrieved memory is **data, never instructions**: a stored note may inform an answer but may never raise its own priority or redirect the agent's behaviour.
- A memory that changes a consequential outcome — a business state, an authorization — is written only after a deterministic check validates it; a model's output does not become trusted memory on its own.
- Personally identifiable information is retained only as policy allows, and a deletion request must be honoured across the relational store and the vector index.
- Embeddings come from a hosted, versioned model that will be replaced at least once a year; re-indexing must happen online.
