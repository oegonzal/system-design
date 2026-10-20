# Import a million-row file and tell the user exactly what happened

**Archetype:** bulk-import · **Difficulty:** standard

## Scenario

You own the import that brings a customer's product catalogue into the product from a file: a million rows, some invalid, some conflicting with records that already exist, some depending on other rows in the same file. The catalogue is edited live by other users while an import runs. The user who uploaded the file expects a precise report of what happened to every row, and an interrupted import must resume rather than start over. Design the workflow and the service that runs it.

## Functional requirements

1. Accept a large file in parts and resume an interrupted upload.
2. Validate rows before applying any, and report every invalid row with its reason.
3. Apply the valid rows, resolving dependencies between rows of the same file, and report every conflict with an existing record.
4. Offer a dry run that reports what an import would do without doing it.
5. Resume an interrupted import from where it stopped, applying no row twice.

## Domain and data

- An import job, its chunks, each row's outcome and each conflict are distinct records; a job moves through declared states — uploading, validating, applying, finished, failed.
- A row is applied at most once, and its outcome says which of valid, invalid, conflicting or applied it reached.
- A dependency between rows of one file is resolved before either is applied, or both are reported.

## Interfaces

- The upload contract is chunked and resumable, keyed by file so a repeated chunk is harmless.
- Progress and the final report are read through one contract, paged by row outcome.
- Applied rows are published as events the rest of the product consumes, as live edits are.

## Non-functional requirements

| Kind         | Requirement                                                                | Target |
| ------------ | -------------------------------------------------------------------------- | ------ |
| durability   | A crash mid-import loses no applied row and duplicates none                | zero   |
| consistency  | Live edits made during an import are neither lost nor silently overwritten |        |
| availability | An import never slows the product for everyone else                        |        |

## Decisions to make

- All-or-nothing, or apply the valid rows and report the rest — and what the user can do with each.
- Validate the whole file in one pass before applying, or stream validation and application — and what each costs in memory and in time to first result.
- Report per row, or per class of problem with the rows under it — and which the user can act on.

## Constraints

- The catalogue is edited live during an import; locking it is not an option.
- Files arrive in three formats from partners who will not change them.
