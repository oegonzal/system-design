# govcon-ui

The Next.js client for the govcon service: pull SAM.gov opportunities inside the daily budget, rank what is stored, read a lead's factor trace and fetch its description on demand, watch the ledger. One screen, pure components with stories, the wire contract and nothing else.

```bash
pnpm govcon:start            # the service on :3004 + this client on :4202 (needs the db)
pnpm exec nx test govcon-ui  # jsdom specs against a stubbed API
```

How it fits: [docs/govcon/overview.md](../../docs/govcon/overview.md). `NEXT_PUBLIC_GOVCON_URL` names the service (default `http://localhost:3004`).
