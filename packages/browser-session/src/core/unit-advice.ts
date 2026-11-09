import {
  advisorsOf,
  documentNamesOf,
  marksOf,
  NO_UNITS_ON_RECORD,
  stopsOf,
  takenOf,
  unitContextLandmarkOf,
  unitFacetsOf,
  type AdvisorDescriptor,
  type UnitAdvice,
  type UnitAdviceRequest,
  type UnitFacet,
  type UnitLookup,
  type UnitLookupRequest,
  type UnitOnRecord,
  type UnitsOnRecord,
} from '@sysdesign/contracts';
import { describeError } from '@sysdesign/run-dump';

import type { EngineContext, RunSessionOptions, SessionDeps } from './engine-context';
import { SESSION_KIND } from './identity';

/**
 * What the mission's advisors know of units beyond this session, composed into
 * every goal. The mission names the advisors; the environment says where each
 * is; the advisor says who it is and which declared facts it keeps its record
 * by. All of that is resolved before the session opens a row, and a mission
 * that names an advisor nobody runs is refused like a bad flag. Then, before
 * every plan, each advisor is asked what is on record: its answer is rendered
 * for the planner and the judges, the units it forbids go into the goal's
 * index for the validator to cut, and every unit it answered is held against
 * each taskStart by the session (`refusedOnRecord`), whatever the goal had
 * room to list; a unit the advice counted past its own bound is asked for by
 * identity at taskStart (`lookedUpOnRecord`). The engine compares declared
 * facts by key and never learns what any of them means.
 */

/** Why an advisor gave no answer; the first three are transient and ridden out. */
export type AdvisorFaultReason = 'unreachable' | 'timeout' | 'failed' | 'refused' | 'malformed';

export class AdvisorFaulted extends Error {
  override readonly name = 'AdvisorFaulted';
  constructor(
    readonly reason: AdvisorFaultReason,
    readonly detail: string,
  ) {
    super(`advisor ${reason}: ${detail}`);
  }
}

/**
 * A session that may not start: a mission section the grammar does not read,
 * an advisor the mission names and nobody runs, a subject the session has none
 * of. Raised before any row, beat or dump folder exists, so nothing is left
 * behind to clean up — the command line's exit code and message are the whole
 * record of it.
 */
export class SessionRefused extends Error {
  override readonly name = 'SessionRefused';
}

export interface UnitAdvisorPort {
  describe(): Promise<AdvisorDescriptor>;
  /** `probe` asks once, without riding out a restart: what an open streak does each step. */
  recall(request: UnitAdviceRequest, options: { probe: boolean }): Promise<UnitAdvice>;
  /** One identity asked about by itself: what the advice had no room to name. */
  lookup(request: UnitLookupRequest, options: { probe: boolean }): Promise<UnitLookup>;
}

/** An advisor as configured: the id its entry named, or null for one described at boot, and where it was configured, for a refusal to say. */
export interface ConfiguredAdvisor {
  id: string | null;
  where: string;
  port: UnitAdvisorPort;
}

/** An advisor the mission named, resolved: who it is, what it keeps its record by, and the last advice it gave. */
export interface ResolvedAdvisor {
  id: string;
  port: UnitAdvisorPort;
  facets: readonly string[];
  lastGood: { advice: UnitAdvice; step: number };
  /** True while the advisor fails: following steps plan on the last good advice and probe once each. */
  streakOpen: boolean;
}

/** What the consult came to this step: nobody to ask, every advisor answered, or one is being ridden on its last advice. */
export type AdviceOutcome = 'no-advisors' | 'answered' | 'stale';

/** What one advisor said this step, as the step's advice file and the plan row record it. */
export interface AdvisorOutcome {
  advisor: string;
  outcome: Exclude<AdviceOutcome, 'no-advisors'>;
  units: number;
  omitted: number;
  durationMs: number;
  /** The step whose advice the goal was composed with: this one, or the last the advisor answered; 0 is the handshake. */
  adviceFromStep: number;
  fault: { reason: AdvisorFaultReason; detail: string } | null;
}

export interface AdviceRecord {
  outcome: AdviceOutcome;
  advisors: AdvisorOutcome[];
  onRecord: UnitsOnRecord;
}

