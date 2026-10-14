# Spending — where and when the government obligates money

The Spending page of `packages/govcon-ui` and the `/spending/*` routes of
`packages/govcon` answer six questions about one scope — a set of NAICS or
PSC code families, one awarding agency or every agency, contracts or
indefinite-delivery vehicles (IDVs) or both, narrowed by any of six facets —
from USAspending, which needs no key: **when** the money moves (Pulse),
**where** it goes (Where), **how much of it was open to you** (Reach), **who
passes work down** (Primes), **what is ending** and so may be bought again
(Horizon), and **how much an agency has left** (Agency). One award and one
firm each have a page of their own. Every answer is a snapshot the service took through the one
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

**More filters.** Six facets narrow the scope further, behind one fold that
says how many are set and is open when a link arrives with some. They are
one declared table (`SPENDING_FACETS` in contracts), so the control, the
address, the wire and the snapshot key all spell a value the same way:

| Facet           | What it keeps                                                                                                                              |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Awarded to      | Awards to the firms named by UEI. In a subcontract search this is the subcontractor.                                                       |
| Won by          | Awards to small businesses, or to everyone else, by the size the government recorded on that award.                                        |
| Placed as       | Stand-alone contracts, or orders under a vehicle the winner already held. Choosing one makes the scope one of contracts.                   |
| Set-aside       | Any of the set-aside codes, with `NONE` for an award made under no set-aside. **My lanes** presses the ones the profile's scoring may bid. |
| Award size      | One of four bands cut at the acquisition thresholds: up to $15K, to $350K, to $900K, and over.                                             |
| New awards only | Awards that began inside the window, never a change to an older one.                                                                       |

A code or a range the table does not offer, named by an address or a saved
view, is shown pressed beside the ones it does. "Awarded to" is typed, since
no list of firms could be offered: the field keeps what is being typed and
hands a UEI on once it is one.

**Largest codes in this scope.** One more fold under the bar ranks the
scope's PSC and NAICS codes by what was obligated under them over the last
twelve months, each a chip with its dollars that puts the code in the scope
or takes it out. Each kind is ranked over the scope without its own codes of
that kind, so the list shows what there is to choose from. It reads two
breakdowns a scope and only once opened. Product service codes are the
filter to reach for: a keyword finds almost nothing in this data, and a
code finds the work.

**Saved views.** Name the page as it stands and it is kept for the profile
as a link; saving under a name already kept updates it. A saved view spells
its NAICS out even when they are the profile's own, so it opens the same
whatever the profile comes to name. The service keeps the address and
nothing of what it shows.

**The view is its address.** The scope, the open tab and each lens's setting
travel in the URL, so a reload, a shared link and a return by Back all open
the same view. Only what differs from the profile's default is written:

| Parameter       | Values                                                                                  | Default             |
| --------------- | --------------------------------------------------------------------------------------- | ------------------- |
| `naics`         | one per code (`naics=541511&naics=541512`); `naics=` alone means none                   | the profile's NAICS |
| `psc`           | one per code                                                                            | none                |
| `agency`        | a toptier code (`097`)                                                                  | every agency        |
| `awardFamily`   | `contracts`, `idvs`, `both`                                                             | `both`              |
| `recipient`     | UEIs, comma-joined                                                                      | any firm            |
| `recipientSize` | `small`, `other`                                                                        | anyone              |
| `placement`     | `standalone`, `order`                                                                   | either              |
| `setAside`      | codes, comma-joined (`NONE,SBA,SBP`)                                                    | any                 |
| `amount`        | `min-max` in dollars, either end open (`15000.01-350000`, `-15000`)                     | any                 |
| `newOnly`       | `true`                                                                                  | every action        |
| `tab`           | `pulse`, `where`, `reach`, `primes`, `horizon`, `agency`                                | `pulse`             |
| `category`      | `awarding_agency`, `awarding_subagency`, `recipient`, `naics`, `psc`, `state_territory` | `awarding_agency`   |
| `window`        | `fytd`, `prior-fy`, `fy-before-last`, `last-12-months`                                  | `last-12-months`    |
| `months`        | `6`, `12`, `24`                                                                         | `12`                |

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
it slides back over the column instead. The page is laid out for a desktop window: the charts
scale with the page, so at phone width they are small and the data table
under each is the readable form. A table with more columns than the window
has room for scrolls sideways inside its own frame, which a keyboard can
focus, and the page itself never moves sideways.

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

