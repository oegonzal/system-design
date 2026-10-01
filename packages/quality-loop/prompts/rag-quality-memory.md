# Retrieve past design evidence: a RAG pipeline over quality-loop outputs

**Archetype:** rag-design-memory · **Difficulty:** hard

## Scenario

An automated design-review service (a quality loop) grades system-design answers. Every completed run leaves a set of strings behind: a rendered design of 5,000–20,000 characters whose sections are addressed by engine-assigned ids such as `[summary]`, `[component.3]` or `[flow.2]`; ten to thirty confirmed findings, each with a type, a severity, the ids it points at and a one-to-three-sentence rationale; a checklist of success criteria with a pass, partial or fail result each; a handful of lessons; and the controller's decision with its reason. Today these strings sit in Postgres rows and dump folders and are only ever read one run at a time. Three consumers want them back by meaning rather than by id: the producer, which should see the strongest findings from similar past prompts before it drafts; the review UI, where an engineer types "designs that claimed the read path never touches a vendor" and expects matching findings across runs with the exact section each one cited; and a regression-set builder that turns recurring findings into test fixtures. Design the retrieval service that ingests these strings into a vector database and answers those consumers with grounded, cited results.

## Functional requirements

1. Within a minute of a run completing, its strings are ingested as chunks: one per rendered section (keeping the section's id verbatim), one per finding (with its ids, type and severity), one per criterion with its result, one per lesson; every chunk carries run id, pipeline, iteration, decision and timestamp as filterable metadata.
2. Ingestion is idempotent and versioned: re-ingesting a run replaces its chunks, deleting a run removes them, and chunks embedded under different embedding-model versions never mix in one query.
3. A search endpoint takes a query string plus optional filters (pipeline, decision, severity, finding type, criterion kind, date range, run ids) and returns the top-k chunks with scores and citations; exact tokens such as `component.2` or `p99` must still match, so search combines lexical and vector retrieval.
4. A context endpoint takes a new prompt's markdown and returns, within a stated token budget, the most similar past prompts with their strongest findings and lessons, ranked and cited, for the producer to read before drafting.
5. A question endpoint answers a natural-language question over past runs with an answer in which every claim cites chunk ids (run id plus section or finding id), and refuses when retrieval returns nothing above a relevance floor instead of guessing.
6. Retrieval used by a run is recorded in that run's trace (which chunks were shown, with scores), so retrieval quality can itself be reviewed later.

## Non-functional requirements

| Kind         | Requirement                                                             | Target                                   |
| ------------ | ----------------------------------------------------------------------- | ---------------------------------------- |
| latency      | Filtered top-20 search answers fast enough for an interactive UI        | p95 ≤ 300 ms                             |
| consistency  | A completed run is searchable soon after, and never half-ingested       | freshness ≤ 60 s; all-or-nothing per run |
| availability | Search stays up while ingestion or the embedding provider is degraded   | 99.9% for reads                          |
| durability   | The vector index is derived and can be rebuilt from the source rows     | full rebuild ≤ 4 h                       |
| security     | Runs belong to projects; retrieval never crosses a project boundary     | zero cross-project reads                 |
| correctness  | Answers are grounded: no claim without a stored chunk behind it         | zero uncited claims                      |
| cost         | Each chunk is embedded once per model version; identical text is shared | ≤ 1 embedding call per chunk per version |

## Scale targets

| Metric              | Target                                     |
| ------------------- | ------------------------------------------ |
| Completed runs      | 5,000/month now, 50,000/month in 18 months |
| Chunks per run      | ~60                                        |
| Vectors stored      | 5M after year one, 50M by year two         |
| Embedding dimension | 1,024–1,536                                |
| Search queries/sec  | 50 peak                                    |
| Ingest peak         | 100 runs/min during a backfill             |
| Read:write          | 80:20                                      |
| p95 latency         | 300 ms                                     |
| Availability        | 99.9                                       |
| Data retention      | source rows forever; vectors rebuildable   |

## Constraints

- The source of truth is the loop's existing Postgres tables (run, iteration, finding, criterion result); the vector store is a derived index and must be treated as disposable.
- Embeddings come from a hosted, versioned API that is rate-limited (about 1,000 requests per minute, at most 100 inputs per request) and will be replaced by a new model version at least once a year; re-indexing must happen online without a retrieval gap.
- Chunks must keep the engine's section and finding ids verbatim, so any retrieved evidence points back to the exact part of a design it came from; a chunk may never split a rendered section mid-line.
- Compare keeping vectors inside the existing Postgres against a dedicated vector database, and choose one for the stated scale with the reasoning shown.
- Retrieval scores are evidence, not decisions: which chunks reach the producer, and whether a question is refused, is decided by explicit thresholds the service owns, not by the model.
