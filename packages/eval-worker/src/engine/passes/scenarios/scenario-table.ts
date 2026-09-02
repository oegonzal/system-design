/**
 * The adversarial what-ifs, selected DETERMINISTICALLY by archetype and
 * difficulty — the LLM narrates how the design behaves, it never invents the
 * scenario. Tiers accumulate: advanced faces everything standard does, plus
 * the region-scale failure.
 */
import type { Archetype, PromptDifficulty } from '@sysdesign/contracts';

export interface ScenarioDef {
  /** Stable id, persisted on findings and reports. */
  id: string;
  title: string;
  /** What happens, stated as fact — the model walks it through the design. */
  description: string;
}

const REGION_LOSS: ScenarioDef = {
  id: 'region-loss',
  title: 'A region disappears',
  description:
    'The cloud region hosting this system fails entirely — compute, storage and networking gone for 45 minutes with no warning.',
};

const TIERS: Record<Archetype, Record<PromptDifficulty, ScenarioDef[]>> = {
  'flash-sale-ticketing': {
    intro: [
      {
        id: 'thundering-herd',
        title: 'The on-sale thundering herd',
        description:
          'The sale opens and every fan hits refresh at once — traffic multiplies 40× within 90 seconds and holds there for ten minutes.',
      },
    ],
    standard: [
      {
        id: 'hot-partition',
        title: 'One event takes all the writes',
        description:
          'A single headline event receives 95% of all reservation writes — one key, one partition, the entire on-sale.',
      },
    ],
    advanced: [REGION_LOSS],
  },
  'media-streaming-pipeline': {
    intro: [
      {
        id: 'viral-title',
        title: 'A title goes viral',
        description:
          'One title suddenly serves 80% of all playback traffic — manifests, segments and metadata for a single hot asset.',
      },
    ],
    standard: [
      {
        id: 'cdn-node-loss',
        title: 'An edge locality drops out',
        description:
          'A CDN point of presence serving a major metro goes dark; its viewers re-request everything from the next tier at once.',
      },
    ],
    advanced: [REGION_LOSS],
  },
  'workflow-automation': {
    intro: [
      {
        id: 'third-party-outage',
        title: 'A third-party API browns out',
        description:
          'The most-used third-party action API starts timing out on 60% of calls for an hour, then recovers.',
      },
    ],
    standard: [
      {
        id: 'poison-workflow',
        title: 'A poison workflow',
        description:
          'One tenant deploys a workflow whose action crashes its executor on every attempt, retried forever.',
      },
    ],
    advanced: [REGION_LOSS],
  },
  'realtime-analytics': {
    intro: [
      {
        id: 'ingest-burst',
        title: 'The firehose bursts',
        description:
          'Event ingest triples for twenty minutes — producers do not slow down and do not retry politely.',
      },
    ],
    standard: [
      {
        id: 'hot-partition',
        title: 'One key dominates the stream',
        description:
          'A single customer id accounts for half of all events — one partition key soaking up the write volume.',
      },
    ],
    advanced: [REGION_LOSS],
  },
  'dag-orchestration': {
    intro: [
      {
        id: 'worker-crash',
        title: 'Workers die mid-step',
        description:
          'A third of the worker fleet is killed mid-execution — steps in flight vanish without acknowledging.',
      },
    ],
    standard: [
      {
        id: 'scheduler-crash',
        title: 'The scheduler restarts',
        description:
          'The scheduler process crashes and restarts twice in five minutes while thousands of runs are mid-flight.',
      },
    ],
    advanced: [
      {
        id: 'split-brain',
        title: 'Two schedulers both believe they lead',
        description:
          'A network partition leaves two scheduler instances each convinced they own dispatch for the same runs.',
      },
    ],
  },
  'order-history-integration': {
    intro: [
      {
        id: 'webhook-replay',
        title: 'The storefront redelivers an hour of webhooks',
        description:
          'An incident recovery replays every order webhook from the last hour — duplicated, out of order, some for orders the POS import already landed.',
      },
    ],
    standard: [
      {
        id: 'pos-brownout',
        title: 'The POS API browns out',
        description:
          'The Retail POS REST API times out on 70% of calls for 40 minutes, then recovers to face a full store-day backlog while shoppers keep checking their history.',
      },
    ],
    advanced: [REGION_LOSS],
  },
};

const ORDER: PromptDifficulty[] = ['intro', 'standard', 'advanced'];

/** Cumulative selection: each tier faces everything easier tiers face. */
export function selectScenarios(archetype: Archetype, difficulty: PromptDifficulty): ScenarioDef[] {
  // A stale persisted archetype string degrades to the one universal scenario
  // instead of throwing; a NEW archetype still fails to compile until TIERS
  // covers it, because the Record above stays exhaustive.
  const tiers = TIERS[archetype] as Record<PromptDifficulty, ScenarioDef[]> | undefined;
  if (tiers === undefined) return [REGION_LOSS];
  const cutoff = ORDER.indexOf(difficulty);
  return ORDER.slice(0, cutoff + 1).flatMap((tier) => tiers[tier]);
}
