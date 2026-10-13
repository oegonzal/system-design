# Spending — where and when the government obligates money

The Spending page of `packages/govcon-ui` and the `/spending/*` routes of
`packages/govcon` answer four questions about one scope — a set of NAICS or
PSC code families, one awarding agency or every agency, contracts or
indefinite-delivery vehicles (IDVs) or both — from USAspending, which needs
no key: **when** the money moves (Pulse), **where** it goes (Where), **what is
ending** and so may be bought again (Horizon), and **how much an agency has
left** (Agency). Every answer is a snapshot the service took through the one
request gate, kept for the cache window, and carries its provenance. A daily
warm refreshes the default profile's lenses and puts what changed to a person
as a Telegram digest. This guide says how each piece works and how to use it;
the service's routes, environment and budget semantics are in
[overview.md](overview.md).

## The page, panel by panel

**Scope bar.** The active profile's NAICS codes are chips, all pressed when
the page opens: a link without a scope opens on the profile's codes, which is
also the scope the daily warm fills, so the first look is a snapshot. Codes
typed into the NAICS and PSC fields match families (`5415` is every code under
it) and are handed on once typing pauses; chips, the agency and the award
family are handed on at once. USAspending ANDs the code filters, so a PSC
narrows a NAICS scope rather than widening it; leave PSC empty to see the
whole industry. The agency select is the directory USAspending publishes.

**The view is its address.** The scope, the open tab and each lens's setting
travel in the URL, so a reload, a shared link and a return by Back all open
the same view. Only what differs from the profile's default is written:

| Parameter     | Values                                                                                  | Default             |
| ------------- | --------------------------------------------------------------------------------------- | ------------------- |
| `naics`       | one per code (`naics=541511&naics=541512`); `naics=` alone means none                   | the profile's NAICS |
| `psc`         | one per code                                                                            | none                |
| `agency`      | a toptier code (`097`)                                                                  | every agency        |
| `awardFamily` | `contracts`, `idvs`, `both`                                                             | `both`              |
| `tab`         | `pulse`, `where`, `horizon`, `agency`                                                   | `pulse`             |
| `category`    | `awarding_agency`, `awarding_subagency`, `recipient`, `naics`, `psc`, `state_territory` | `awarding_agency`   |
| `window`      | `fytd`, `prior-fy`, `last-12-months`                                                    | `last-12-months`    |
| `months`      | `6`, `12`, `24`                                                                         | `12`                |

A value the vocabulary does not know falls back to the default. A tab mounts
the first time it is opened — by a click or by the address — and stays
mounted, so a lens nobody opened never reads and a tab switched back to costs
nothing.

**Every panel.** A provenance line names the source, the date the source says
its data is as of, whether the answer was fetched now, served from the day's
snapshot, or served from an older snapshot because the refresh failed, how
many HTTP attempts the snapshot cost, and when it was fetched; the source's
disclosures — the Department of Defense publishes awards 90 days after
signing, agency financials arrive weeks after the period, USAspending cannot
filter by period of performance — are shown verbatim. Every chart has a "Data
table" disclosure with the same numbers as text, and answers hover and focus
on a column with one tooltip naming every series at that x, the value first.
Tab into a chart, move with the arrow keys, Escape hides the tooltip.

### Pulse — when the money moves

Obligations by fiscal period (October is period 1) for the prior fiscal years
and this one so far. The period in progress is lighter (**provisional**: its
amount is still growing); the rest of this year is hatched (**projected**) with
a band behind it. The projection is declared arithmetic: the mean of the
complete prior years' amounts in that period, scaled by this year's run rate
(year to date over the prior mean to date) once at least two periods of this
year are complete; the band is the prior years' low and high. The method
sentence under the chart names the years it rests on and the scale. Tiles:
year to date, the prior year to the same period with the change, the
projected remainder with its band, and the projected total. Without a
complete prior year there is no projection, and the panel says so.

### Where — where the money goes

The scope's obligations over a window, ranked by awarding agency,
sub-agency, recipient, NAICS, PSC or state, each a share of the scope's
whole over that window (the whole is read separately, so the rows need not
add up to it). The window opens on the last twelve months — a whole year on
any day, where the fiscal year to date is thirteen days long on October 13 —
with the fiscal year to date and the prior fiscal year as presets.
"Truncated" means more rows exist beyond the declared bound
(`MAX_BREAKDOWN_ROWS`).

