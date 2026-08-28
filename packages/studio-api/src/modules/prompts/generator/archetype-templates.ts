import type { Archetype, PromptDifficulty, ScaleFacts, ScaleTargets } from '@sysdesign/contracts';

import { pick } from './rng';

/**
 * Everything a template needs to write its prose. `rng` is the only source of
 * variation, so a template that draws from it in a fixed order stays a pure
 * function of the seed.
 */
export interface TemplateContext {
  facts: ScaleFacts;
  difficulty: PromptDifficulty;
  targets: ScaleTargets;
  rng: () => number;
}

export interface ArchetypeTemplate {
  /** 3+ so different seeds can land on different titles. */
  titleVariants: readonly string[];
  scenario(ctx: TemplateContext): string;
  deriveScaleTargets(facts: ScaleFacts, difficulty: PromptDifficulty): ScaleTargets;
}

/**
 * Latency/availability/ratio baselines per archetype. Exported so the
 * requirement banks can quote the same numbers the scale targets carry —
 * one table, no drift between "p99 ≤ 300ms" in an NFR and 300 in the targets.
 */
export interface ArchetypeBaseline {
  readWriteRatio: string;
  p99LatencyMs: number;
  availabilityPct: string;
  dataRetention: string;
}

export const ARCHETYPE_BASELINES = {
  'flash-sale-ticketing': {
    readWriteRatio: '80:20',
    p99LatencyMs: 300,
    availabilityPct: '99.95',
    dataRetention: '90 days of orders hot, 2 years archived',
  },
  'media-streaming-pipeline': {
    readWriteRatio: '95:5',
    p99LatencyMs: 200,
    availabilityPct: '99.9',
    dataRetention: 'originals kept indefinitely; renditions rebuildable',
  },
  'workflow-automation': {
    readWriteRatio: '70:30',
    p99LatencyMs: 500,
    availabilityPct: '99.9',
    dataRetention: '13 months of run history queryable',
  },
  'realtime-analytics': {
    readWriteRatio: '90:10',
    p99LatencyMs: 250,
    availabilityPct: '99.9',
    dataRetention: '30 days of raw events hot, 13 months of rollups',
  },
  'dag-orchestration': {
    readWriteRatio: '60:40',
    p99LatencyMs: 1000,
    availabilityPct: '99.5',
    dataRetention: '90 days of run logs and step outputs',
  },
} as const satisfies Record<Archetype, ArchetypeBaseline>;

/** intro is the experience's real scale; standard and advanced turn it up. */
export const DIFFICULTY_MULTIPLIERS = {
  intro: 1,
  standard: 10,
  advanced: 100,
} as const satisfies Record<PromptDifficulty, number>;

export const DEFAULT_CONCURRENT_USERS = 5000;
export const DEFAULT_REQUESTS_PER_SECOND = 1000;

const deriveFrom =
  (baseline: ArchetypeBaseline) =>
  (facts: ScaleFacts, difficulty: PromptDifficulty): ScaleTargets => {
    const multiplier = DIFFICULTY_MULTIPLIERS[difficulty];
    return {
      concurrentUsers: (facts.concurrentUsers ?? DEFAULT_CONCURRENT_USERS) * multiplier,
      requestsPerSecond: (facts.requestsPerSecond ?? DEFAULT_REQUESTS_PER_SECOND) * multiplier,
      readWriteRatio: baseline.readWriteRatio,
      p99LatencyMs: baseline.p99LatencyMs,
      availabilityPct: baseline.availabilityPct,
      dataRetention: baseline.dataRetention,
    };
  };

/** Explicit locale so the prose is identical on every machine. */
const fmt = (n: number): string => n.toLocaleString('en-US');

const CHARGE_BY_DIFFICULTY: Record<PromptDifficulty, string> = {
  intro: 'Start with a clean core design; name your components and the data flow between them.',
  standard: 'Justify every scaling decision against the stated targets.',
  advanced:
    'Assume the numbers keep growing after launch — every single point of failure and every ' +
    'unbounded queue will be probed.',
};

/** The stated-targets sentence every scenario closes with. */
const targetsClause = (t: ScaleTargets): string =>
  `Design for ${fmt(t.concurrentUsers)} concurrent users and ${fmt(t.requestsPerSecond)} ` +
  `requests/second at peak with a ${t.readWriteRatio} read:write ratio, holding p99 latency ` +
  `at or under ${t.p99LatencyMs}ms while sustaining ${t.availabilityPct}% availability.`;

const fieldNotes = (facts: ScaleFacts): string =>
  facts.notes ? ` Context from the field: ${facts.notes}` : '';

