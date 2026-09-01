/**
 * Narrative↔diagram alignment rules. Where the narrative expectations bank
 * EARNS explanation (did the prose do its job?), these rules SUBTRACT for
 * contradictions between the story and the drawing — claims the diagram
 * never implements. The ENTIRE pack is feature-gated on a non-blank
 * narrative, so a canvas submitted without prose is graded exactly as
 * before, and detection rides the shared contracts probes
 * (`phantomMechanismTerms`) that keep engine and editor in agreement.
 */
import { contradictedCapabilities, phantomMechanismTerms } from '@sysdesign/contracts';

import type { EvalRule, RuleFinding } from '../types';

/** The gate every rule in this pack shares: null or blank prose → silent. */
function presentNarrative(narrative: string | null): string | null {
  const trimmed = narrative?.trim() ?? '';
  return trimmed.length === 0 ? null : trimmed;
}

const phantomClaims: EvalRule = {
  id: 'explanation.narrative-phantom-claims',
  dimension: 'explanation',
  check({ graph, narrative }) {
    const story = presentNarrative(narrative);
    if (story === null) return [];
    const phantoms = phantomMechanismTerms(graph, story);
    if (phantoms.length === 0) return [];
    const list = phantoms.map((term) => `"${term}"`).join(', ');
    return [
      {
        ruleId: phantomClaims.id,
        dimension: 'explanation',
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

/**
 * The mirror of phantom claims, and the more dangerous lie: naming only the
 * components the diagram draws slips past every substring probe in the bank,
 * so without this a narrative can deny its own design's configuration in
 * every sentence and still earn full marks. One finding per contradicted
 * capability, so a story that misrepresents the whole design is penalized
 * for the whole design.
 */
const contradictsConfig: EvalRule = {
  id: 'explanation.narrative-contradicts-config',
  dimension: 'explanation',
  check({ graph, narrative }) {
    const story = presentNarrative(narrative);
    if (story === null) return [];
    const findings: RuleFinding[] = [];

    for (const contradiction of contradictedCapabilities(graph, story)) {
      const owners = contradiction.labels.map((label) => `"${label}"`).join(', ');
      findings.push({
        ruleId: contradictsConfig.id,
        dimension: 'explanation',
        severity: 'high',
        title: `The story denies ${contradiction.capability} the diagram configures`,
        message: `The narrative says "${contradiction.phrase}", but ${owners} ${
          contradiction.labels.length === 1 ? 'is' : 'are'
        } configured with ${contradiction.capability} on the canvas. A reader cannot trust either artifact when they disagree: fix the prose if the diagram is right, or fix the diagram if the prose is. An interviewer reads the contradiction as not knowing your own design.`,
        affectedNodeIds: [...contradiction.nodeIds].sort(),
        affectedEdgeIds: [],
        suggestion: null,
      });
    }

    return findings;
  },
};

/** Below this request rate a qualitative story is forgivable. */
const MIN_RPS_FOR_NUMBERS = 1000;

const noNumbers: EvalRule = {
  id: 'explanation.narrative-no-numbers',
  dimension: 'explanation',
  check({ facts, narrative }) {
    const story = presentNarrative(narrative);
    if (story === null) return [];
    if (facts.scaleTargets.requestsPerSecond < MIN_RPS_FOR_NUMBERS) return [];
    if (/\d/.test(story)) return [];
    return [
      {
        ruleId: noNumbers.id,
        dimension: 'explanation',
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

export const narrativeRules: EvalRule[] = [phantomClaims, contradictsConfig, noNumbers];