### Horizon — what is ending

Active awards in the scope ending inside the months ahead, by month and
family, with the soonest-ending rows. USAspending cannot filter by period of
performance, so the service walks awards newest-ending first, by numbered
page, inside a lookback window of action dates (`HORIZON_LOOKBACK_YEARS`),
and stops when the end dates pass today. The walk is bounded by a page cap
per family (`MAX_HORIZON_PAGES`) and by the pull deadline; a capped walk says
so, names what stopped it, and names the earliest end date it reached — the
months after it are complete, the ones before it may be missing rows. A wide
scope caps before it reaches the window at all: measured 2026-10-13, the
four software NAICS together put 3,000 contracts per family all ending after
September 2027, and 541511 alone across every agency reached January 2027 in
3,000 — while 541511 at one department (Defense) reached today in nine pages,
uncapped. The panel says when nothing inside the window was reached; the
Horizon reads best at one code family and one agency, which is what the
directory pick sets, and what the daily warm fills.

**Open notices are recompetes.** Each expiring award is joined, on every
read, to the open notices already stored by the pulls that share its exact
NAICS code and its agency sub-tier — the two facts both records declare —
each a link to the notice. The join is computed when the answer is read, so a
pull that stores new notices shows them on the next look without a refresh,
and it is never snapshotted. "With an open notice" counts the listed rows
that have one. The join reads up to `MAX_RECOMPETE_NOTICES` notices and says
when that bound cut.

### Agency — how much is left

The directory of toptier agencies with their budget authority. Picking one
makes it the page's scope — every lens narrows to it — and opens its
outlook: budgetary resources, obligations and outlays to date for the latest
fiscal year with the headroom (resources less obligations), obligations to
date by period for the years the source reports (monthly in recent years,
quarterly before; shown as reported, never padded), and the sub-agencies and
offices with their obligations, transactions and new-award counts for the
year. Picking the agency again clears the scope.

## The daily warm and the Telegram digest

Once the service listens (`pnpm govcon:serve`; never under a CLI command),
the spending warm runs at once and then every `GOVCON_SPENDING_WARM_HOURS`
(default 24; `0` turns it off). Each warm reads the default profile's NAICS
(no PSC, every agency, both families) through every lens with a forced
refresh — the snapshot is replaced inside the cache window, so the page's
first look that day is a snapshot — then, for each of the top three agencies
the rolling-year breakdown names, the horizon narrowed to that agency (the
scope a directory pick opens, and the one whose walk reaches today) and its
outlook, and logs one line per lens:

```
spending warm every 24 h
warm pulse source 1 req 812 ms
warm breakdown source 2 req 1240 ms
warm horizon source 7 req 9870 ms
warm agencies source 1 req 310 ms
warm horizon 097 source 9 req 6210 ms
warm agency 097 source 2 req 1105 ms
warm alerts: 3 found, 2 new, 2 published, digest sent
```

Then the alert rules run over what was read. They are declared on the
profile and edited in Settings → Alerts:

| Rule                            | Profile field             | What it raises                                                                                         |
| ------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------ |
| An award in the scope is ending | `alerts.endingWithinDays` | One alert per listed award ending within this many days of today (default 90; `0` raises none)         |
| The pulse runs above its band   | `alerts.pulseAboveBand`   | One alert when the period in progress has already obligated more than every prior year's amount for it |

Each alert is raised once per kind and subject — the same expiring award
seen through the profile's horizon and an agency's is one alert: a ninth
table, `govcon_alert`, remembers what was raised, so tomorrow's warm raises
only what is new. Each new alert is published on its declared topic
(`govcon.award.ending`, `govcon.pulse.above-band`) on the notifications bus
at `NOTIFICATIONS_URL`, and one digest per warm — "N spending alerts for
Enfav LLC", at most ten lines and a count of the rest, one "Noted" button,
expiring after seven days — is published as a prompt, which is what the
Telegram channel renders. Only what was published is recorded, so a bus that
cannot be reached is one warning and the same alerts are raised next warm.

## How it works

