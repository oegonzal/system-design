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
match families: a NAICS family is 2, 4 or 6 digits (`5415` is every code
under it; USAspending refuses other lengths, so the service does too), and a
PSC is matched by prefix at any length (`DA` is the family, `DA01` the
code). Codes — typed or pressed — are handed on as one change once they
pause, since a read behind them can cost the source dozens of pages; the
agency and the award family are handed on at once. USAspending ANDs the code filters, so a PSC
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
Tab into a chart, move with the arrow keys, Escape hides the tooltip. The
tooltip sits beside its column and never leaves the plot: in a narrow window
it slides back over the column instead. The charts scale with the page, so
at phone width they are small and the data table under each is the readable
form.

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
family, with the soonest-ending rows. USAspending lists a scope's awards
newest-ending first and cannot filter by end date, so for each family the
service finds the page where the end dates cross today — doubling the page
number, then halving the gap, a handful of requests however deep today
lies — and reads from there toward later end dates, the soonest-ending awards
first, inside a lookback window of action dates (`HORIZON_LOOKBACK_YEARS`).
The walk is bounded by a page cap per family (`MAX_HORIZON_PAGES`, the search
and the reading together) and by the pull deadline. A capped walk says so,
names what stopped it, and names the date it is complete before: every award
ending before `completeBefore` is in the answer — the near months, the ones
a bidder acts on — and later months are partial. Measured 2026-10-13: 541511
contracts at Defense over twelve months, uncapped in 12 requests (769
contracts, the same month counts an earlier far-first walk gave); the four
software codes at Defense, complete before 2027-02-24 in 41 requests; the
four codes across every agency — today sits on page 349 of the contracts,
34,900 active awards deep — complete before 2026-11-09 in 60. A scope whose
active awards run past the source's 50,000-award depth cannot be placed at
all, and the panel then says no month is complete.

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
year — the agency's active fiscal year as the directory reports it unless
one is asked, since USAspending refuses a year outside its submissions
(measured 2026-10-13: fiscal 2027, twelve days old, was "outside the range
of current submissions" while the directory reported every agency at FY2026
Q4). Picking the agency again clears the scope.

## The daily warm and the Telegram digest

Once the service listens (`pnpm govcon:serve`; never under a CLI command),
the spending warm runs at once and then every `GOVCON_SPENDING_WARM_HOURS`
(default 24; `0` turns it off). The run at start reads what the cache window
still holds — a restart inside the day is every lens `snapshot` and no
request, which matters under `node --watch`, where every save restarts the
service — and each scheduled run renews: the snapshot is replaced inside the
window, so the page's first look that day is a snapshot. A warm reads the
default profile's NAICS (no PSC, every agency, both families) through every
lens, then, for each of the top three agencies
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
window; and one query is never loaded twice at once — a reader that arrives
while its load is in flight waits on that load. Snapshot keys carry the clock's inputs (the fiscal period, today), so
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
curl -s 'localhost:3004/spending/horizon?naics=541511&months=12' | jq '.data | {capped, stoppedBy, completeBefore, rows: (.rows|length), open: (.openNotices|length)}'
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

## A first reading for Enfav LLC (2026-10-13)

Read live on 2026-10-13 through the routes above, USAspending data as of
2026-10-12, fiscal 2027 twelve days old. Scope: the software and AI-services
codes in Enfav's capabilities — NAICS 541511 (custom programming), 541512
(systems design), 541519 (other computer services), 518210 (data processing
and hosting) — every agency, contracts and IDVs.

**Volume (Pulse).** Obligations in the four codes: FY2024 $73.1B, FY2025
$70.8B, FY2026 $71.1B, each twelve complete periods; FY2027 period 1 had
$0.37B by October 12. A flat market of about $71B a year, neither growing nor
shrinking. By code in FY2026: 541512 $31.4B (44%), 541519 $24.1B (34%),
541511 $11.5B (16%), 518210 $4.0B (6%).