export const ARCHETYPE_TEMPLATES = {
  'flash-sale-ticketing': {
    titleVariants: [
      'Design a Flash-Sale Ticketing Backend',
      'Sell Finite Inventory Under Stampede Load',
      'Design a Fair-Queue Ticket Drop System',
      'Survive the On-Sale Spike Without Overselling',
    ],
    scenario: ({ facts, difficulty, targets, rng }) => {
      const angle = pick(rng, [
        'A headline on-sale opens at a fixed minute and an entire day of demand arrives in the first thirty seconds.',
        'Marketing has scheduled a drop that will multiply normal traffic the moment the countdown ends.',
        'Scripted resale clients hammer the inventory endpoints the instant seats unlock.',
        'The last on-sale melted the checkout path; rebuilding it is your remit.',
      ]);
      return (
        `You are designing the backend for a ticketed-events platform whose inventory is ` +
        `strictly finite — overselling a seat is unacceptable. ${angle} ` +
        `${targetsClause(targets)} ${CHARGE_BY_DIFFICULTY[difficulty]}${fieldNotes(facts)}`
      );
    },
    deriveScaleTargets: deriveFrom(ARCHETYPE_BASELINES['flash-sale-ticketing']),
  },
  'media-streaming-pipeline': {
    titleVariants: [
      'Design a Media Ingest and Streaming Pipeline',
      'Deliver Launch-Day Video at CDN Scale',
      'Design a Creator Media and Drops Platform',
      'Stream, Transcode and Drop Without Falling Over',
    ],
    scenario: ({ facts, difficulty, targets, rng }) => {
      const angle = pick(rng, [
        'Creators upload long-form video that must be transcoded into multiple renditions before fans ever see it.',
        'Launch-day drops concentrate a full day of viewing into the first few minutes after release.',
        'A single viral title can pull most of the audience onto one asset at the same moment.',
        'Media assets dominate storage and egress cost, and playback start time is the metric leadership watches.',
      ]);
      return (
        `You are designing the media pipeline for a streaming platform: upload, transcode, ` +
        `store and deliver video plus the metadata that powers browse and playback. ${angle} ` +
        `${targetsClause(targets)} ${CHARGE_BY_DIFFICULTY[difficulty]}${fieldNotes(facts)}`
      );
    },
    deriveScaleTargets: deriveFrom(ARCHETYPE_BASELINES['media-streaming-pipeline']),
  },
  'workflow-automation': {
    titleVariants: [
      'Design a Configurable Workflow Automation Engine',
      'Automate a Thousand Slightly Different Workflows',
      'Design a Campaign Operations Platform',
      'One Engine, Every Customer Configuration',
    ],
    scenario: ({ facts, difficulty, targets, rng }) => {
      const angle = pick(rng, [
        'Every customer configures a slightly different path through the same engine, and all of them expect their variant to just work.',
        'Operations teams chain triggers, conditions and actions into workflows nobody on your team has ever executed end to end.',
        'A misfired automation touches real campaigns and real budgets, so partial failures must be visible and recoverable.',
        'New workflow steps ship weekly, and existing customer configurations must keep running unchanged.',
      ]);
      return (
        `You are designing the execution engine for a workflow-automation platform: customers ` +
        `compose triggers, conditions and actions into automations the system runs on their ` +
        `behalf. ${angle} ${targetsClause(targets)} ` +
        `${CHARGE_BY_DIFFICULTY[difficulty]}${fieldNotes(facts)}`
      );
    },
    deriveScaleTargets: deriveFrom(ARCHETYPE_BASELINES['workflow-automation']),
  },
  'realtime-analytics': {
    titleVariants: [
      'Design a Real-Time Analytics Dashboard Backend',
      'Keep Dashboards Fresh Against an Event Firehose',
      'Design a Live Risk-Monitoring Pipeline',
      'From Firehose to Dashboard in Seconds',
    ],
    scenario: ({ facts, difficulty, targets, rng }) => {
      const angle = pick(rng, [
        'Analysts watch the dashboards during incidents, so staleness is noticed within seconds.',
        'The event stream never pauses; ingestion and query load compete for the same stores.',
        'Historical queries spanning months must not slow the live view of the last five minutes.',
        'Alert rules evaluate continuously over the stream, and a missed alert is worse than a late one.',
      ]);
      return (
        `You are designing the backend for a real-time analytics product: a continuous event ` +
        `stream feeds live dashboards, alerting and historical queries. ${angle} ` +
        `${targetsClause(targets)} ${CHARGE_BY_DIFFICULTY[difficulty]}${fieldNotes(facts)}`
      );
    },
    deriveScaleTargets: deriveFrom(ARCHETYPE_BASELINES['realtime-analytics']),
  },
  'dag-orchestration': {
    titleVariants: [
      'Design a DAG Workflow Orchestrator',
      'Design a Durable Multi-Step Job Engine',
      'Orchestrate Fallible Steps Into Reliable Runs',
      'Compile Goals Into Executable DAGs',
    ],
    scenario: ({ facts, difficulty, targets, rng }) => {
      const angle = pick(rng, [
        'Individual steps call flaky external services, so retries are the normal case rather than the exception.',
        'Runs span minutes to hours, and a worker crash mid-run must never lose completed work.',
        'Fan-out steps produce thousands of children whose results must be joined before the run continues.',
        'Operators need to inspect, pause and resume any run without breaking its exactly-once effects.',
      ]);
      return (
        `You are designing an orchestration engine that executes directed acyclic graphs of ` +
        `dependent steps: scheduling, state tracking, retries and progress durability across ` +
        `workers. ${angle} ${targetsClause(targets)} ` +
        `${CHARGE_BY_DIFFICULTY[difficulty]}${fieldNotes(facts)}`
      );
    },
    deriveScaleTargets: deriveFrom(ARCHETYPE_BASELINES['dag-orchestration']),
  },
} as const satisfies Record<Archetype, ArchetypeTemplate>;
