# memory-ingest

The user's documents — a PDF résumé, markdown notes, the studio's own record of their experience exported as documents — chunked deterministically and handed, one chunk at a time, to the quality loop's `document-memory` orchestrator, which digests each into facts about the subject and stores them. A Node command line over `@sysdesign/loop-client`: no framework, no database, no embeddings here — HTTP to the loop and the studio, and one JSON manifest on disk.

```bash
pnpm memory-ingest ingest notes.md --subject "Ada Lovelace" --dry-run   # print the chunks; post nothing
pnpm memory-ingest ingest notes.md --subject "Ada Lovelace"             # post each chunk, await it, record it; then retract what the document's other digests stored
pnpm memory-ingest ingest Resume.pdf --kind resume                      # subject from MEMORY_INGEST_SUBJECT
pnpm memory-ingest ingest notes.md --force                              # post again what the manifest holds as stored, then retract the earlier digests
pnpm memory-ingest retract Resume.pdf --dry-run                         # the digest runs the manifest names for a document; retract nothing
pnpm memory-ingest retract Resume.pdf                                   # retire a document: retract every digest run its entries name, and mark them
pnpm memory-ingest status                                               # the manifest, as a table
pnpm memory-ingest status --refresh                                     # re-read every recorded orchestration from the loop
pnpm memory-ingest export-studio --out docs/ingestion/studio            # the studio's experience profiles and STAR stories, as markdown to ingest
pnpm exec nx test memory-ingest                                         # one pure vitest project; the in-repo fakes, never a live loop
```

Exit codes: `0` ok — every chunk's facts are in the store or were already, and every digest run the command set out to retract is retracted, now or before; `1` a chunk failed, the loop refused one, or the loop settled one with nothing stored (`unstored`, below), or a retraction the loop did not carry out left a digest run standing; `2` a usage problem or an input the program cannot use (an extension no reader takes, a missing file, a part the budget cannot hold, a subject or file name past the contract's bound), a path `retract` finds no manifest entry for (the message names the manifest), or a manifest home another command is writing (the message names its lock file).

## Environment

| Variable                | Default                     | Meaning                                                                                     |
| ----------------------- | --------------------------- | ------------------------------------------------------------------------------------------- |
| `QUALITY_LOOP_URL`      | `http://localhost:3003`     | The loop's base URL; must be `http(s)`.                                                     |
| `STUDIO_API_URL`        | `http://localhost:3000/api` | The studio API's base URL, its prefix included, read by `export-studio`; must be `http(s)`. |
| `MEMORY_INGEST_HOME`    | `static/memory-ingest`      | Where `manifest.json` lives, relative to the working directory.                             |
| `MEMORY_INGEST_SUBJECT` | —                           | Whom the facts are about, when `--subject` is not given on the command.                     |

Both are declared once, as data, in `src/config.ts` (`INGEST_FLAGS`, `INGEST_ENV`); a value that cannot be used is refused by name.

## How a document becomes chunks