**What the source has not published yet.** USAspending shows Department of
Defense awards 90 days after they are signed, so for a scope that counts
Defense the last three months are short, and reading them as real makes a
growing market look like a falling one. The adapter declares that lag; the
service counts back from the source's own "data as of" to the last day that
is all in, and marks every period ending after it **unpublished**. Those
periods are drawn lighter like the month in progress, are projected instead
of trusted, and never enter this year's run rate; a prior year that still
holds one is no year the projection averages. The change against the prior
year is taken over the periods both years have settled, and its label says
how far that reaches ("vs the prior year through May"). A note under the
chart names the agency, the lag and the day. A scope of one agency that
publishes on time carries no mark.

### Where — where the money goes

The scope's obligations over a window, ranked by awarding agency,
sub-agency, recipient, NAICS, PSC or state, each a share of the scope's
whole over that window (the whole is read separately, so the rows need not
add up to it). The window opens on the last twelve months — a whole year on
any day, where the fiscal year to date is thirteen days long on October 13 —
with the fiscal year to date, the prior fiscal year and the one before it as
presets.
"Truncated" means more rows exist beyond the declared bound
(`MAX_BREAKDOWN_ROWS`). When the window reaches past the last day a late
agency has published, a note says the total and that agency's rows are
short. For a quarter after October 1 that includes the prior fiscal year,
which the late agency has not finished; "Fiscal year before last" is then
the latest year that reads whole, and the note's absence says so.

### Reach — how much of it was open to you

The scope's new contracts over the page's window, cut down step by step.
Each cut narrows the one before it and never widens:

1. **New contracts**: begun inside the window.
2. **In your lanes**: made with no set-aside or under one the profile may
   bid. The lanes are read from the profile's scoring.
3. **No vehicle needed**: placed as contracts of their own, not as orders
   under a vehicle a firm must already hold.
4. **Won by a small business**: what firms that size took of it.

Each cut shows its count, its share of the first, the dollars obligated on
it, and a link that opens Where ranked by recipient under exactly that
cut's facets, so "who won those 1,812" is one click. The last cut is then
shown by award size against the acquisition thresholds, each band with the
rule that applies to a purchase of that size. Reach counts contracts only:
a vehicle is not work until an order is placed under it. A cut the scope's
own facets rule out — stand-alone contracts in a scope of orders — is
answered as zero without asking the source. The read is twelve requests:
a count and a total for each cut, and a count for each band.

Checked 2026-10-13 against the source directly for NAICS 541511, 541512 and
541519 over fiscal 2025: 33,911 new contracts, and 1,812 at the last cut.

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

**"Ends" is the current end.** The date listed is the end of the period
already exercised. Options not yet exercised can carry an award further,
and USAspending's award search does not return that date (it answers null
for it), so the list cannot show it. Measured 2026-10-13 on the eight
largest software awards ending that week: four ran on with options, to
January 2027, September 2027, October 2028 and October 2029. An award about
to "end" is often an option decision, not a recompete. Each row links to the
award's own page, which shows both dates, and its holder links to the
firm's page.

### Primes — who passes work down

Ninety percent of software dollars are ordered through vehicles a new firm
does not hold, so the lane open first is a subcontract. This tab ranks the
scope's primes by the subcontracts they reported, within the size of
subcontract the profile could take (`teaming.subcontract`, $50K to $2M
unless Settings says otherwise) and over the page's window.

It reads one count of what the source holds, then the rows most recent
first, up to `MAX_SUBAWARD_PAGES` pages and the wall-clock deadline. A prime
often reports an earlier subcontract again, so the same prime award,
subcontractor and amount is counted once. A prime is its UEI; a firm that
files under two UEIs is two rows, each with its own page. The tiles say how
many subcontracts the source holds, how many were read and how far back,
how many repeated, and how many primes and subcontractors that covers; when
older rows were left unread a line says so, and a count is then a floor.

Each prime shows its UEI, its subcontracts, the different firms they went
to, the dollars, the share placed under prime awards coded as services (a
product service code that begins with a letter), and what it holds itself as
a prime in the scope over the same window. A large firm files under several
UEIs, so its name can head several rows; the UEI is what tells them apart,
and each row is that registration's own record. "Hires" lists the firms it
reported
most, each a link to **who hires that firm**: this tab with the scope
narrowed to that subcontractor, since in a subcontract search "Awarded to"
matches the subcontractor. The same link works from any UEI typed under
More filters.

A subcontract search honours the scope's codes, agency, set-aside, placement
and winner's size as facts about the prime's award. It cannot ask for a
prime award's size or for new awards only, so those two facets are unset in
the scope the answer reports.

Checked 2026-10-13 against the report in `enfav-prospects.md`, for NAICS
541511, 541512 and 541519, fiscal 2024 and 2025, $50K to $2M: 16,771
subcontracts held, 3,000 read back to 2025-04-03, 95 repeats removed, and
the same six primes on top with the same counts once a firm's two UEIs are
added together (CACI 325, General Dynamics IT 323, Booz Allen Hamilton 320,
Leidos 308, Accenture Federal Services 269). Thirty-two requests.

