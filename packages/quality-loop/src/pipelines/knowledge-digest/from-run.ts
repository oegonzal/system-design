/**
 * A finished run → a knowledge record: the engine's own reduction of the run
 * (`core/outputs/experience`) plus what this digest reads and the
 * experience digest does not — what the store already knows, the source
 * pipeline's dimension map, the artifact's own place ids — fitted to the goal
 * budget this codec's render measures.
 *
 * Nothing here reaches for a registry or a store: the known items and the
 * dimension map arrive as data from whoever composed the record, which is what
 * keeps the codec testable and the pipeline ignorant of where either came from.
 */
import { GOAL_BUDGET_BYTES } from '@sysdesign/contracts';
import type { QualityRunDto } from '@sysdesign/contracts';

import { experienceOf, fitToBudget, trimExperience } from '../../core/outputs';
import {
  KNOWLEDGE_RULES,
  MAX_ITEMS,
  MAX_KNOWN,
  MAX_LOCATION_IDS,
  KNOWN_TEXT_MAX,
  alias,
  knowledgeRecordSchema,
  renderGoal,
  type DimensionMap,
  type KnowledgeRecord,
  type KnownItem,
} from './input';

/** A known item as a composer hands it over, before the record aliases it. */
export type RecalledItem = Omit<KnownItem, 'alias'>;

export interface ComposeOptions {
  /** What the store already holds about situations like this run, strongest first. */
  known?: readonly RecalledItem[];
  maxMemories?: number;
  rules?: readonly string[];
}

export interface SourcePolicy {
  pipeline: string;
  version: string;
  /** Every dimension the source pipeline declares, in policy order. */
  dimensions: readonly string[];
  map: DimensionMap;
}

/** Cap a known item's text the way the record bounds it, so a long lesson is shown short rather than refused. */
const trimText = (text: string): string =>
  text.length <= KNOWN_TEXT_MAX ? text : `${text.slice(0, KNOWN_TEXT_MAX - 1)}…`;

/**
 * The cheapest trim, in this order: a known item first, because it is context
 * rather than evidence and the item it would have informed is the one thing a
 * later run can recover; then the record's own trims. Place ids are never
 * trimmed — they are what the generality rule checks against, so dropping one
 * would quietly stop checking it.
 */
const trimRecord = (record: KnowledgeRecord): KnowledgeRecord | null => {
  if (record.known.length > 0) return { ...record, known: record.known.slice(0, -1) };
  return trimExperience(record);
};

/** Fit a record to the goal budget, deterministically, one cheapest trim at a time. */
export const fit = (record: KnowledgeRecord, budget = GOAL_BUDGET_BYTES): KnowledgeRecord =>
  fitToBudget(record, renderGoal, trimRecord, budget);

/**
 * Null until the run has settled a trace: a run still going, or one that failed
 * before the loop, teaches nothing yet. A record the trims could not bring
 * under the goal budget is refused here, so the step fails by name rather than
 * every stage reading a clipped goal.
 */
export function fromRun(
  run: QualityRunDto,
  source: SourcePolicy,
  options: ComposeOptions = {},
): KnowledgeRecord | null {
  const experience = experienceOf(run);
  if (experience === null) return null;
  const locations = run.trace?.iterations.find(
    (iteration) => iteration.iteration === experience.bestIteration,
  )?.locations;
  const ids = (locations ?? []).map((location) => location.id);
  const known = (options.known ?? [])
    .slice(0, MAX_KNOWN)
    .map(({ kind, runId, ref, pipeline, when, text }, position): KnownItem => ({
      alias: alias(position),
      kind,
      runId,
      ref,
      pipeline,
      when,
      text: trimText(text),
    }));

  return knowledgeRecordSchema.parse(
    fit({
      ...experience,
      source: { pipeline: source.pipeline, version: source.version },
      dimensions: [...source.dimensions],
      dimensionMap: source.map,
      known,
      locationIds: ids.slice(0, MAX_LOCATION_IDS),
      omitted: { ...experience.omitted, locations: Math.max(0, ids.length - MAX_LOCATION_IDS) },
      rules: [...(options.rules ?? KNOWLEDGE_RULES)],
      maxMemories: options.maxMemories ?? MAX_ITEMS,
    }),
  );
}