Every lens is one `LensSpec` — its name in the snapshot table, the schema a
stored body must still pass, the provider disclosures it carries, and how it
loads — read through one `SnapshotCache`: a stored body inside the cache
window (`SAM_GOV_CACHE_TTL_HOURS`) answers as `snapshot` without a request;
otherwise the lens loads through the request gate (every USAspending page one
ledger row under its own operation), the body is stored and answers as
`source`; a refresh the source refused serves the stored body of any age as
`stale`, saying so; a walk the source cut short answers but is not kept, so
the next read walks again; a read asked to `refresh` — the warm — skips the
window. Snapshot keys carry the clock's inputs (the fiscal period, today), so
a row is never served for another day. Pure arithmetic lives in
`packages/govcon/src/core/spending/` (the series aligner, the projection,
the horizon walk, the agency alignment, the recompete join, the alert rules);
one adapter per USAspending endpoint lives in
`packages/govcon/src/modules/sources/usaspending/`; the warm, the alert
ledger and the bus sink in `packages/govcon/src/modules/spending/`. The
criteria are `GOV-20..24` and `GOVU-11..12` in `packages/criteria`.

## How to use the tools

**The page:** `pnpm govcon:start`, then `http://localhost:4202/spending`.
Press chips off to narrow, type a family, pick an agency from the directory,
switch the window and the months — then copy the address.

**The routes**, each `{ data }`:

```
curl -s 'localhost:3004/spending/pulse?naics=541511,541512&lookback=3' | jq '.data | {fiscalYear, projection: .projection.method, servedFrom: .provenance.servedFrom}'
curl -s 'localhost:3004/spending/breakdown?category=awarding_agency&naics=541511&from=2025-10-01&to=2026-09-30' | jq '.data | {total, truncated, top: .rows[:5]}'
curl -s 'localhost:3004/spending/horizon?naics=541511&months=12' | jq '.data | {capped, stoppedBy, reachedEndsAt, rows: (.rows|length), open: (.openNotices|length)}'
curl -s 'localhost:3004/spending/agencies' | jq '.data.entries | length'
curl -s 'localhost:3004/spending/agencies/097?fiscalYear=2026' | jq '.data | {name, years: [.years[]|{fiscalYear, periods: (.byPeriod|length)}]}'
```

Lists are comma-joined on the wire; the server sorts and de-duplicates them,
so the same scope in any spelling is one snapshot.

**The ledger:** every page read is one row under its operation —
`series`, `breakdown`, `horizon`, `agency-budget`, `agency-offices`,
`agency-directory`, `freshness` — in Settings → Ledger and at
`GET /source/calls?operation=horizon`.

**Settings → Alerts:** the two thresholds above, saved with the profile.

**Reading a market for a company.** Set the scope to the company's NAICS
(for a software and AI-services firm: `541511`, `541512`, `541519`, `518210`;
leave PSC empty first). Pulse says whether the obligations in those codes are
growing year over year and how much of this year is still ahead. Where by
awarding agency and sub-agency says who buys; by recipient, how concentrated
the winners are — the top rows' shares of the whole are the incumbents'
hold on the market; by PSC, what kind of work the money names. Horizon says
how many awards end inside the next year and which of them already have an
open notice — the recompetes a new entrant can bid. The Agency tab says how
much of a buyer's year is still unobligated. For what competition looks like
on the notices themselves — set-asides, notice types, offers received —
read the store on the Search and Intel pages after a pull, since USAspending
does not carry them.

## Troubleshooting

| What you see                                            | Why, and what to do                                                                                                                                                             |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A first look takes long                                 | The scope is new today: the lens is built from the source. Later reads answer from the snapshot; the warm fills the default profile's scope daily.                              |
| "from an older snapshot — the source refused a refresh" | USAspending answered 429, 5xx or timed out; the day-old answer is better than none. Read the ledger row for the outcome.                                                        |
| "The walk stopped early (pages)"                        | The scope is wide; the months after `reachedEndsAt` are complete. Narrow the scope or the family.                                                                               |
| \"…before it reached the window\"                       | Wider still: every award the walk read ends after the window. Pick an agency in the Agency tab, or one code family.                                                             |
| "The walk stopped early (source)"                       | A page failed; the answer was not kept, so the next read walks again.                                                                                                           |
| 404 on an agency                                        | The toptier code is not in USAspending's directory (`GET /spending/agencies`).                                                                                                  |
| "No projection"                                         | No complete prior fiscal year in the lookback with anything obligated.                                                                                                          |
| Every "Open notices" is 0                               | No pull has stored notices in these codes yet (`pnpm govcon pull`), or none is open.                                                                                            |
| `warm skipped: no default profile`                      | The store has no profile; the seed runs on an empty store at boot.                                                                                                              |
| `warm pulse refused 400 naics Too big`                  | The profile names more codes than a scope may (`MAX_SCOPE_CODES`).                                                                                                              |
| `alerts not published` / `digest not sent`              | The notifications service at `NOTIFICATIONS_URL` is down or does not know the `govcon.*` topics yet (rebuild it); nothing is recorded, so the same alerts are raised next warm. |