## One award, and one firm

**An award** opens at `/awards/<id>` from the Horizon, from Intel for an
award stored from USAspending, and from another award that names it as its
vehicle. It shows who holds it and who owns the holder, the buyer down to
the office, what is obligated against what the award can reach, when it
ends beside when it would end with every option, the vehicle it sits under,
how it was competed (offers received, or that the buyer did not count
them), how it is priced and coded, the largest subcontracts reported under
it, and the open stored notices from the same buyer and code.

A vehicle is read differently, because its money is on its orders: its own
obligations are usually zero. Its page shows what was ordered under it, in
dollars and in orders, against its ceiling, counting orders placed through
any vehicle awarded under it (a schedule's orders go through its
agreements), and whether one firm or several hold it. Checked 2026-10-13 on
one multiple-award vehicle: $0 obligated on the record itself, $47.6M in 9
orders under it, a $2.6B ceiling.

One request the first time that day for the record, one more for a
vehicle's orders, and one more for the subcontracts when any are reported.

**A firm** opens at `/primes/<uei>` from the Primes tab, the Horizon, Where
ranked by recipient, Intel and an award. It is headed by the firm's name and
what it was obligated in the active profile's codes over the last twelve
months, which is the recipient ranking narrowed to that firm; until an award
or a registration names it, the UEI heads the page. Its SAM.gov registration
is shown as the store holds it, and looking it up is one budgeted request
behind a button that says so. Under it are the Spending lenses narrowed to
that firm in the profile's codes, each read only once its tab is opened: the
awards it holds that are ending, who buys from it, the firms it reported
hiring, and the primes that reported hiring it. The firm is one facet of a
scope, so the page adds no second way of reading anything.