`src/core/chunk.ts`, pure. Readers (`src/adapters/readers/`, a declared table by extension: `.pdf` through the PDF engine's positioned text items, cut into blocks by the page's own geometry — a gap larger than 1.5× the page's median line pitch or a change of type size opens a block (`src/adapters/readers/pdf-blocks.ts`) — with the pages joined by form feeds; `.md`, `.markdown`, `.txt` verbatim) hand over text; the chunker reads its structure: a heading line, a list item with the lines that continue it, and a blank-line paragraph each become one **part**. A part past the contract's cap (`DOCUMENT_PART_MAX_LENGTH`) is split at the last whitespace before it. Parts are packed greedily into chunks whose rendered goal (`renderDocumentGoal`) stays under `--chunk-bytes` (default 6000) and whose part count stays under `PARTS_PER_CHUNK` (8: measured so the contract's 16 memories can hold two facts per part). **Nothing is repeated between chunks** — the store cannot dedupe a near-duplicate fact — so continuity comes from `context`, the headings enclosing the chunk's first part. `maxMemories` is always the contract's `DOCUMENT_MAX_MEMORIES`: a dense part states several facts. The same text yields the same chunks and the same `chunkHash` (sha256 of the rendered goal).

## The manifest and what idempotency means

`static/memory-ingest/manifest.json` (gitignored) is written atomically — a temp name, then a rename — after every posting and after every retraction, so a process killed mid-run leaves the previous manifest whole, and no retraction goes unmarked behind a posting's minutes. It is a ledger: every outcome in order, one entry per posting, under `"version": 2`. A version-1 manifest, written before retractions were marked, is read with every posting standing and saved as 2; a build that reads only 1 refuses a 2 by its version rather than drop the marks.

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
  "retractedAt": null, // when what the digest run stored was retracted — replaced, or the document retired; null while it stands
  "retractedPoints": null, // how many points that retraction removed — 0 when the store held none of them by then
}
```

A chunk is identified by its hash, and its **status is earned by the store step**, never read off the orchestration's own: the loop's runner marks an orchestration `complete` whenever no step failed, so a digest skipped because embeddings were disabled, judged and `not-accepted`, or finding `no-memories`, and a store that was `store-unavailable`, all settle `complete` with nothing stored. The manifest records each of those as `unstored`, with the step's `reason` and `note` saying which; `complete` means the facts are in the store.

A posting is **stored** when it is `complete` and carries no retraction mark. A re-run **skips** a chunk whose latest entry is stored and posts everything else — an `unstored` one, a `failed` one (the loop was unreachable, the orchestration failed or was lost mid-wait) and a retracted one are tried again, since none of them is in the store; `--force` posts even the stored ones. Within one run, the same chunk met twice (the same path given twice, the same text in two files) is posted once. A refusal (`400` for a goal the loop would not take, `404` for an orchestrator it lacks) **stops the run**, since the next chunk would be refused the same way, and so does a start the loop is still unreachable for once the client's recovery window has passed (below); the chunks after it are reported `pending`.

A document's digests follow its current text, **make before break**: once every chunk of the document's current plan is stored — posted complete in this run, or skipped for a posting that stands — every other digest the manifest holds as stored for that document is retracted by its digest run id (`DELETE /memory/:id`) and its entries marked, each mark saved before the next retraction is asked. So editing a document posts only the chunks the edit touched and then retracts the digests they replaced; `--force` posts the whole document again and only then retracts every earlier digest of it; and a document the run did not store whole — halted by `--limit` or an interrupt, a chunk refused, failed or unstored — retracts nothing, so the store is never left without the document. Replacement goes by the document and not by the chunk hash, because a change to the goal's rules renames every chunk at once. A forced run that halts says to re-run **without** `--force`: the plain run skips what the forced one posted and replaces the rest, where the same forced command would post its first chunks again. A retraction the loop does not carry out ends that document's replacement, the runs after it left standing and said why (exit 1); the next run that stores the document whole retracts them. A document that read as no text replaces nothing — retiring one is `retract`'s. `status --refresh` re-reads every recorded orchestration and rewrites the settled ones by the same rule, keeping each entry's retraction mark: the loop still reports an orchestration whose points were retracted as having stored them.

`retract <path…>` **retires** documents: every digest run any of a document's entries names, whatever its status — retracting a run that stored nothing removes nothing — is retracted and marked; a run whose every entry already carries a mark is not asked again. A document is found by the key `ingest` records it under — its path relative to the working directory — and is never read, so one since deleted retires the same; a path the manifest holds no entry for refuses the command, naming the manifest, before anything is retracted: run it from the directory, and under the `MEMORY_INGEST_HOME`, the document was ingested with. The report gives the points each run removed, lists the runs that removed none apart, and counts the entries naming an orchestration whose report was never read (a wait lost after the start), whose digest run `status --refresh` reads back before a second `retract`.

One command writes a manifest home at a time: `ingest`, `retract` (neither under `--dry-run`, which saves nothing) and `status --refresh` create `manifest.lock` beside the manifest, exclusively, and remove it when they end — on an interrupt or an uncaught fault too. A home whose lock exists is refused, exit 2, naming the file; only a process killed outright leaves one behind, to be deleted by hand once nothing runs.

Posting is sequential on purpose: one orchestration at a time, awaited to settle (by heartbeat, through `awaitOrchestration`) before the next starts, so the loop is never asked to digest two chunks of one document at once. Every call rides out a restarting loop within `INGEST_LOOP_RECOVERY` (`src/config.ts`: 60 s at a 2 s pause, the browser session's `loopRecovery`, sized from the loop's measured restarts) — a call that never reached the loop, or a read or a retraction it answered with a server error, is asked again — and a start still unreachable past the window stops the run, since every chunk after it would wait the window out too.

## The studio's record, as documents

The studio keeps the subject's experience profiles (the prompts are drawn from them) and STAR stories in its own tables, which this package may not read: the boundaries forbid `memory-ingest → db`, and the one program that posts documents is this one. So the record crosses as documents. `export-studio --out <dir>` reads `GET /experiences` and `GET /star-stories` whole — page by page at the API's largest page — and writes one markdown file per source through a declared field map (`STUDIO_SOURCES` in `src/core/export-studio.ts`): an experience is `# <title> — <company>`, its summary, `Stack: …` and its highlights as bullets; a story is `# <title>` with `## Situation`, `## Task`, `## Action` and `## Result` as its own sections and `Tags: …`, so a chunk's context names which part a fact came from and a `profile_story` can cite the part whole. A source with no records writes nothing — an empty document is nothing to ingest. Then `ingest <dir>/*.md --kind notes --date <the day you exported>`; the manifest skips what was ingested before, and after a change to the record the same command posts the sections that changed and then retracts the digests they replaced. Another source is another entry in the map, never different code.

## Layout

`src/core` (pure — ports, the chunker, the ingest and its report, the record of a posting and its retraction mark, the retraction both paths share and the retirement of a document, the status refresh, the studio export and its field map) · `src/adapters/readers` (the table, PDF, markdown, JSON Lines) · `src/adapters/loop-http` (the sink over `LoopClient`) · `src/adapters/studio-http` (the studio's lists, paged) · `src/adapters/fs-ledger` (the manifest, by version, and its lock) · `src/adapters/fs-writer` (the exported documents) · `src/config.ts`, `src/cli.ts`, `src/render.ts`, `src/main.ts` · `src/test` (the port fakes and the shared fake loop behind the shipping sink — spec code only, outside the app build). The goal codec and the chunk schema are `@sysdesign/contracts` (`lib/quality-loop/document-digest.ts`); the orchestrator is `packages/quality-loop/src/orchestrators/document-memory`.
