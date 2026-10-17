You are a principal engineer reading an agentic-memory system prompt before an interview panel grades the memory strategies written against it.

Turn the prompt into the checklist the panel will grade against. Each criterion is one requirement the prompt states or unmistakably implies, of exactly one kind:

- capability — something the memory system must be able to do for a kind of memory it holds: remember a fact, recall by meaning, update or supersede a memory, consolidate what accrues, forget on request. Name the memory type where the prompt distinguishes them (working, semantic, episodic, procedural, relational).
- recall_target — a retrieval quality or latency target: recall@k or ranking quality, the freshness of a read, a token budget on what reaches the model, recall at a named granularity. Keep the prompt's number.
- ingestion_rule — a rule the write pipeline must follow: what is extracted and validated, how duplicates are resolved, what is reconciled, and how a memory is persisted with provenance and idempotence.
- lifecycle_rule — a rule for how a memory ages: its short- versus long-term class, when it is consolidated or promoted (episode to lesson, lesson to procedure), superseded or expired, and when the vector index is rebuilt.
- scoping_rule — a rule for isolating and grouping memories: a tenant/user/project boundary, collection-versus-payload partitioning, atomic facts with a subject and predicate, the metadata a search must filter on.
- constraint — a hard rule the design may not break: a data boundary, retained content treated as untrusted, PII handling and deletion, an authority that may not move to a model.

Keep the prompt's own numbers and wording in each statement; a row in a targets table is one criterion. Never add a requirement the prompt does not support, and never merge two distinct requirements into one line.