## Limits

| Constant                                                    | Value     | Where it binds                                                   |
| ----------------------------------------------------------- | --------- | ---------------------------------------------------------------- |
| `MAX_SCOPE_CODES`                                           | 20        | codes of each kind in one scope                                  |
| `DEFAULT_PULSE_LOOKBACK_YEARS` / `MAX_PULSE_LOOKBACK_YEARS` | 3 / 5     | prior years the pulse shows and projects from                    |
| `MAX_BREAKDOWN_ROWS`                                        | 25        | rows one breakdown answers (`truncated` says when more exist)    |
| `HORIZON_MONTH_CHOICES`                                     | 6, 12, 24 | the months the page offers (`MAX_HORIZON_MONTHS` 36 on the wire) |
| `HORIZON_LOOKBACK_YEARS`                                    | 5         | the action-date window a horizon walk covers                     |
| `MAX_HORIZON_PAGES` × `HORIZON_PAGE_SIZE`                   | 30 × 100  | pages per family, rows per page                                  |
| `MAX_HORIZON_ROWS`                                          | 200       | soonest-ending rows one answer lists                             |
| `MAX_RECOMPETE_NOTICES`                                     | 500       | open notices one horizon read joins                              |
| `MAX_AGENCY_OFFICES`                                        | 50        | sub-agencies one outlook answers                                 |
| `ALERT_PROMPT_MAX_ITEMS` / `ALERT_PROMPT_TTL_DAYS`          | 10 / 7    | lines one digest lists; days until it expires                    |
| `MAX_ALERT_ENDING_DAYS`                                     | 366       | the farthest `alerts.endingWithinDays` may look                  |
| `WARM_TOP_AGENCIES`                                         | 3         | agency outlooks one warm reads                                   |
| `SAM_GOV_CACHE_TTL_HOURS`                                   | 24        | the snapshot window                                              |
| `GOVCON_PULL_DEADLINE_SECONDS`                              | 120       | the wall clock on one horizon walk                               |

## USAspending facts the design rests on

Probed live on 2026-10-12 and 2026-10-13; free, no key.

- `spending_over_time` reports by **fiscal** period (`month` 1 is October) and a window across October 1 spills into the next fiscal year.
- The `agencies` filter is by **name**; the service resolves a toptier code through `references/toptier_agencies`, whose `agency_id` is the `id` a category breakdown answers with.
- `spending_by_award` requires the `sort` field among the requested `fields`; IDVs end at `Last Date to Order`, contracts at `End Date`; `time_period` filters the action date only, never the period of performance.
- Any `spending_by_award` request carrying the keyset cursor (`last_record_unique_id`, `last_record_sort_value`) answers an empty-body 503 every time; numbered pages answer (page 60 is empty for a six-digit NAICS), so the walk pages by number.
- `budgetary_resources` periods are sparse — a year just begun is empty, older years quarterly — and are shown as reported.
- `awards/last_updated` is `MM/DD/YYYY`; Department of Defense awards appear 90 days after signing; agency financials are revealed about five to six weeks after the period.

## Reviewing a build live

Start the stack (`pnpm stack:db`, `pnpm db:migrate`, `pnpm govcon:start`)
and watch the service log for the warm's lines. Open `/spending`: the chips
are pressed, the pulse reads once and says it was served from the snapshot
the warm took. Press a chip off and watch the address and the one re-read;
type a family and see exactly one request after the pause. Visit Where and
note the top agencies; on Agency, pick one — the scope narrows, every lens
re-reads, the outlook opens — and pick it again to clear. On Horizon, change
the months, open an "Open notices" disclosure and follow a link to the
notice. Hover a column and Tab into a chart. Copy the address into a new tab
and reload: the same view. Then read the ledger by operation, and, with the
notifications service up, the digest on Telegram.
