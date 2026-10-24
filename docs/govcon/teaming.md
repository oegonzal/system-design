# Teaming: finding primes to subcontract under, step by step

The Path B checklist — find awarded federal software contracts, identify the
primes performing them, confirm each has a subcontracting program, find its
supplier portal and small-business liaison, send one targeted note, track and
follow up — as the govcon tool now carries it. Everything a step reads is
declared data: a code, a record's field, a profile's row, a target's list.
Nothing matches a company name or reads a description to decide.

## 1. Find the awarded contracts

The Spending page over the profile's NAICS, narrowed by **Won by: other than
small** so every row is a large prime. The window preset **This and prior
fiscal year** reads the fiscal year that just closed and the one under way as
one scope; the other presets stay. Saved views keep the scopes by name: the
Primes tab over the three software codes, the Where tab ranked by recipient,
and the Horizon of DA01 awards ending within 24 months.

Keywords are not a filter and will not be: measured 2026-10-23, the keyword
"application modernization" matched 2 of 16,507 contracts in the scope, while
the codes found the work. PSC DA01 alone held 6,794 of them.

## 2. Read the award

`/awards/<id>` says who holds it and who owns the holder, the buyer down to
the office, the vehicle it sits under, what is obligated against what the
award can reach (the ceiling is not funding), when it ends with and without
options, how it was bought, and — from the latest action — **whether it
carries a small-business subcontracting plan**, as FAR 19.7 codes it and the
source words it. The largest subcontracts reported under it follow. An award
with a plan and reported subcontracts is a program that buys work of this
size; one with `Plan not required` or none stated is not.

## 3. Shortlist the primes

The Primes tab ranks the scope's primes by the subcontracts they reported
inside the profile's teaming band ($50K–$2M unless Settings says otherwise).
Its last column, **Tracking**, says which are tracked as firms already and
tracks one in a click, at the first stage of a firm's pursuit. A firm's page
adds its SAM.gov registration — with its own website once it is looked up —
the awards it holds that are ending, who buys from it, and whom it hires.

A capped read says so in its tiles and counts are then floors. The first
shortlist (2026-10-23, `teaming-shortlist-2026-10.md`) was built from a
complete walk of the scope's 6,057 subcontract rows and the rule: at least
two awards ending three to twenty-four months out under DA01 or D3xx with a
plan coded C–H and subcontracts reported.

## 4. Contacts and the supplier portal

Finding the portal and the liaison is the person's step: the prime's website,
its Suppliers / Small Business / Doing Business With Us page, its portal, then
the Small Business Liaison Officer or a capture or program manager. The firm
target keeps what was found: **contacts** in declared roles (small business
liaison, supplier manager, program manager, capture manager, other), **links**
of declared kinds (website, supplier portal, small-business page, directory,
other), an **activity log** of what was done and when (registered, emailed,
called, met, they replied), a **next action** and a reminder. Public
directories are listed in the shortlist report for reading by hand; none is
integrated, since they move and the award record already states the plan.

## 5. The note

On a tracked award's page, **Draft an introduction** hands the quality loop
one goal composed from declared data: the reader (the firm target's first
contact in their role, or the firm's small-business liaison team), the award
as its record states it (contract number, buyer, type and vehicle, dates with
options, funded against ceiling, the plan, the subcontracts reported, the
description), the company's own words from **Settings → Introductions** (the
company in a line, how it delivers, its offers as rows under stable slugs),
and the one ask. The `introduction-note` pipeline writes the note under four
fixed rules — fidelity, relevance, restraint, clarity — with one claims critic
and one evaluator; a note that names another program or makes an offer the
profile never listed is refused by its validator before any judge reads it.
Two iterations at most. The page polls the run, shows the note with the
judges' decision and score beside it, copies it, and the service logs it on
the target as a `drafted` activity pointing at the run; the person sends it
and logs `emailed` themselves. The loop is the one named by
`QUALITY_LOOP_URL` (default `http://localhost:3003`); a loop that is down fails
the draft with 503 and nothing else.

## 6. Track and follow up

The pipeline's **Firms and awards** view lists every target with its stage,
first contact, next action and latest activity, edits the whole of it under
its row, and downloads the tracker as a CSV whose columns the contract
declares. The dashboard's **Due this week** shows a due target's next action.
After an outreach — a registration, an email, a call — with no reply logged
for `alerts.followUpAfterBusinessDays` business days (default 5; weekdays,
UTC, no holidays; `0` turns it off), the daily warm raises **one** quiet-target
alert for that outreach, in the tracker's own digest, unless a reminder was
set after it; logging the follow-up re-arms it once. One concise follow-up,
then move on.

## What the first live pass measured (2026-10-23/24)

| Fact                                                                                  | Value                                                                        |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Contracts, NAICS 541511/541512/541519, FY2026–FY2027 to date, other-than-small primes | 16,507                                                                       |
| Subcontracts reported under them, walked completely                                   | 6,057 rows, 5,952 distinct, 117 primes                                       |
| Primes passing the shortlist rule                                                     | 10 of 20 groups read (14 passed; the ten with the most in-band subcontracts) |
| Plan codes on the 40 largest DA01 awards by large primes                              | F 34, B 2, G 1, C 1, none 2                                                  |
| A SAM.gov registration's `entityURL` on a large prime                                 | present                                                                      |

The Primes lens once read 200 of 4,763 in-band rows: the source answered one
page in 28 seconds and the next not within the adapter's 30, so the read
stopped and said so; a minute later the same pages answered in seconds, sorted
by date or by amount alike. A slow spell at the source, not the order asked.
