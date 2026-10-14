# govcon-ui

The Next.js client for the govcon service: nine routes under one shell — the dashboard (buckets, a pull, what is due, what the daily warm and the daily pull raised, the best leads, your registration), search (the store over every filter with early notices one press away; SAM.gov searches run and saved, each with what its last read brought in; the view its address), the pipeline (tracked notices as bids, and tracked firms and awards as targets), one notice in full, award and registrant intel, spending (six free USAspending lenses over one scope and its declared facets: obligations by fiscal period with the rest of the year projected, a ranked breakdown over a window, the new contracts that were open to the profile, the primes that pass work down, awards expiring by month, and an agency's budget by year with its offices — every chart with a data-table twin and a tooltip, every panel with its provenance, the view its address and kept by name), one award's record, one firm by UEI, who may hold the work a notice is about, and settings (profiles as editable data, the sources, the ledger). Every button that spends a request says so. Pure components carry stories and specs; containers are specified against a stubbed API.

```bash
pnpm govcon:start            # the service on :3004 + this client on :4202 (needs the db)
pnpm exec nx test govcon-ui  # jsdom specs against a stubbed API
```

How it fits: [docs/govcon/overview.md](../../docs/govcon/overview.md); the spending page's guide: [docs/govcon/spending.md](../../docs/govcon/spending.md). `NEXT_PUBLIC_GOVCON_URL` names the service (default `http://localhost:3004`). The active profile is chosen in the header and remembered in the browser.