**Buyers (Where, FY2026).** By department: Defense 25.2% ($17.9B), Veterans
Affairs 13.3% ($9.4B), General Services Administration 11.2% ($7.9B),
Homeland Security 10.1% ($7.2B), Health and Human Services 10.1% ($7.2B),
Justice 3.7%, Treasury 3.5%, Commerce 3.2%, State 3.1%, Transportation 2.6%,
Interior 2.0%, Agriculture 2.0% — five departments are seven tenths of it.
By sub-agency: VA 13.3%, GSA's Federal Acquisition Service 11.0% (which buys
on other agencies' behalf through its schedules and government-wide
contracts), Air Force 6.6%, Army 6.0%, Centers for Medicare and Medicaid
4.7%, Navy 3.8%, Defense Information Systems Agency 3.6%, Customs and Border
Protection 3.4%, State 3.1%, IRS 2.4%, FAA 2.1%, NIH 2.0%. By the work named
(PSC): DA01 business application and application development support 28.3%
($20.1B), DA10 9.6%, R499 other professional support 7.5%, DF01 IT management
support 6.1%, 7A21 business application software 5.4%, R425 engineering and
technical support 3.3%, DG01 network support 2.6%, DD01 service delivery
support 2.1%, 7F20 IT management tools 1.9%, R408 program management 1.7%,
DB10 compute as a service 1.6%, DF10 IT management as a service 1.5%. The
PSC families in Enfav's profile — DA, DB, DF, DG, 7030 — are the top of
this mix; application development support alone is $20B a year.

**Winners (concentration).** The largest recipients in FY2026: General
Dynamics IT 4.7%, Accenture Federal Services 4.7%, Booz Allen Hamilton 3.4%,
Oracle Health Government Services 2.9%, CACI 2.4%, Deloitte Consulting 2.2%,
SAIC 2.1%, Peraton 2.0%, Salient CRGT 1.8%, Palantir USG 1.6%, ThunderCat
Technology 1.6%, Four Points Technology 1.5%. The twelve largest hold 31%
and the 25 the lens lists hold under half; the rest is a long tail — the
market is not closed by a handful of primes, but its top is the large
integrators.

**Competition on the awards themselves** (the store: SAM.gov Contract Awards
and USAspending fetched for June–October 2026). Of the 500 most recent 5415
awards from SAM.gov, 453 (90.6%) were open competition, 34 total small
business set-asides, 8 service-disabled veteran-owned, 3 women-owned, 2
8(a) — about 9% set aside for small business. Offers received: 333 (67%)
drew many, 60 (12%) few, 83 (17%) one, 24 unknown — two-thirds of recent
awards were contested by many bidders, one in six went to a single offer.
Stored awards by code: 541511 490, 541512 326, 541519 408 (40 of them SBA
set-asides), 518210 42.

**Open notices in the store** (SAM.gov pulls of the eight saved searches,
three-day windows, exact six-digit codes): 9 open software notices — 5
Defense, 2 Veterans Affairs, 1 Health and Human Services, 1 Treasury; 3
combined synopsis/solicitations, 1 solicitation, 4 sources sought, 1 special
notice; 6 with no set-aside, 2 total small business, 1 partial. Thin, because
the saved searches read exact codes over three days; widen the window or
add family searches to see the open market, and read the Search page.

**Recompetes (Horizon).** Across every agency the four codes hold about
34,900 active contracts; the walk is complete for those ending before 2026-11-09 —
1,291 contracts end between October 13 and 31, 285 more in early
November — and for IDVs through mid-2027 (608 reach their last date
to order in what is left of October). At the Department of Defense the four
codes are complete before 2027-02-24: 254 contracts end in what is left of
October, 415 in November, 537 in December, 473 in January. 541511 alone at
Defense: 769 contracts end in the next twelve months — 31, 57, 91, 72, 58,
119, 71, 73, 74, 48, 19, 56 a month from October 2026 — complete. Each is
work a buyer may buy again. The open-notices column joins a row to the
stored notices in its NAICS code at the same buying sub-agency: candidates
for its recompete, not a confirmed match (at Defense a sub-agency is a whole
military department, so one open Navy notice shows beside every expiring
Navy contract in the code).

