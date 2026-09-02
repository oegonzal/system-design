import type { EvalDimension } from './evaluations';

/**
 * What "a good system design" covers, and how much of that this rubric can see.
 *
 * A score out of 100 invites a reading it has not earned: that 100 means the
 * design is good, rather than that nothing the engine knows how to check is
 * missing. Those are very different claims, and the gap between them is not a
 * rounding error — cost, rollout, schema design and team shape are among the
 * first things a real reviewer asks about, and none of them are modelled here.
 *
 * So the areas are declared, including the ones with no dimension behind them.
 * An author is owed the shape of the map's edge, not just the part that is
 * drawn — otherwise a full score teaches the wrong lesson, which for a
 * teaching tool is the expensive kind of wrong.
 */
export interface QualityArea {
  id: string;
  label: string;
  /** The dimension that grades it, or null when the rubric does not model it. */
  assessedBy: EvalDimension | null;
  /** What a reviewer would ask that the engine cannot. */
  note: string;
}

export const QUALITY_AREAS: readonly QualityArea[] = [
  {
    id: 'reliability',
    label: 'Reliability',
    assessedBy: 'reliability',
    note: 'Redundancy, failover and what survives an instance loss.',
  },
  {
    id: 'scalability',
    label: 'Scalability',
    assessedBy: 'scalability',
    note: 'Whether the tiers absorb the stated peak, and what becomes the ceiling.',
  },
  {
    id: 'performance',
    label: 'Performance',
    assessedBy: 'performance',
    note: 'Latency the user feels against the budget the prompt states.',
  },
  {
    id: 'data',
    label: 'Data',
    assessedBy: 'data',
    note: 'Consistency, durability and how stale a read may be.',
  },
  {
    id: 'messaging',
    label: 'Messaging',
    assessedBy: 'messaging',
    note: 'Delivery guarantees, buffering and what happens to a failed message.',
  },
  {
    id: 'security',
    label: 'Security',
    assessedBy: 'security',
    note: 'The front door: authentication, rate limiting, what crosses trust boundaries.',
  },
  {
    id: 'hygiene',
    label: 'Diagram hygiene',
    assessedBy: 'hygiene',
    note: 'Whether the drawing itself is honest — every box participating.',
  },
  {
    id: 'explanation',
    label: 'Explanation',
    assessedBy: 'explanation',
    note: 'Which component holds which requirement, corroborated against the canvas.',
  },
  {
    id: 'product',
    label: 'Product workability',
    assessedBy: 'product',
    note: 'API contracts, entity lifecycles, event flows and the aggregates they feed — the business story, corroborated against the canvas.',
  },

  // Everything below has no dimension. Each is something a reviewer asks and
  // this rubric cannot: not an oversight, a stated boundary.
  {
    id: 'cost',
    label: 'Cost',
    assessedBy: null,
    note: 'What this runs to at the stated scale, and which component dominates the bill.',
  },
  {
    id: 'rollout',
    label: 'Migration and rollout',
    assessedBy: null,
    note: 'How you get from the system that exists to this one without an outage.',
  },
  {
    id: 'schema',
    label: 'Data modelling',
    assessedBy: null,
    note: 'The actual entities, keys and access patterns behind the boxes labelled "database".',
  },
  {
    id: 'operability',
    label: 'Operability',
    assessedBy: null,
    note: 'Runbooks, on-call load, and what a 3am page for this design looks like.',
  },
  {
    id: 'team',
    label: 'Team shape',
    assessedBy: null,
    note: 'Who owns which service, and whether the architecture matches how the org is organised.',
  },
  {
    id: 'threat-model',
    label: 'Threat modelling',
    assessedBy: null,
    note: 'Who the adversary is and what they gain — beyond whether the knobs are switched on.',
  },
  {
    id: 'evidence',
    label: 'Measured evidence',
    assessedBy: null,
    note: 'Load tests, benchmarks and production numbers. Everything here is argued, not measured.',
  },
];

/** The areas this rubric does not model at all. */
export const UNMODELLED_QUALITY_AREAS: readonly QualityArea[] = QUALITY_AREAS.filter(
  (area) => area.assessedBy === null,
);
