# govcon-ui

The Next.js client for the govcon service: six routes under one shell — the dashboard (buckets, a pull, what is due, the best leads, your registration), search (the store over every filter; SAM.gov searches run and saved), the bid pipeline, one notice in full, award and registrant intel, and settings (profiles as editable data, the sources, the ledger). Every button that spends a request says so. Pure components carry stories and specs; containers are specified against a stubbed API.

```bash
pnpm govcon:start            # the service on :3004 + this client on :4202 (needs the db)
pnpm exec nx test govcon-ui  # jsdom specs against a stubbed API
```

How it fits: [docs/govcon/overview.md](../../docs/govcon/overview.md). `NEXT_PUBLIC_GOVCON_URL` names the service (default `http://localhost:3004`). The active profile is chosen in the header and remembered in the browser.