**The daily warm**, verified on 2026-10-13 from a fresh store seeded with the
Enfav profile (all eight NAICS, the four manufacturing codes included): one
line per lens, then the horizon and the outlook of Defense, Veterans Affairs
and GSA — the top three buyers over a rolling year. With the earlier
far-first walk it found 444 awards ending within 90 days at those three,
published 444 alerts and one digest, "444 spending alerts for Enfav LLC"
(bus event 619), and a second warm raised none of them again. The
nearest-first walk reads the soonest-ending contracts those warms could not
reach, so the next scheduled warm will find more. Most of the first 444 were
IDVs at their last date to order with nothing obligated — the count is the
signal — and many were in the manufacturing codes. For a digest a person
reads: narrow the profile's NAICS to the software four, and set
`alerts.endingWithinDays` to a month.

**What the data says for a new software and AI-services business.**

1. Opportunity is ample and steady: about $71B a year in the four codes, of
   which $20B a year is the application-development support work the
   capabilities statement describes.
2. The buyers are concentrated: Defense (Air Force, Army, Navy, DISA),
   Veterans Affairs, GSA's Federal Acquisition Service, Homeland Security
   (Customs and Border Protection) and Health and Human Services (CMS, NIH)
   are seven tenths of it.
3. Interest in services like Enfav's is not in doubt: the PSC mix is
   application development, IT management and network support services at
   scale.
4. Winning as a prime is hard: two-thirds of recent awards drew many
   offers, about 9% were small-business set-asides, and the top of the market
   is the large integrators. The realistic entry is as a subcontractor to
   those primes on the recompetes the Horizon lists, and on the small
   set-aside and sources-sought notices the store shows (four of the nine
   open software notices are sources sought — the moment to be known).
5. What this data cannot show: subcontract awards (USAspending publishes
   subaward data these lenses do not read yet), and offers or set-asides on
   USAspending's own rows (those come from SAM.gov's awards, which cost
   requests). FY2027 is twelve days old; Department of Defense awards appear
   90 days after signing; amounts are obligations, not contract ceilings.

## Troubleshooting

| What you see                                             | Why, and what to do                                                                                                                                                                                    |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A first look takes long                                  | The scope is new today: the lens is built from the source. Later reads answer from the snapshot; the warm fills the default profile's scope daily.                                                     |
| "from an older snapshot — the source refused a refresh"  | USAspending answered 429, 5xx or timed out; the day-old answer is better than none. Read the ledger row for the outcome.                                                                               |
| "The walk stopped early (pages)"                         | The scope is wide: the list is complete for awards ending before the date named, and later months are partial. Narrow the scope or the family to see further.                                          |
| "…before it could place today"                           | The scope's active awards run deeper than the page bound, or than the 50,000 awards the source pages to. Pick an agency in the Agency tab, or one code family.                                         |
| "The walk stopped early (source)"                        | A page failed; the answer was not kept, so the next read walks again.                                                                                                                                  |
| 404 on an agency                                         | The toptier code is not in USAspending's directory (`GET /spending/agencies`).                                                                                                                         |
| 400 `a NAICS family is 2, 4 or 6 digits`                 | The scope names a 3- or 5-digit NAICS family, which USAspending does not filter by. Name the 4-digit family or the 6-digit codes.                                                                      |
| 502 on an agency with `fiscal_year is outside the range` | A fiscal year was asked that the source has no submissions for yet; leave it out and the agency's active year is used.                                                                                 |
| "No projection"                                          | No complete prior fiscal year in the lookback with anything obligated.                                                                                                                                 |
| Every "Open notices" is 0                                | No pull has stored notices in these codes yet (`pnpm govcon pull`), or none is open.                                                                                                                   |
| `warm skipped: no default profile`                       | The store has no profile; the seed runs on an empty store at boot.                                                                                                                                     |
| `warm pulse refused 400 naics Too big`                   | The profile names more codes than a scope may (`MAX_SCOPE_CODES`).                                                                                                                                     |
| `alerts not published` / `digest not sent`               | The notifications service at `NOTIFICATIONS_URL` is down or does not know the `govcon.*` topics yet (rebuild it); nothing is recorded, so the same alerts are raised next warm.                        |
| `fetch failed`, or 500 with "Web Page Blocked!"          | USAspending's firewall is refusing this address after a burst of requests. Stored snapshots still answer (as `stale` once past the window); wait before asking again — every retry is another request. |