/** The consult as the plan row carries it: the outcome and each advisor's counts, never the units themselves. */
export const adviceSummary = (advice: AdviceRecord) => ({
  outcome: advice.outcome,
  advisors: advice.advisors.map(({ advisor, outcome, units, omitted, adviceFromStep }) => ({
    advisor,
    outcome,
    units,
    omitted,
    adviceFromStep,
  })),
});

const NONE: AdviceRecord = { outcome: 'no-advisors', advisors: [], onRecord: NO_UNITS_ON_RECORD };

const stepWord = (step: number): string => (step === 0 ? 'before the first step' : `step ${step}`);

/** Every declared section of the mission parsed for its refusal; the names the units beyond the session rest on. */
function declaredOf(mission: string): { facets: string[]; advisors: string[] } {
  try {
    marksOf(mission);
    stopsOf(mission);
    takenOf(mission);
    unitContextLandmarkOf(mission);
    documentNamesOf(mission);
    return { facets: unitFacetsOf(mission), advisors: advisorsOf(mission) };
  } catch (error) {
    throw new SessionRefused(describeError(error).message);
  }
}

const requestOf = (
  options: RunSessionOptions,
  sessionId: string,
  facets: readonly string[],
  step: number,
): UnitAdviceRequest => ({
  subject: options.subject,
  asker: { kind: SESSION_KIND, id: sessionId, label: stepWord(step) },
  facets: [...facets],
});

interface Described {
  configured: ConfiguredAdvisor;
  descriptor: AdvisorDescriptor;
}

/**
 * The configured advisors the mission may be asking for, each described once:
 * a named entry only when the mission names it, and it must answer to its name;
 * a bare entry at boot, to learn who it is, a failure there a warning.
 */
async function describeConfigured(
  deps: SessionDeps,
  named: readonly string[],
): Promise<Described[]> {
  const described: Described[] = [];
  for (const configured of deps.advisors) {
    if (configured.id !== null && !named.includes(configured.id)) continue;
    let descriptor: AdvisorDescriptor;
    try {
      descriptor = await configured.port.describe();
    } catch (error) {
      if (configured.id !== null) {
        throw new SessionRefused(
          `advisor ${configured.id} (${configured.where}) could not be described: ${describeError(error).message}`,
        );
      }
      deps.warn(
        `advisor at ${configured.where} could not be described: ${describeError(error).message}`,
      );
      continue;
    }
    if (configured.id !== null && descriptor.id !== configured.id) {
      throw new SessionRefused(
        `advisor ${configured.id} (${configured.where}) describes itself as ${descriptor.id}`,
      );
    }
    described.push({ configured, descriptor });
  }
  return described;
}

/**
 * The advisors the mission names, resolved and asked once — before the session
 * has a row. A mission naming none resolves to none and no advisor is touched.
 */
export async function resolveAdvisors(
  deps: SessionDeps,
  mission: string,
  options: RunSessionOptions,
  sessionId: string,
): Promise<ResolvedAdvisor[]> {
  const declared = declaredOf(mission);
  if (declared.advisors.length === 0) return [];
  if (!options.subjectDeclared) {
    throw new SessionRefused(
      `the mission names the advisor(s) ${declared.advisors.join(', ')}, whose record is kept by subject, and the session has no subject of its own: give one by name`,
    );
  }
  const described = await describeConfigured(deps, declared.advisors);
  const resolved: ResolvedAdvisor[] = [];
  for (const id of declared.advisors) {
    const match = described.find((candidate) => candidate.descriptor.id === id);
    if (match === undefined) {
      const known = described.map((candidate) => candidate.descriptor.id);
      throw new SessionRefused(
        `the mission names the advisor ${id}, and no configured advisor answers to it${
          known.length === 0 ? '' : ` (configured: ${known.join(', ')})`
        }`,
      );
    }
    const undeclared = match.descriptor.facets.filter((facet) => !declared.facets.includes(facet));
    if (undeclared.length > 0) {
      throw new SessionRefused(
        `advisor ${id} keeps its record by ${undeclared.join(', ')}, which the mission's Unit identity does not declare`,
      );
    }
    let advice: UnitAdvice;
    try {
      advice = await match.configured.port.recall(
        requestOf(options, sessionId, match.descriptor.facets, 0),
        { probe: false },
      );
    } catch (error) {
      throw new SessionRefused(
        `advisor ${id} (${match.configured.where}) gave no advice: ${describeError(error).message}`,
      );
    }
    resolved.push({
      id,
      port: match.configured.port,
      facets: match.descriptor.facets,
      lastGood: { advice, step: 0 },
      streakOpen: false,
    });
  }
  return resolved;
}

