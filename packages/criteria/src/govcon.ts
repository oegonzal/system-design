import type { Criterion } from './criterion';

/**
 * Government contracting: the SAM.gov service (packages/govcon) and its web
 * client (packages/govcon-ui).
 */
export const GOVCON_CRITERIA: readonly Criterion[] = [
  // Govcon web client (packages/govcon-ui)
  {
    id: 'GOVU-1',
    statement:
      'The client lists the profiles and the source status from the service, and a pull with a window shows the slice report and the budget it left.',
  },
  {
    id: 'GOVU-2',
    statement:
      'The client lists leads over the score, tier and limit filters; a selected notice opens at /notices/<id> and shows its factor trace.',
  },
  {
    id: 'GOVU-3',
    statement:
      'A notice description is fetched on demand from the detail view and its outcome shown — the text, or that the budget is spent, or the failure.',
  },
  {
    id: 'GOVU-4',
    statement:
      'The client shows the source ledger newest first: every call, its operation, outcome and size.',
  },
  {
    id: 'GOVU-5',
    statement:
      'The govcon client is nine routes under one shell: the nav is one data table the bar, the titles and the announcer all read, the current route is marked, every client-side navigation is announced, and the active profile is one choice in the header that every page scores against.',
  },
  {
    id: 'GOVU-6',
    statement:
      'The search page ranks the store over its filters without spending, and runs, saves, edits, orders and toggles saved searches into the daily pull — every SAM.gov request behind a click that states its cost.',
  },
  {
    id: 'GOVU-7',
    statement:
      'The pipeline page lists tracked notices by stage with what is due, and a stage, reminder, note or estimate edited inline is written to the service and read back.',
  },
  {
    id: 'GOVU-8',
    statement:
      "The notice page shows the facts, the place of performance and contacts, the attachments as public links, the score trace, the description on demand, the awards of its solicitation and NAICS, the awardee's registration, and the bid panel that puts it in the pipeline.",
  },
  {
    id: 'GOVU-9',
    statement:
      'The intel page fetches awards from the sources the user chose, stating the cost, lists and summarizes what is stored, and looks registrants up by UEI with their exclusion flag.',
  },
  {
    id: 'GOVU-10',
    statement:
      'The settings page edits a profile as data — codes, interests, weights with their live sum, prices, bands, tiers and the alert policy (the days an expiring award is flagged within, whose ending awards are raised, the least obligated on one found in the scope, whether a pulse above its band alerts, and the tier a stored notice is raised from, or none) — creates, copies, defaults and removes profiles, shows the service issues per field, and shows the sources and the full ledger.',
  },
  {
    id: 'GOVU-11',
    statement:
      'The spending page scopes its free lenses over one scope bar — among them fiscal periods with a seasonal projection, a ranked breakdown over a fiscal window, awards expiring by month, and an agency’s budget by fiscal year with its sub-agencies — every chart carries a data-table alternative, and every panel states its provenance and the source’s disclosures verbatim.',
  },
  {
    id: 'GOVU-12',
    statement:
      'A spending view is its address: a link without a scope opens on the active profile’s NAICS, and the scope, the tab and each lens’s settings travel in the URL, so a reload, a shared link and a return by Back all open the same view; codes, typed or pressed, settle before they are written as one change; a directory pick narrows the scope to that agency; every column chart answers hover and focus with one tooltip naming every series at that x; and an expiring award says which open notices already exist for its NAICS and buyer, each a link to the notice.',
  },
  {
    id: 'GOVU-13',
    statement:
      'The pulse draws a period the source has not wholly published as provisional and says which agencies publish late, by how many days and through which day the amounts are whole; the change against the prior year is taken over the periods both years have settled; and a breakdown whose window reaches past that day says its total and rows are short.',
  },
  {
    id: 'GOVU-14',
    statement:
      'The scope bar narrows a scope by the declared facets behind one fold that says how many are set and is open when a link arrives with some: each facet’s control follows its declared kind, a code or a range the table does not offer is shown pressed beside the ones it does, one press applies the lanes the profile may bid, a placement fixes the family as contracts, the facets travel in the address in their one spelling, and the scope’s largest PSC and NAICS codes are offered with their dollars only once asked for.',
  },
  {
    id: 'GOVU-15',
    statement:
      'The Reach tab counts a scope’s new contracts over the page’s window for the profile’s lanes, cut by cut — each cut its count, its share of the first, its dollars and a link that ranks who won it under the cut’s own facets — then the last cut by award size against the acquisition thresholds, naming the lanes counted and saying when the window reaches past what is published.',
  },
  {
    id: 'GOVU-16',
    statement:
      'A page’s views are kept by name per profile: each is a link to its address with the one that is this page marked current, a save keeps the page as it stands with its codes spelled out so it opens the same whatever the profile comes to name, saving under a kept name updates it, and a removal is one click.',
  },
  {
    id: 'GOVU-17',
    statement:
      'The Primes tab ranks the scope’s primes by the subcontracts they reported within the profile’s size of subcontract over the page’s window: it says how many the source holds, how many were read and how far back, how many repeated, and when older ones were left unread; each prime shows its subcontracts, its different firms, its dollars, its share under service codes and what it holds itself, links to its own page when the source gave it a UEI, and lists the firms it reported most, each a link to the primes that hire that firm.',
  },
  {
    id: 'GOVU-18',
    statement:
      'An award opens at /awards/<id> from every table that lists one by the id its record is read by: who holds it and who owns the holder, the buyer, the vehicle it sits under as a link, what is obligated against what it can reach, its end beside its end with every option — saying when options remain — how it was competed with uncounted offers said so, the largest subcontracts reported under it, and the open stored notices from the same buyer and code; an id the source does not have is a dead end with a way back.',
  },
  {
    id: 'GOVU-19',
    statement:
      'A firm opens at /primes/<uei> from every table that names one with a UEI: its registration as stored, with a lookup that states its cost, and the spending lenses narrowed to it in the profile’s codes — the awards it holds that are ending, who buys from it, the firms it reported hiring and the primes that reported hiring it — each read only once its tab is opened; a value that is not a UEI is a dead end that reads nothing.',
  },
  {
    id: 'GOVU-20',
    statement:
      'A firm or an award is tracked from its own page — one read of the store to say whether it is, one write to track it under the name the page gives it, from its kind’s own stages — and every tracked firm and award is listed under the pipeline’s second view, which the address names: counted by kind and stage, narrowed to one kind, its stage changed in the row, the whole of it — stage, contact, reminder and notes — opened under the row in the panel its page uses, and removed from there.',
  },
  {
    id: 'GOVU-21',
    statement:
      'The dashboard lists what the daily warm and the daily pull raised, newest first and a page at a time: each alert as the line a person was sent, with its kind and the day it was raised, and links to the award or notice it names; an alert kept without what was published is named by its key. It is where a digest’s "and more" lands, and reading it asks no source anything.',
  },
  {
    id: 'GOVU-22',
    statement:
      'The store search offers every notice type as a chip, any of them pressed together and a run of presses read as one change, and one preset presses the two a buyer posts before it solicits — sources sought and presolicitations — and lets them go again.',
  },
  {
    id: 'GOVU-23',
    statement:
      'The search page and the intel page are their addresses, as the spending page is: the side in front, the filters and the page travel in the URL and are read against their vocabularies, so a ranking or a reading reloads, links, and is kept by name as a saved view listed on its own page; typed text reaches the address once it pauses.',
  },
  {
    id: 'GOVU-24',
    statement:
      'A notice’s page says who may hold the work it is about, and only when asked, since the read goes to the award source: the awards in its code at its own sub-agency ending in the coming months, soonest first, each a link to its own record and its holder a link to the firm’s page, narrowed to the notice’s product service code unless unticked — which asks again — with how many the scope listed, how far the list is complete, and the fact the notice lacks when nothing could be read.',
  },
  // Government contracting: SAM.gov opportunities (packages/govcon)
  {
    id: 'GOV-1',
    statement:
      'Every SAM.gov record is schema-validated and normalized before it is stored — unknown fields tolerated, known fields typed, dates read in every spelling the provider uses; a record that cannot become a lead is counted and reported, never persisted.',
  },
  {
    id: 'GOV-2',
    statement:
      'A query already pulled inside the cache window is answered from the call log and spends no upstream request; a log that cannot answer degrades to the call with a warning.',
  },
  {
    id: 'GOV-3',
    statement:
      'Upstream calls stop at the declared daily budget over a rolling day and the pull report names every slice it skipped; every attempt counts, and a rate-limited reply is recorded and never retried.',
  },
  {
    id: 'GOV-4',
    statement:
      "A lead's score is a traced weighted sum of declared factors whose points sum to the score; an ineligible set-aside, an excluded notice type, a passed deadline or an inactive notice is a gate, never a weight; ranking is deterministic.",
  },
  {
    id: 'GOV-5',
    statement:
      'The search profile is validated data: factor weights name exactly the factor table and sum to one, codes, bands and tiers are checked when it loads, so a malformed profile fails at boot before any request.',
  },
  {
    id: 'GOV-6',
    statement:
      'Re-pulling upserts by notice id: no duplicate rows, last_seen_at advances, changed fields update, first_seen_at holds, and duplicates within one batch are tolerated.',
  },
  {
    id: 'GOV-8',
    statement:
      'The govcon service is one Nest context two ways: the CLI and an HTTP surface whose every route answers its contract type — 400 with named issues on a bad body or query, 404 on an unknown notice or profile — and a pull answers synchronously with its report.',
  },
  {
    id: 'GOV-9',
    statement:
      'A notice description is fetched at most once: a stored text answers without a request, a fetch is budgeted and recorded as a description call that never reads as a fresh search, the text carries no markup, and a re-pull keeps it.',
  },
  {
    id: 'GOV-7',
    statement:
      'The SAM.gov key is read only by the environment factory; the request URL carries it and nothing else does — not a stored query, a query key, a warning or an error message.',
  },
  {
    id: 'GOV-10',
    statement:
      'Every HTTP attempt against an upstream is one ledger row numbered under its call: a retried server error is two rows, a rate limit or a timeout is one and never retried, and a call that made no attempt leaves none.',
  },
  {
    id: 'GOV-11',
    statement:
      'Every upstream capability spends through the one request gate: SAM.gov operations share one daily bucket per source id, an unbudgeted source is ledgered but never refused, and no adapter reaches the network except through it.',
  },
  {
    id: 'GOV-15',
    statement:
      "A ranking loads only what a gate would not exclude — active, open, a biddable set-aside or none, no excluded type — plus the request's filters, a notice among any of the types it names, in SQL, bounded by MAX_CANDIDATES with the report saying when the bound cut; leads are ranked deterministically and paged.",
  },
  {
    id: 'GOV-12',
    statement:
      'A bid is one row per stored notice, keyed by it and gone with it: the stage comes from the package vocabulary, an unknown notice is refused before any write, omitted fields keep their value, the stage timestamp moves only with the stage, and the pipeline lists tracked notices scored with their counts and what is due soon.',
  },
  {
    id: 'GOV-13',
    statement:
      'Profiles and saved searches are validated data in the store: every write passes the boot schema (400 with issues per path, nothing written), exactly one profile is the default while any exists, and the shipped profile seeds an empty store once.',
  },
  {
    id: 'GOV-14',
    statement:
      "A pull is exactly the profile's saved searches flagged for it, in pull order, each stamped when run; a saved search or a bare filter runs by itself as a pull of one slice and stores what normalized.",
  },
  {
    id: 'GOV-16',
    statement:
      "A notice's attachments are listed from the stored record with their public SAM.gov links, in order; the client links to them directly — no key is ever appended, nothing is proxied, and nothing is spent.",
  },
  {
    id: 'GOV-17',
    statement:
      "Awards from SAM.gov's Contract Awards API and from USAspending are normalized to one shape — a count of offers the provider writes as its not-counted placeholder read as unknown — fetched one gated page at a time up to a bound, upserted by source and id, listed and summarized deterministically from the store, and read by the scorer's history factor and by a notice's own solicitation.",
  },
  {
    id: 'GOV-18',
    statement:
      "Registrants are looked up from SAM.gov's Entity Management in batches of at most MAX_UEI_BATCH UEIs, one gated request each, stored by UEI with their registration, claims and exclusion flag (no separate exclusions request is spent); a read answers from the store and the profile's own company is its entityUei.",
  },
  {
    id: 'GOV-19',
    statement:
      'A pull ends at its wall-clock deadline: no slice starts after it, every slice not started is reported as skipped by the deadline, and what was stored before it stays.',
  },
  {
    id: 'GOV-20',
    statement:
      'Every spending lens spends through the one request gate as its own ledger operation, answers from the snapshot table inside the cache window without a request, never loads one query twice at once, validates a stored payload before trusting it, serves a stale snapshot only when a refresh failed and says so, and carries its provenance — fetched when, as of, served from where, how many attempts, which provider facts.',
  },
  {
    id: 'GOV-22',
    statement:
      'The spending warm runs on a cadence declared in the environment (GOVCON_SPENDING_WARM_HOURS; 0 never) and is started only by serve once it listens — never by a lifecycle hook, so the CLI and the HTTP suite never warm, and never once its module is destroyed. The run at start brings every lens up to date within the cache window, so a restart inside it spends no request, and every scheduled run renews: the default profile’s NAICS through the controller’s own query schemas, then the horizon and the outlook of each top agency the breakdown names through the directory’s own id — every lens’s outcome logged, a refusal included, every page ledgered like any read.',
  },
  {
    id: 'GOV-24',
    statement:
      'Alert rules are declared on the profile and are pure arithmetic over what a run read. Whoever finds alerts hands them to one raiser: each is raised once per kind and subject through the ledger, published on its declared topic the weightiest first, listed in one digest prompt per run named by its finder, recorded only once published, and an unreachable bus or ledger is one warning, never a throw.',
  },
  {
    id: 'GOV-23',
    statement:
      'An expiring award is joined at read time to the open stored notices sharing its exact NAICS code and its agency sub-tier segment — never a name, never a prefix — bounded by MAX_RECOMPETE_NOTICES with the answer saying when that cut; the join is computed on every read, a snapshot read included, and never stored.',
  },
  {
    id: 'GOV-25',
    statement:
      'A fiscal period that ends after the last day the source has wholly published for a scope — its data-as-of date less the longest lag the adapter declares for an agency the scope counts — is marked unpublished: it is projected and never counted in the run rate’s base, a prior year holding one is no year a mean rests on, and a breakdown whose window reaches past that day carries the delay, as the pulse of such a scope always does.',
  },
  {
    id: 'GOV-26',
    statement:
      'A spending scope’s facets — the firms an award went to, the winner’s size, how the award was placed, its set-aside lanes, its dollar range, new awards only — are declared data: one table gives each its one spelling as a parameter, the request schema refuses a value outside it, every award search maps each facet through one table to the source’s filters, a placement makes the scope one of contracts whatever family was asked, and a snapshot is keyed by the scope’s one spelling at every depth.',
  },
  {
    id: 'GOV-27',
    statement:
      'The reach count cuts a scope’s new contracts down step by step — made in the lanes named, placed as contracts of their own, won by a small business — one count and one total a cut and the last cut by award size, each read through the gate as its own operation; narrowing only ever takes away, so a cut the scope’s own facets rule out is answered as nothing without a request.',
  },
  {
    id: 'GOV-28',
    statement:
      'A saved view is an address inside the client that a profile keeps by name: an address that is not a path beginning with one slash is refused, saving under a name already kept replaces its address on the same row, views are listed by name and gone with their profile, and an unknown profile or view is a 404.',
  },
  {
    id: 'GOV-29',
    statement:
      'The primes ranking reads a scope’s reported subcontracts within the profile’s size of subcontract, most recent first: one count, then pages up to MAX_SUBAWARD_PAGES inside the wall-clock deadline, each through the gate as its own operation. The same prime award, subcontractor and amount is counted once; a prime is its UEI, and its name only where the source gave none; and the answer says how many rows it read, how many repeated, how far back they reached and whether the source holds more. A facet a subcontract search cannot honour is unset in the scope answered, a scope narrowed to one firm ranks the primes that reported paying it, and rows the source cut short are answered and not kept.',
  },
  {
    id: 'GOV-30',
    statement:
      'One award is read by the source’s own id through the gate: its holder and parent, buyer, vehicle, obligations against what it can reach, its end and its end with every option, how it was competed — a not-counted offers placeholder read as unknown in every source that relays it — what was ordered under it when it is itself a vehicle, its own orders and those placed through the vehicles awarded under it as one count and one total, and the largest subcontracts reported under it, joined on every read to the open stored notices sharing its NAICS and buyer. An id the source does not have is a 404; an award that is no vehicle and has no subcontracts reported costs one request.',
  },
  {
    id: 'GOV-31',
    statement:
      'A target is a firm or an award the company pursues, one row per kind and subject — a firm by its UEI, an award by the id its record is read by — each kind with its own stages ending in the one that closes a pursuit. A save refuses a stage that is not the kind’s own before anything is written, keeps the fields it leaves out, and moves the stage’s day only with the stage; whether something is tracked answers nothing when it is not; the list is newest change first and the summary counts every stage of every kind and what is due soon by its reminder.',
  },
  {
    id: 'GOV-32',
    statement:
      'The daily warm reads every tracked award still being pursued — a bounded number, the never-read first and then the soonest to end — each through the award lens, and rules on its own record: that it ends inside the profile’s window whatever is obligated on it, that its end is no longer the one last read, and each open stored notice sharing its NAICS and buyer, each raised once per key on its declared topic. An end read is written back to the target only once the alert that says it moved is on the ledger, so one the bus refused is found again.',
  },
  {
    id: 'GOV-33',
    statement:
      'The profile’s alert policy says whose ending awards are raised — the scope’s and the tracked ones, or the tracked ones alone — and the least obligated on a scope’s award for it to be raised; a stored profile from before either reads as the declared default. Every alert is ledgered with what was published and read back newest first at /alerts as the alert it was, a page at a time; a payload its kind’s schema refuses, or a row from before payloads were kept, reads as its key alone.',
  },
  {
    id: 'GOV-34',
    statement:
      'Who may hold the work a stored notice is about is read through the horizon lens: the awards in the notice’s NAICS code — and its product service code, unless asked not to — ending inside INCUMBENT_HORIZON_MONTHS, kept to the notice’s own sub-agency by the join the horizon uses, with how many the scope listed and how far the list is complete. The buyer’s department narrows the read only when the source lists that code; a notice lacking a NAICS code, or a buyer named down to its sub-agency, answers that gap and asks no source anything; a notice the store does not hold is a 404.',
  },
  {
    id: 'GOV-35',
    statement:
      'The daily pull runs on a cadence declared in the environment (GOVCON_PULL_HOURS; 0 never), started only by serve on the lifecycle the warm has: the default profile’s pull as it is asked for by hand, through the gate, so the budget bounds it and a search already pulled inside the cache window answers cached — a restart inside the day spends no request. A store with no default profile is skipped, a source that is disabled is never asked, and a pull that cannot run is one logged line.',
  },
  {
    id: 'GOV-36',
    statement:
      'After each scheduled pull the lead rule runs over the store: every stored notice the profile ranks in the tier its alert policy names, or a better one, is one alert keyed by its notice, carrying the score and tier it was raised at, raised once through the ledger and listed in a digest of its own. The rule reads the store and not the pull, so a lead a refused bus kept back is raised by the next run; a policy with no tier raises none, and a stored profile from before the tier reads as the declared default.',
  },
  {
    id: 'GOV-21',
    statement:
      'Spending arithmetic is pure and declared: fiscal periods start in October, a series is aligned on the periods asked for with the partial month marked, the projection is the declared seasonal mean of prior years scaled by the year-to-date ratio only after the declared base, the horizon walk pages the source by number, finds the page where end dates cross today by doubling and halving, reads forward from the soonest-ending award inside a page bound and the wall-clock deadline, and says how far the window is complete, and agency periods are aligned on those present, the year asked for an agency’s offices defaulting to the one the source’s own directory reports active.',
  },
];