## Limits

| Constant                                                    | Value     | Where it binds                                                              |
| ----------------------------------------------------------- | --------- | --------------------------------------------------------------------------- |
| `MAX_SCOPE_CODES`                                           | 20        | codes of each kind in one scope                                             |
| `DEFAULT_PULSE_LOOKBACK_YEARS` / `MAX_PULSE_LOOKBACK_YEARS` | 3 / 5     | prior years the pulse shows and projects from                               |
| `MAX_BREAKDOWN_ROWS`                                        | 25        | rows one breakdown answers (`truncated` says when more exist)               |
| `HORIZON_MONTH_CHOICES`                                     | 6, 12, 24 | the months the page offers (`MAX_HORIZON_MONTHS` 36 on the wire)            |
| `HORIZON_LOOKBACK_YEARS`                                    | 5         | the action-date window a horizon walk covers                                |
| `MAX_HORIZON_PAGES` × `HORIZON_PAGE_SIZE`                   | 30 × 100  | pages per family (finding today's place and reading forward), rows per page |
| `HORIZON_MAX_DEPTH_AWARDS`                                  | 50,000    | the depth USAspending pages its award search to                             |
| `MAX_HORIZON_ROWS`                                          | 200       | soonest-ending rows one answer lists                                        |
| `MAX_RECOMPETE_NOTICES`                                     | 500       | open notices one horizon read joins                                         |
| `MAX_AGENCY_OFFICES`                                        | 50        | sub-agencies one outlook answers                                            |
| `ALERT_PROMPT_MAX_ITEMS` / `ALERT_PROMPT_TTL_DAYS`          | 10 / 7    | lines one digest lists; days until it expires                               |
| `MAX_ALERT_ENDING_DAYS`                                     | 366       | the farthest `alerts.endingWithinDays` may look                             |
| `WARM_TOP_AGENCIES`                                         | 3         | agency outlooks one warm reads                                              |
| `SAM_GOV_CACHE_TTL_HOURS`                                   | 24        | the snapshot window                                                         |
| `GOVCON_PULL_DEADLINE_SECONDS`                              | 120       | the wall clock on one horizon walk                                          |

## USAspending facts the design rests on

Probed live on 2026-10-12 and 2026-10-13; free, no key.

- `spending_over_time` reports by **fiscal** period (`month` 1 is October) and a window across October 1 spills into the next fiscal year.
- The `agencies` filter is by **name**; the service resolves a toptier code through `references/toptier_agencies`, whose `agency_id` is the `id` a category breakdown answers with.
- `spending_by_award` requires the `sort` field among the requested `fields`; IDVs end at `Last Date to Order`, contracts at `End Date`; `time_period` filters the action date only, never the period of performance.
- Any `spending_by_award` request carrying the keyset cursor (`last_record_unique_id`, `last_record_sort_value`) answers an empty-body 503 every time. Numbered pages answer down to the 50,000th award — page 500 at a hundred a page; deeper is a 422 naming the "maximum result limit 50000" — and `page_metadata.hasNext` is false from page 100 on while later pages still answer full, so a full page, not that flag, says more follow.
- `psc_codes` as a flat list matches by prefix at any length (`["DA"]` is the family, `["DA01"]` the code, `["7"]` every product code beginning with 7); `{ "require": [...] }` wants a path through the PSC tree per entry (`["Service", "D", "DA", "DA01"]`) and answers 422 to a bare code. `naics_codes.require` takes families of 2, 4 or 6 digits and answers 400 to any other length.
- `budgetary_resources` periods are sparse — a year just begun is empty, older years quarterly — and are shown as reported; `sub_agency` refuses a `fiscal_year` outside its submissions (the new fiscal year, for weeks after October 1), while `references/toptier_agencies` reports each agency's `active_fy`.
- The source sits behind a firewall with no published limit. Measured 2026-10-13: about 700 requests in fourteen minutes — four renewing warms back to back, the last two within two minutes — and it answered 500 with a "Web Page Blocked!" page, then refused connections from this address; one warm of about 190 requests in a minute had passed three times before that. One warm a day and ordinary browsing stay well under it; a burst does not.
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