"Who it hires" is the firm's own row of the profile's ranking, so it has
the ranking's bound: a firm that is not among the `PRIMES_LISTED` primes
reporting the most is said to be outside it, with the count the last listed
prime reported.

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
lens, the reach count taken for the lanes the profile may bid, then, for
each of the top three agencies
the rolling-year breakdown names, the horizon narrowed to that agency (the
scope a directory pick opens, and the one whose walk reaches today) and its
outlook, then the own record of every award you track (see "Tracked
awards" below), and logs one line per lens:

```
spending warm every 24 h
warm pulse source 1 req 812 ms
warm breakdown source 2 req 1240 ms
warm reach source 12 req 4310 ms
warm horizon source 7 req 9870 ms
warm agencies source 1 req 310 ms
warm horizon 097 source 9 req 6210 ms
warm agency 097 source 2 req 1105 ms
warm award CONT_AWD_W912DY23F0468_9700_W912DY20D0079_9700 snapshot 1 req 6 ms
warm alerts: 3 found, 2 new, 2 published, digest sent
```

Then the alert rules run over what was read. They are declared on the
profile and edited in Settings → Alerts:

| Rule                              | Profile field             | What it raises                                                                                                               |
| --------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| An award is ending                | `alerts.endingWithinDays` | One alert per award ending within this many days of today (default 90; `0` raises none)                                      |
| Whose ending awards               | `alerts.audience`         | `scope`: every award the horizons list, and every tracked award. `watched`: tracked awards only                              |
| How much must be obligated on one | `alerts.minObligated`     | An award found in the scope is raised only with at least this many dollars obligated on it (default 0). A tracked one always |
| The pulse runs above its band     | `alerts.pulseAboveBand`   | One alert when the period in progress has already obligated more than every prior year's amount for it                       |

Each alert is raised once per kind and subject — the same expiring award
seen through the profile's horizon and an agency's is one alert: the
`govcon_alert` table remembers what was raised, so tomorrow's warm raises
only what is new. Each new alert is published on its declared topic
(`govcon.award.ending`, `govcon.award.end-moved`, `govcon.award.notice`,
`govcon.pulse.above-band`) on the notifications bus at `NOTIFICATIONS_URL`,
and one digest per warm — "N spending alerts for Enfav LLC", at most ten
lines and a count of the rest, one "Noted" button, expiring after seven
days — is published as a prompt, which is what the Telegram channel
renders. Only what was published is recorded, so a bus that cannot be
reached is one warning and the same alerts are raised next warm.

**Where the rest are.** The table keeps what was published with each alert,
so the dashboard's Alerts panel reads them back as the lines that were
sent, newest warm first and, within a warm, in the digest's order: a
tracked award's news, then a finding about the whole scope, then the ending
awards with the most obligated first. Each line links to the award or the
notice it names. `GET /alerts?limit&offset` is the same list. An alert
raised before 2026-10-14 kept no payload, and is listed by its key with a
link to the award when it is an ending one.

**Tracked awards.** Track an award from its page and the warm reads its own
record every day, through the award lens, so it costs one to three free
requests on a scheduled warm and nothing on a restart. Up to
`MAX_WATCHED_AWARDS` are read, the ones never read first and then the
soonest to end; an award passed on is no longer read. Three things are
raised about a tracked award, whatever the profile's audience and floor:

| What                          | When                                                                                                                     | Raised once per       |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------ | --------------------- |
| It is ending                  | Its end falls inside `alerts.endingWithinDays`                                                                           | Award                 |
| Its end moved                 | Its end is not the one the last warm read: an option was exercised, it was extended, or it was cut short                 | Award and the new end |
| A notice may be its follow-on | A stored open notice shares its exact NAICS code and its buyer's sub-agency, the join the Horizon and the award page use | Award and notice      |

The end a warm reads is kept on the target, and is what the next warm
compares against; the pipeline shows it. It is written only once the alert
that says it moved is on the ledger, so a bus that was down loses nothing:
the next warm finds the same move again.

**Quieter digests.** The two levers the measurements below asked for are
now on the profile. Set `alerts.minObligated` to drop the small orders that
fill a dense scope's list, or set `alerts.audience` to `watched` so only the
awards you chose to follow are raised as ending.

**How many to expect.** The ending rule reads the rows each horizon lists —
the 200 soonest-ending awards of its scope (`MAX_HORIZON_ROWS`), for the
profile's scope and for each top agency's — so the window bounds a digest
only where a list reaches past it. In a dense scope the 200 rows all end
within days and every one is inside any window; in a sparse one the window
cuts the list. Measured 2026-10-13 on the four software codes: the rows
listed across every agency ended by October 17, at Defense by October 31, at
Veterans Affairs by November 30 and at GSA by December 28, so a 30-day
window held 559 awards and a 90-day one 740. After the first digest each
award is raised once, on the day it first shows in a list inside the window:
a day's count is roughly the awards ending per day in the scope, whatever
the window, and the window sets how many days ahead a sparse list tells you.
The digest shows the ten with the most obligated and counts the rest. Fewer
codes on the profile shorten it, a floor on obligated dollars or the
`watched` audience shortens it more, and `0` turns the rule off.

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
while its load is in flight waits on that load. Snapshot keys carry the
clock's inputs (the fiscal period, today), so a row is never served for
another day. A buyer is stored as a dotted `department.subtier.office` path,
the way SAM.gov writes a notice's; a name's own dots are dropped when the
path is built, so `U.S. Coast Guard` is stored and shown as `US Coast Guard`.
Pure arithmetic lives in
`packages/govcon/src/core/spending/` (the series aligner, the projection,
the horizon walk, the agency alignment, the recompete join, the alert rules,
how a publication delay marks a period, and how facets narrow cut by cut);
one adapter per USAspending endpoint lives in
`packages/govcon/src/modules/sources/usaspending/`; the warm, the alert
ledger and the bus sink in `packages/govcon/src/modules/spending/`; saved
views in `packages/govcon/src/modules/views/`. The criteria are `GOV-20..30`
and `GOVU-11..19` in `packages/criteria`.

## How to use the tools

**The page:** `pnpm govcon:start`, then `http://localhost:4202/spending`.
Press chips off to narrow, type a family, pick an agency from the directory,
switch the window and the months — then copy the address.

**The routes**, each `{ data }`:

```
curl -s 'localhost:3004/spending/pulse?naics=541511,541512&lookback=3' | jq '.data | {fiscalYear, projection: .projection.method, servedFrom: .provenance.servedFrom}'
curl -s 'localhost:3004/spending/breakdown?category=awarding_agency&naics=541511&from=2025-10-01&to=2026-09-30' | jq '.data | {total, truncated, top: .rows[:5]}'
curl -s 'localhost:3004/spending/reach?naics=541511,541512,541519&from=2024-10-01&to=2025-09-30&lanes=NONE,SBA,SBP' | jq '.data | {cuts: [.cuts[]|{id, awards, amount}], bands}'
curl -s 'localhost:3004/spending/breakdown?category=recipient&naics=541511&from=2024-10-01&to=2025-09-30&placement=standalone&setAside=NONE,SBA,SBP&recipientSize=small&newOnly=true' | jq '.data.rows[:10]'
curl -s 'localhost:3004/spending/primes?naics=541511,541512,541519&awardFamily=contracts&from=2023-10-01&to=2025-09-30&band=50000-2000000' | jq '.data | {total, read, duplicates, reachedBack, primes: [.primes[:6][]|{name, uei, subcontracts}]}'
curl -s 'localhost:3004/spending/primes?naics=541511&from=2023-10-01&to=2025-09-30&recipient=JLW7WAKPEKD4' | jq '.data.primes[:5]'
curl -s 'localhost:3004/spending/awards/CONT_AWD_W912DY23F0468_9700_W912DY20D0079_9700' | jq '.data | {piid, endsAt, endsWithOptionsAt, vehicle, competition}'
curl -s 'localhost:3004/spending/horizon?naics=541511&months=12' | jq '.data | {capped, stoppedBy, completeBefore, rows: (.rows|length), open: (.openNotices|length)}'
curl -s 'localhost:3004/spending/agencies' | jq '.data.entries | length'
curl -s 'localhost:3004/spending/agencies/097?fiscalYear=2026' | jq '.data | {name, years: [.years[]|{fiscalYear, periods: (.byPeriod|length)}]}'
```

Lists are comma-joined on the wire; the server sorts and de-duplicates them,
so the same scope in any spelling is one snapshot. Every scoped route takes
the six facets under the names in the table above, and refuses a value
outside the vocabulary with a 400 naming the field.

**The ledger:** every page read is one row under its operation —
`series`, `breakdown`, `horizon`, `award-count`, `subaward-count`,
`subawards`, `award-detail`, `award-orders`, `award-subawards`, `agency-budget`,
`agency-offices`, `agency-directory`, `freshness` — in Settings → Ledger and at
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
$70.8B, and $71.1B so far for FY2026; FY2027 period 1 had $0.37B by
October 12. FY2025 is the last year the data holds whole: the Department of
Defense publishes awards 90 days after signing, so on this date its FY2026
stops in mid-July; the Pulse marks the periods after it unpublished and
rests no projection on that year.
Measured directly from USAspending for the three 5415 codes, contracts only:
Defense shows $0.6B for July through September 2026 against $8.6B a year
earlier; through June it ran 21% ahead of FY2025 ($16.1B against $13.4B),
and civilian agencies finished FY2026 11% up ($49.7B against $44.9B). The
market is not flat: it dipped 3% in FY2025, and FY2026 will close near $74B
to $76B for the three codes, against $66.8B, once Defense's last quarter is
published in January. By code in FY2025: 541512 $32.1B (45%), 541519 $25.1B
(35%), 541511 $10.4B (15%), 518210 $3.4B (5%).

**Buyers (Where, FY2025).** By department: Defense 32.8% ($23.2B), Veterans
Affairs 10.6% ($7.5B), Health and Human Services 9.7% ($6.9B), General
Services Administration 9.6% ($6.8B), Homeland Security 8.3% ($5.9B),
Treasury 4.8%, Justice 3.6%, State 3.0%, Commerce 2.8%, Interior 1.9%,
Agriculture 1.8%, Transportation 1.8% — five departments are seven tenths of
it. The same lens over FY2026 puts Defense at 25.2%, because its last ten
weeks are unpublished. By sub-agency: VA 10.6%, GSA's Federal Acquisition
Service 9.3% (which buys on other agencies' behalf through its schedules and
government-wide contracts), Air Force 8.4%, Army 5.8%, Navy 5.8%, Defense
Information Systems Agency 4.9%, Centers for Medicare and Medicaid 4.5%, IRS
3.5%, State 3.0%, Customs and Border Protection 2.8%, Defense Logistics
Agency 2.3%, NIH 2.3%. By the work named (PSC): DA01 business application
and application development support 28.5% ($20.2B), DA10 8.1%, R499 other
professional support 6.0%, DF01 IT management support 5.8%, 7A21 business
application software 5.5%, R425 engineering and technical support 3.6%, R408
program management 2.5%, DG01 network support 2.4%, DD01 service delivery
support 2.3%, D399 other IT and telecom 2.0%, DJ01 security and compliance
support 1.8%, 7E20 end-user products 1.7%. The PSC families in Enfav's
profile — DA, DB, DF, DG, 7030 — are the top of this mix; application
development support alone is $20B a year.

**Winners (concentration).** The largest recipients in FY2025: General
Dynamics IT 4.4%, Accenture Federal Services 4.1%, Booz Allen Hamilton 3.5%,
SAIC 2.5%, CACI 2.5%, Leidos 2.3%, Deloitte Consulting 2.0%, Peraton 1.5%,
FCN 1.4%, Oracle Health Government Services 1.4%, Peraton Enterprise
Solutions 1.3%, ThunderCat Technology 1.3%. The twelve largest hold 28%
and the 25 the lens lists hold four tenths; the rest is a long tail — the
market is not closed by a handful of primes, but its top is the large
integrators.

**Competition on the awards themselves** (the store: SAM.gov Contract Awards
and USAspending fetched for June–October 2026). Of the 500 most recent 5415
awards from SAM.gov, 453 (90.6%) were open competition, 34 total small
business set-asides, 8 service-disabled veteran-owned, 3 women-owned, 2
8(a). That sample is not the market: more than half of the stored SAM.gov
awards are GSA schedule records, which carry no set-aside and no count of
offers. The source writes 999 on them, a placeholder the adapter reads as
unknown: 466 of the 871 stored SAM.gov awards carried it, 464 of them
Federal Acquisition Service records, and before the adapter read it so the
summary counted them as many offers. Among the 336 with a real count, 154
(46%) drew one offer, 118 (35%) two to four and 64 (19%) five or more; of
the 62 small-business set-asides among them, 11 drew one offer and 35 two to
four.
Measured directly from USAspending for FY2025, the three 5415 codes,
contracts only: small businesses took 46% of the dollars, at least 22% of
the dollars carry a set-aside on the award itself, and 87% were competed.
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
34,900 active contracts; the walk is complete for those ending before
2026-11-09 — 1,291 contracts end between October 13 and 31, 285 more in early
November — and for IDVs through mid-2027 (608 reach their last date to order
in what is left of October). At the Department of Defense the four codes are
complete before 2027-02-24: 1,950 contracts end by then, with $11.1B
obligated on them so far — 254 in what is left of October, 415 in November,
537 in December, 473 in January — and 486 IDVs reach their last date to
order inside the year. 541511 alone at Defense, read whole: 769 contracts
end in the next twelve months ($5.8B obligated on them) — 31, 57, 91, 72,
58, 119, 71, 73, 74, 48, 19, 56 a month from October 2026 — 428 of them
inside six months ($3.7B). Narrowed to the work the capabilities statement
names — 541511 with PSC DA01, application development support — 253
Defense contracts end in the next twelve months ($1.8B obligated on them),
146 inside six ($1.3B); that read is whole in five requests. At Veterans
Affairs, systems design (541512) alone: 286 contracts end within two years,
with $15.3B obligated on them. Each is work a
buyer may buy again. The open-notices column joins a row to the stored
notices in its NAICS code at the same buying sub-agency: candidates for its
recompete, not a confirmed match (at Defense a sub-agency is a whole
military department, so one open Air Force notice shows beside every
expiring Air Force contract in the code — 181 of the 200 rows listed for the
four codes carry one).

**The daily warm**, verified on 2026-10-13 from a fresh store seeded with the
Enfav profile (all eight NAICS, the four manufacturing codes included): one
line per lens, then the horizon and the outlook of Defense, Veterans Affairs
and GSA — the top three buyers over a rolling year — in 179 requests, every
one answered. It found 643 awards ending within 90 days. With the earlier
far-first walk the same warm had found 444, published them and one digest,
"444 spending alerts for Enfav LLC" (bus event 619), and a second warm
raised none of them again; with the notifications service unreachable the
warm logged one warning, published nothing and recorded nothing, so the same
alerts are raised next time. A restart inside the day answered each lens
that had a snapshot from it, without a request. Of the 643, 569 were
contracts and 74 IDVs (70 of those at their last date to order with nothing
obligated); 369 were in the software codes and 274 in the manufacturing
ones — small delivery orders, median $26,000, most at the Defense Logistics
Agency and GSA's Federal Acquisition Service — and those kept the lists
short-sighted: the 200 rows listed across every agency ended by October 14,
at Defense by October 15.

**The profile, narrowed.** Later that day the profile was set in Settings to
the four software codes with `alerts.endingWithinDays` at 30. Read on the
horizons the next warm reads: 559 awards inside the window (511 contracts,
48 IDVs), every one in the software codes, 289 of them already raised under
the earlier settings — about 270 for the next digest, against 740 and about
343 had the window stayed at 90 days. The lists reach farther without the
delivery orders, to October 17 across every agency and October 31 at
Defense, and at Veterans Affairs and GSA the 30-day window is what cuts them
(150 and 69 of 200). The count stays in the hundreds because the market is
dense — 1,291 contracts in the four codes end in the rest of October alone,
with $4.7B obligated on them — so read a digest by its ten lines, the awards
with the most obligated first, and the months ahead on the Horizon tab. The
stored leads followed the profile at once: the seven manufacturing notices
fell to the low tier and the eight software notices lead. Left as they were:
the four manufacturing saved searches still in the daily pull, and the PSC
families and interests that name parts and repair.

**What the data says for a new software and AI-services business.**

1. Opportunity is ample and growing: $70.8B in the four codes in FY2025,
   the last whole year, with FY2026 running ahead of it; $20B a year is the
   application-development support work the capabilities statement
   describes.
2. The buyers are concentrated: Defense (Air Force, Army, Navy, DISA),
   Veterans Affairs, GSA's Federal Acquisition Service, Homeland Security
   (Customs and Border Protection) and Health and Human Services (CMS, NIH)
   are seven tenths of it.
3. Interest in services like Enfav's is not in doubt: the PSC mix is
   application development, IT management and network support services at
   scale.
4. Winning as a prime is hard for a firm with no contract vehicle: in FY2025
   90% of the three codes' contract dollars were orders under one, and the
   top of the market is the large integrators. It is not closed to small
   firms, which took 46% of those dollars, and nearly half of the stored
   awards with a real offer count drew a single offer. The realistic entry
   is as a subcontractor to those primes on the recompetes the Horizon lists,
   and on the small set-aside and sources-sought notices the store shows
   (four of the nine open software notices are sources sought — the moment
   to be known).
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

| Constant                                                    | Value              | Where it binds                                                              |
| ----------------------------------------------------------- | ------------------ | --------------------------------------------------------------------------- |
| `MAX_SCOPE_CODES`                                           | 20                 | codes of each kind in one scope                                             |
| `DEFAULT_PULSE_LOOKBACK_YEARS` / `MAX_PULSE_LOOKBACK_YEARS` | 3 / 5              | prior years the pulse shows and projects from                               |
| `MAX_BREAKDOWN_ROWS`                                        | 25                 | rows one breakdown answers (`truncated` says when more exist)               |
| `ACQUISITION_THRESHOLDS`                                    | $15K, $350K, $900K | the lines the award-size bands are cut at, as raised 2025-10-01             |
| `MAX_VIEW_NAME_LENGTH` / `MAX_VIEW_HREF_LENGTH`             | 120 / 2000         | a saved view's name and address                                             |
| `MAX_SUBAWARD_PAGES` × `SUBAWARD_PAGE_SIZE`                 | 30 × 100           | subcontract rows one primes ranking reads, most recent first                |
| `PRIMES_LISTED` / `SUBCONTRACTORS_LISTED`                   | 50 / 10            | primes one ranking lists; firms listed for one prime, and for one award     |
| `PRIME_OBLIGATION_ROWS`                                     | 100                | recipients read to say what each ranked prime itself holds                  |
| `HORIZON_MONTH_CHOICES`                                     | 6, 12, 24          | the months the page offers (`MAX_HORIZON_MONTHS` 36 on the wire)            |
| `HORIZON_LOOKBACK_YEARS`                                    | 5                  | the action-date window a horizon walk covers                                |
| `MAX_HORIZON_PAGES` × `HORIZON_PAGE_SIZE`                   | 30 × 100           | pages per family (finding today's place and reading forward), rows per page |
| `HORIZON_MAX_DEPTH_AWARDS`                                  | 50,000             | the depth USAspending pages its award search to                             |
| `MAX_HORIZON_ROWS`                                          | 200                | soonest-ending rows one answer lists                                        |
| `MAX_RECOMPETE_NOTICES`                                     | 500                | open notices one horizon read joins                                         |
| `MAX_AGENCY_OFFICES`                                        | 50                 | sub-agencies one outlook answers                                            |
| `ALERT_PROMPT_MAX_ITEMS` / `ALERT_PROMPT_TTL_DAYS`          | 10 / 7             | lines one digest lists; days until it expires                               |
| `MAX_ALERT_ENDING_DAYS`                                     | 366                | the farthest `alerts.endingWithinDays` may look                             |
| `WARM_TOP_AGENCIES`                                         | 3                  | agency outlooks one warm reads                                              |
| `SAM_GOV_CACHE_TTL_HOURS`                                   | 24                 | the snapshot window                                                         |
| `GOVCON_PULL_DEADLINE_SECONDS`                              | 120                | the wall clock on one horizon walk                                          |

## USAspending facts the design rests on

Probed live on 2026-10-12 and 2026-10-13; free, no key.

- `spending_over_time` reports by **fiscal** period (`month` 1 is October) and a window across October 1 spills into the next fiscal year.
- The `agencies` filter is by **name**; the service resolves a toptier code through `references/toptier_agencies`, whose `agency_id` is the `id` a category breakdown answers with.
- `spending_by_award` requires the `sort` field among the requested `fields`; IDVs end at `Last Date to Order`, contracts at `End Date`; `time_period` filters the action date only, never the period of performance.
- Any `spending_by_award` request carrying the keyset cursor (`last_record_unique_id`, `last_record_sort_value`) answers an empty-body 503 every time. Numbered pages answer down to the 50,000th award — page 500 at a hundred a page; deeper is a 422 naming the "maximum result limit 50000" — and `page_metadata.hasNext` is false from page 100 on while later pages still answer full, so a full page, not that flag, says more follow.
- `psc_codes` as a flat list matches by prefix at any length (`["DA"]` is the family, `["DA01"]` the code, `["7"]` every product code beginning with 7); `{ "require": [...] }` wants a path through the PSC tree per entry (`["Service", "D", "DA", "DA01"]`) and answers 422 to a bare code. `naics_codes.require` takes families of 2, 4 or 6 digits and answers 400 to any other length.
- `budgetary_resources` periods are sparse — a year just begun is empty, older years quarterly — and are shown as reported; `sub_agency` refuses a `fiscal_year` outside its submissions (the new fiscal year, for weeks after October 1), while `references/toptier_agencies` reports each agency's `active_fy`.
- The source sits behind a firewall with no published limit. Measured 2026-10-13: about 700 requests in fourteen minutes — four renewing warms back to back, the last two within two minutes — and it answered 500 with a "Web Page Blocked!" page, then refused connections from this address; one warm of about 190 requests in a minute had passed three times before that. One warm a day and ordinary browsing stay well under it; a burst does not.
- `awards/last_updated` is `MM/DD/YYYY`; agency financials are revealed about five to six weeks after the period.
- Department of Defense awards appear 90 days after signing. Measured 2026-10-13 against data as of 2026-10-12: Defense reported $43.3B for June 2026, $12.2B for July and $0.02B for August. The Army Corps of Engineers awards under Defense's code; as an awarding agency of its own (`096`) it reports no contract obligations. The adapter declares the lag as data (`USASPENDING_PUBLICATION_LAGS`), and the lenses derive everything else from it.
- `spending_by_award` answers null for an award's end date with options, under every name tried; `awards/{id}` returns it as `period_of_performance.potential_end_date`.
- Subcontracts are the same search with `subawards: true`. Measured 2026-10-13 on the count: every filter then narrows by a fact about the prime award — its type, set-aside, winner's size, codes and agency — except `award_amounts`, which bounds the subcontract's own amount, and `recipient_search_text`, which matches the subcontractor; `date_type: new_awards_only` answers a 500. A row carries the prime's UEI, the subcontractor's UEI, the prime award's id and the prime award's PSC. `spending_by_category/recipient` in that mode ranks subcontractors, so primes are ranked here from the rows.
- `recipient_search_text` given a UEI selects that firm's awards on the count, the series, the category and the award search alike; several UEIs select their union.
- `awards/{id}` answers one award: `parent_award` (the vehicle), `base_and_all_options`, `period_of_performance.potential_end_date`, `latest_transaction_contract_data` (offers, set-aside, competition, pricing), `subaward_count`. It carries the same 999 offers placeholder SAM.gov does, as text, on the same schedule records. A firm with no owner is named as its own parent. `subawards` with an `award_id` lists that award's subcontracts. A vehicle's own `total_obligation` is zero; `idvs/amounts/{id}` answers what was ordered under it: `child_award_count` and `child_award_total_obligation` for its own orders, `grandchild_*` for orders placed through the `child_idv_count` vehicles awarded under it, and `multiple_or_single_award_description` on the record says whether one firm or several hold it.
- `spending_by_award_count` answers one count per award kind (`results.contracts`, `results.idvs`) for the same filters every search takes.
- The facet filters, measured on the count, the series and the category endpoints: `recipient_type_names: ["small_business"]` or `["other_than_small_business"]`; `set_aside_type_codes` with `NONE` for no set-aside; `award_amounts: [{ lower_bound, upper_bound }]`, inclusive at both ends, so two bands that share an edge count an award on it twice; `time_period[].date_type: "new_awards_only"`; and among `award_type_codes`, `B` (purchase order) and `D` (definitive contract) stand alone while `A` (BPA call) and `C` (delivery or task order) are placed under a vehicle.

## Reviewing a build live

Start the stack (`pnpm stack:db`, `pnpm db:migrate`, `pnpm govcon:start`)
and watch the service log for the warm's lines. Open `/spending`: the chips
are pressed, the pulse reads once and says it was served from the snapshot
the warm took. Press chips off and watch the address and the one re-read
once the presses pause; type a family and see exactly one request after the
pause. Visit Where, change what it ranks by and its window, and note the top
agencies; on Agency, pick one — the scope narrows, every lens re-reads, the
outlook opens — and pick it again to clear. On Horizon, change the months,
open an "Open notices" disclosure and follow a link to the notice, then go
Back. Hover a column and Tab into a chart. Copy the address into a new tab
and reload: the same view. Then read the ledger by operation, and, with the
notifications service up, the digest on Telegram.

This build was walked that way on 2026-10-13 in a visible Chrome window
driven by Playwright, on the software codes above: nineteen checks, all
passing, the console clean. The walk is what found that a PSC in the scope
answered 502, that two identical reads at once each walked the source, that
every chip press started a walk of an in-between scope, and that the tooltip
left the viewport in a narrow window; reading the live digest found a
buyer's name split at its own dots ("U.S. Marshals Service" shown by its
second half), and reading the service log found a warm started on a service
that was told to stop while still booting. Each was fixed and checked again
on the running stack.
