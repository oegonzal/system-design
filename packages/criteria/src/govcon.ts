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
      'The govcon client is seven routes under one shell: the nav is one data table the bar, the titles and the announcer all read, the current route is marked, every client-side navigation is announced, and the active profile is one choice in the header that every page scores against.',
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
      'The settings page edits a profile as data — codes, interests, weights with their live sum, prices, bands, tiers and the alert thresholds (the days an expiring award is flagged within, and whether a pulse above its band alerts) — creates, copies, defaults and removes profiles, shows the service issues per field, and shows the sources and the full ledger.',
  },
  {
    id: 'GOVU-11',
    statement:
      'The spending page scopes four free lenses over one scope bar — fiscal periods with a seasonal projection, a ranked breakdown over a fiscal window, awards expiring by month, and an agency’s budget by fiscal year with its sub-agencies — every chart carries a data-table alternative, and every panel states its provenance and the source’s disclosures verbatim.',
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
      "A ranking loads only what a gate would not exclude — active, open, a biddable set-aside or none, no excluded type — plus the request's filters, in SQL, bounded by MAX_CANDIDATES with the report saying when the bound cut; leads are ranked deterministically and paged.",
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
      'Alert rules are declared on the profile and run after a warm as pure arithmetic over what it read: each alert is raised once per kind, scope and subject through the ledger, published on its declared topic, listed in one digest prompt per warm put to a person, recorded only once published, and an unreachable bus or ledger is one warning, never a throw.',
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
      'A spending scope’s facets — the winner’s size, how the award was placed, its set-aside lanes, its dollar range, new awards only — are declared data: one table gives each its one spelling as a parameter, the request schema refuses a value outside it, every award search maps each facet through one table to the source’s filters, a placement makes the scope one of contracts whatever family was asked, and a snapshot is keyed by the scope’s one spelling at every depth.',
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
    id: 'GOV-21',
    statement:
      'Spending arithmetic is pure and declared: fiscal periods start in October, a series is aligned on the periods asked for with the partial month marked, the projection is the declared seasonal mean of prior years scaled by the year-to-date ratio only after the declared base, the horizon walk pages the source by number, finds the page where end dates cross today by doubling and halving, reads forward from the soonest-ending award inside a page bound and the wall-clock deadline, and says how far the window is complete, and agency periods are aligned on those present, the year asked for an agency’s offices defaulting to the one the source’s own directory reports active.',
  },
];
