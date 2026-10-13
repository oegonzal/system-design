# memory-ingest

The user's documents — a PDF résumé, markdown notes — chunked deterministically and handed, one chunk at a time, to the quality loop's `document-memory` orchestrator, which digests each into facts about the subject and stores them. A Node command line over `@sysdesign/loop-client`: no framework, no database, no embeddings here — HTTP to the loop and one JSON manifest on disk.

```bash
pnpm memory-ingest ingest notes.md --subject "Ada Lovelace" --dry-run   # print the chunks; post nothing
pnpm memory-ingest ingest notes.md --subject "Ada Lovelace"             # post each chunk, await it, record it
pnpm memory-ingest ingest Resume.pdf --kind resume                      # subject from MEMORY_INGEST_SUBJECT
pnpm memory-ingest ingest notes.md --force                              # post again what the manifest holds as complete, retracting its earlier digests
pnpm memory-ingest status                                               # the manifest, as a table
pnpm memory-ingest status --refresh                                     # re-read every recorded orchestration from the loop
pnpm exec nx test memory-ingest                                         # one pure vitest project; the in-repo fakes, never a live loop
```

Exit codes: `0` ok — every chunk's facts are in the store or were already; `1` a chunk failed, the loop refused one, or the loop settled one with nothing stored (`unstored`, below); `2` a usage problem or an input the program cannot use (an extension no reader takes, a missing file, a part the budget cannot hold, a subject or file name past the contract's bound).

## Environment

| Variable                | Default                 | Meaning                                                                 |
| ----------------------- | ----------------------- | ----------------------------------------------------------------------- |
| `QUALITY_LOOP_URL`      | `http://localhost:3003` | The loop's base URL; must be `http(s)`.                                 |
| `MEMORY_INGEST_HOME`    | `static/memory-ingest`  | Where `manifest.json` lives, relative to the working directory.         |
| `MEMORY_INGEST_SUBJECT` | —                       | Whom the facts are about, when `--subject` is not given on the command. |

Both are declared once, as data, in `src/config.ts` (`INGEST_FLAGS`, `INGEST_ENV`); a value that cannot be used is refused by name.

## How a document becomes chunks

`src/core/chunk.ts`, pure. Readers (`src/adapters/readers/`, a declared table by extension: `.pdf` through the PDF engine's positioned text items, cut into blocks by the page's own geometry — a gap larger than 1.5× the page's median line pitch or a change of type size opens a block (`src/adapters/readers/pdf-blocks.ts`) — with the pages joined by form feeds; `.md`, `.markdown`, `.txt` verbatim) hand over text; the chunker reads its structure: a heading line, a list item with the lines that continue it, and a blank-line paragraph each become one **part**. A part past the contract's cap (`DOCUMENT_PART_MAX_LENGTH`) is split at the last whitespace before it. Parts are packed greedily into chunks whose rendered goal (`renderDocumentGoal`) stays under `--chunk-bytes` (default 6000) and whose part count stays under `PARTS_PER_CHUNK` (8: measured so the contract's 16 memories can hold two facts per part). **Nothing is repeated between chunks** — the store cannot dedupe a near-duplicate fact — so continuity comes from `context`, the headings enclosing the chunk's first part. `maxMemories` is always the contract's `DOCUMENT_MAX_MEMORIES`: a dense part states several facts. The same text yields the same chunks and the same `chunkHash` (sha256 of the rendered goal).

## The manifest and what idempotency means

`static/memory-ingest/manifest.json` (gitignored) is written atomically — a temp name, then a rename — after every posting, so a process killed mid-run leaves the previous manifest whole. It is a ledger: every outcome in order, one entry per posting:

```jsonc
{
  "chunkHash": "…sha256 of the goal…",
  "document": "notes.md", // relative to the working directory
  "chunk": { "index": 2, "of": 5 },
  "kind": "notes",
  "orchestrationRunId": "…", // the document-memory run; null when the start was refused
  "digestRunId": "…", // the digest step's child run — the id the stored points carry
  "status": "complete", // complete | unstored | failed | refused — earned by the store step, below
  "steps": {
    "digest": {
      "status": "complete",
      "reason": null,
      "note": null,
      "counts": { "memories": 4, "kept": 4 },
    },
    "store": {
      "status": "complete",
      "reason": null,
      "note": null,
      "counts": { "chunks": 4, "embedded": 4 },
    },
  },
  "error": null, // why a failed or refused posting ended that way; an unstored one is explained by its steps
  "ingestedAt": "2026-10-02T12:00:00.000Z",
  "loopUrl": "http://localhost:3003",
}
```

A chunk is identified by its hash, and its **status is earned by the store step**, never read off the orchestration's own: the loop's runner marks an orchestration `complete` whenever no step failed, so a digest skipped because embeddings were disabled, judged and `not-accepted`, or finding `no-memories`, and a store that was `store-unavailable`, all settle `complete` with nothing stored. The manifest records each of those as `unstored`, with the step's `reason` and `note` saying which; `complete` means the facts are in the store.

A re-run **skips** a chunk whose latest entry is `complete` and posts everything else — an `unstored` one and a `failed` one (the loop was unreachable, the orchestration failed or was lost mid-wait) are tried again, since neither was ingested; `--force` posts even the complete ones. Within one run, the same chunk met twice (the same path given twice, the same text in two files) is posted once. A refusal (`400` for a goal the loop would not take, `404` for an orchestrator it lacks) **stops the run**, since the next chunk would be refused the same way; the chunks after it are reported `pending`. Editing a document changes the hashes of the chunks it touches, so only those are posted again; the points an earlier digest of an unchanged chunk stored remain until `--force` posts it again, which first retracts them by the digest run id the manifest keeps (`DELETE /memory/:id`), so the store never holds two digests of one chunk. `status --refresh` re-reads every recorded orchestration and rewrites the settled ones by the same rule.

Posting is sequential on purpose: one orchestration at a time, awaited to settle (by heartbeat, through `awaitOrchestration`) before the next starts, so the loop is never asked to digest two chunks of one document at once.

## Layout

`src/core` (pure — ports, the chunker, the ingest and its report, the record of a posting, the status refresh) · `src/adapters/readers` (the table, PDF, markdown) · `src/adapters/loop-http` (the sink over `LoopClient`) · `src/adapters/fs-ledger` (the manifest) · `src/config.ts`, `src/cli.ts`, `src/render.ts`, `src/main.ts` · `src/test` (the port fakes and the shared fake loop behind the shipping sink — spec code only, outside the app build). The goal codec and the chunk schema are `@sysdesign/contracts` (`lib/quality-loop/document-digest.ts`); the orchestrator is `packages/quality-loop/src/orchestrators/document-memory`.