/** Every advisor's last good advice as one record: the units in advisor order, the omitted counted together. */
const merged = (advisors: readonly ResolvedAdvisor[]): UnitsOnRecord => ({
  units: advisors.flatMap((advisor) => advisor.lastGood.advice.units),
  omitted: advisors.reduce((sum, advisor) => sum + advisor.lastGood.advice.omitted, 0),
});

/**
 * Each advisor asked before this step's plan. One that answers closes any
 * streak it had open; one that faults opens one — said once — and the goal is
 * composed with its last good advice until it answers again, probed once a
 * step rather than ridden out every time.
 */
export async function recallAdvice(ctx: EngineContext): Promise<AdviceRecord> {
  const { advisors, deps, state, options } = ctx;
  if (advisors.length === 0) return NONE;
  const outcomes: AdvisorOutcome[] = [];
  for (const advisor of advisors) {
    const startedAt = deps.clock.now().getTime();
    const request = requestOf(options, state.sessionId, advisor.facets, state.step);
    try {
      const advice = await advisor.port.recall(request, { probe: advisor.streakOpen });
      if (advisor.streakOpen) {
        deps.log(`step ${state.step}: advisor ${advisor.id} answers again`);
        advisor.streakOpen = false;
      }
      advisor.lastGood = { advice, step: state.step };
      outcomes.push({
        advisor: advisor.id,
        outcome: 'answered',
        units: advice.units.length,
        omitted: advice.omitted,
        durationMs: deps.clock.now().getTime() - startedAt,
        adviceFromStep: state.step,
        fault: null,
      });
    } catch (error) {
      if (!(error instanceof AdvisorFaulted)) throw error;
      if (!advisor.streakOpen) {
        deps.warn(
          `step ${state.step}: advisor ${advisor.id} ${error.reason} — planning on its advice from ${stepWord(advisor.lastGood.step)} until it answers again: ${error.detail}`,
        );
        advisor.streakOpen = true;
      }
      outcomes.push({
        advisor: advisor.id,
        outcome: 'stale',
        units: advisor.lastGood.advice.units.length,
        omitted: advisor.lastGood.advice.omitted,
        durationMs: deps.clock.now().getTime() - startedAt,
        adviceFromStep: advisor.lastGood.step,
        fault: { reason: error.reason, detail: error.detail },
      });
    }
  }
  return {
    outcome: outcomes.every((outcome) => outcome.outcome === 'answered') ? 'answered' : 'stale',
    advisors: outcomes,
    onRecord: merged(advisors),
  };
}

/**
 * A claim's identity asked of each advisor whose last advice counted units
 * past its bound — the only advisors that can be holding one the step's
 * record does not name — the first unit found standing as one the advice
 * named. Measured 2026-11-09: a record of 255 companies was answered as 200
 * and 55 counted, and a taskStart on one of the 55 was refused by nothing.
 * An advisor that faults on the lookup is warned about and the unit opens on
 * the record composed with, as it did before the lookup existed; a claim
 * carrying no facets matches nothing and asks nothing.
 */
export async function lookedUpOnRecord(
  ctx: EngineContext,
  identity: readonly UnitFacet[],
): Promise<UnitOnRecord | null> {
  const { advisors, deps, state, options } = ctx;
  if (identity.length === 0) return null;
  for (const advisor of advisors) {
    if (advisor.lastGood.advice.omitted === 0) continue;
    const request: UnitLookupRequest = {
      ...requestOf(options, state.sessionId, advisor.facets, state.step),
      identity: [...identity],
    };
    try {
      const { unit } = await advisor.port.lookup(request, { probe: advisor.streakOpen });
      if (unit !== null) return unit;
    } catch (error) {
      if (!(error instanceof AdvisorFaulted)) throw error;
      deps.warn(
        `step ${state.step}: advisor ${advisor.id} ${error.reason} when asked about a unit past its advice's bound — the unit opens on the record composed with: ${error.detail}`,
      );
    }
  }
  return null;
}
