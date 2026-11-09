# job-application

The record of the units a browser session applied to, and the advisor the session asks before every plan what is on record. A Nest service on :3006 (`JOB_APPLICATION_PORT`), fed by the session's events on the notifications bus.

```bash
pnpm job-application:serve                       # build in watch mode and serve, reading .env
curl localhost:3006/health
curl localhost:3006/advisor                      # who it is, and the one fact it keeps its record by: company
pnpm exec nx test job-application                # the pure suites in parallel, the Postgres suites in one lane
```

The browser session asks it when its mission names `job-application` under `## Advisors` and `UNIT_ADVISOR_URLS` says where it is (`job-application=http://localhost:3006`); the service names no session and the session names no domain. How the two meet, every route, the lattice the record moves along, and what a second domain needs to do the same: [docs/job-application/overview.md](../../docs/job-application/overview.md).

## Routes

| Route                                                                        | What it does                                                                                                                                            |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /advisor`                                                               | `{data: AdvisorDescriptor}` — `job-application`, keeping its record by `company`                                                                        |
| `POST /advice` `{subject, asker, facets}`                                    | `{data: UnitAdvice}` — one unit per company on record for the subject, by stance (`forbid` in progress elsewhere, `avoid` applied, failed or set aside) |
| `POST /advice/lookup` `{subject, asker, facets, identity}`                   | `{data: UnitLookup}` — the unit on record under one identity, or `null`: what a session asks for a `taskStart` the advice had no room to name           |
| `GET /applications?subject&company&status&since&limit&offset`                | `{data: ApplicationDto[]}`, a company matched by the shared key whatever its spelling                                                                   |
| `GET /companies?subject`                                                     | `{data: CompanyDto[]}` — each company, how many applications, the latest and what it stands as                                                          |
| `POST /applications` `{subject, company, label?, url?, status?, appliedAt?}` | an application made by hand, or before the record existed; `201`                                                                                        |
| `PATCH /applications/:id` `{status}`                                         | the operator's correction — an abandoned unit confirmed submitted, or one released that never was; `404` for an unknown id                              |

## Settings

`config/engine.json` names one file per kind: `policy` (`config/policy/scatter.json` — the window in days, the stance each status takes or none, the values that identify no single employer, the set-asides after which a company is avoided) and `intake` (`config/intake/standard.json` — the subscription's name, how it pulls, and the window it rides out a restarting bus). Every value lives in the files alone; `src/settings.ts` declares and checks them.

| Variable               | Default                 | Meaning                         |
| ---------------------- | ----------------------- | ------------------------------- |
| `JOB_APPLICATION_PORT` | `3006`                  | the port the service listens on |
| `NOTIFICATIONS_URL`    | `http://localhost:3005` | the bus the record is fed from  |

## Layout

`src/advisor` (the protocol's side: the two routes and the port the record implements — it never names the domain), `src/applications` (the domain: the policy, the record as the advisor reads it, what a session's events do to it, the store, the record's own routes), `src/intake` (the bus subscriber that feeds the record), `src/common` (the clock), `src/app` (the composition root). `src/layers.spec.ts` holds each folder to its door. The table is `job_application` in `packages/db`; `pnpm db:migrate` before the first run.
