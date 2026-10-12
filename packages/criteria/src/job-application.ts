import type { Criterion } from './criterion';

/** The job-application service (packages/job-application): the record of units a session applied to, and the advisor over it. */
export const JOB_APPLICATION_CRITERIA: readonly Criterion[] = [
  {
    id: 'JA-1',
    statement:
      'The stance the record takes on an application is read from declared data alone — a total map from every status to a stance or none, a window in days, a list of values that identify no single employer, a count of set-asides after which a company is avoided, and an in-progress unit past its session’s declared lifetime standing as abandoned — never from a rule over a name.',
  },
  {
    id: 'JA-2',
    statement:
      'The advisor describes itself by its id and the one declared fact it keeps its record by, and answers a subject’s record as one unit per identity under the contracts’ key — the strongest stance among the applications, the latest date and the count in the note, the forbidden first — bounded by the contracts’ advice bound with the rest counted, and refuses an asker that does not compare on the fact it keeps.',
  },
  {
    id: 'JA-3',
    statement:
      'A session’s events move the record along a monotone lattice: an opened unit is inserted in progress with its declared expiry and never changes a row that exists; a closed unit is terminal, inserted when never seen and overriding abandoned; a session’s end and a new session on the same profile and subject abandon only what is still in progress; the same event twice changes nothing; and a unit without the kept fact is passed over.',
  },
  {
    id: 'JA-4',
    statement:
      'The intake is one subscriber of the bus: it subscribes before it pulls, applies each event and acknowledges it, passes over and acknowledges a payload its topic’s schema refuses rather than holding the events behind it, and on a subscription the bus swept subscribes again and warns once that a gap may exist.',
  },
  {
    id: 'JA-5',
    statement:
      'The record in Postgres is keyed by the unit’s own id, matches a company by its identity key whatever its spelling, lists a subject’s applications since a date with the terminal date where one exists, finds what is still in progress for a session or for a profile and subject but another session, and holds every status and source to the contracts’ vocabularies.',
  },
  {
    id: 'JA-6',
    statement:
      'The HTTP surface answers the advisor protocol with the contracts’ shapes and a {data} envelope, and the record’s own routes: a subject’s applications filtered and paged, its companies summed, an application entered by hand with its status and date, and a status corrected — a bad body or query a 400 naming its issues, an unknown id a 404.',
  },
  {
    id: 'JA-7',
    statement:
      'The service is layered — the advisor protocol, the applications it is kept over, the intake that feeds them — and each folder reaches another only through its declared door, read from every file’s imports the way the compiler reads them; the advisor layer never names the domain.',
  },
  {
    id: 'JA-8',
    statement:
      'Every variable the service reads is declared once with its fallback and read nowhere else, every settings file it ships validates against its schema with every kind chosen, and the policy’s stance map is total over the application statuses.',
  },
];
