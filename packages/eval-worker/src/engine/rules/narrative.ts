/**
 * Narrative↔diagram alignment rules. Where the narrative expectations bank
 * EARNS communication (did the prose do its job?), these rules SUBTRACT for
 * contradictions between the story and the drawing — claims the diagram
 * never implements. The ENTIRE pack is feature-gated on a non-blank
 * narrative, so a canvas submitted without prose is graded exactly as
 * before, and detection rides the shared contracts probes
 * (`phantomMechanismTerms`) that keep engine and editor in agreement.
 */
import { phantomMechanismTerms } from '@sysdesign/contracts';

import type { EvalRule } from '../types';

/** The gate every rule in this pack shares: null or blank prose → silent. */
function presentNarrative(narrative: string | null): string | null {
  const trimmed = narrative?.trim() ?? '';
  return trimmed.length === 0 ? null : trimmed;
}

const phantomClaims: EvalRule = {
  id: 'communication.narrative-phantom-claims',
  dimension: 'communication',
  check({ graph, narrative }) {
    const story = presentNarrative(narrative);
    if (story === null) return [];
    const phantoms = phantomMechanismTerms(graph, story);
    if (phantoms.length === 0) return [];
    const list = phantoms.map((term) => `"${term}"`).join(', ');
    return [
      {
        ruleId: phantomClaims.id,
        dimension: 'communication',
        severity: 'low',
        title: 'The story claims mechanisms the diagram never draws',
        message: `The narrative mentions ${list} but the diagram draws no component that provides ${
          phantoms.length === 1 ? 'it' : 'them'
        }. A claim in prose is a promise the diagram must keep: either draw the ${
          phantoms.length === 1 ? 'mechanism' : 'mechanisms'
        } so ${phantoms.length === 1 ? 'it' : 'they'} can be graded, or drop the claim — an interviewer grades what is on the whiteboard, not what is merely said.`,
        affectedNodeIds: [],
        affectedEdgeIds: [],
        suggestion: null,
      },
    ];
  },
};

/** Below this request rate a qualitative story is forgivable. */
const MIN_RPS_FOR_NUMBERS = 1000;

const noNumbers: EvalRule = {
  id: 'communication.narrative-no-numbers',
  dimension: 'communication',
  check({ facts, narrative }) {
    const story = presentNarrative(narrative);
    if (story === null) return [];
    if (facts.scaleTargets.requestsPerSecond < MIN_RPS_FOR_NUMBERS) return [];
    if (/\d/.test(story)) return [];
    return [
      {
        ruleId: noNumbers.id,
        dimension: 'communication',
        severity: 'info',
        title: 'A capacity story without a single number',
        message: `The prompt plays at ${facts.scaleTargets.requestsPerSecond.toLocaleString('en-US')} req/s, yet the narrative contains no number at all — no rate, no replica count, no latency budget. Capacity claims earn trust when they are arithmetic: say what each tier absorbs and why the math holds at peak.`,
        affectedNodeIds: [],
        affectedEdgeIds: [],
        suggestion: null,
      },
    ];
  },
};

export const narrativeRules: EvalRule[] = [phantomClaims, noNumbers];
