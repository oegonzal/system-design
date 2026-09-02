/**
 * The narrative bank: what the design walkthrough must do to earn the
 * explanation dimension alongside the brief.
 *
 * Every check reads the narrative's typed projection (`ctx.narration`) — which
 * references carry substantive prose — never the prose itself, so the grounded
 * invariant the brief established holds for the walkthrough too: coverage is a
 * set operation over ids and ordinals, substance is a fixed shape gate applied
 * upstream in `projectNarration`, and nothing here is matched as text. Renaming
 * a component or rewording a requirement cannot move a narrative grade; failing
 * to actually explain a component can.
 *
 * `exp.nar.present` applies whether or not a narrative was submitted, so silence
 * scores 0 for it AND trips the "no top grade without a walkthrough" cap. The
 * others are skipped when nothing substantive was written — there is nothing of
 * their kind to grade until a narrative exists.
 */
import { ANNOTATION_KINDS } from '@sysdesign/contracts';

import { bindingBackedNodeIds, flowTouchedNodeIds, judgeBrief } from '../../../mechanisms';
import { uniqueSorted } from '../../../rules/shared';
import type { RuleContext } from '../../../types';
import type { Expectation } from '../types';
import { met, unmet } from '../types';

function labelsOf(ids: readonly string[], byId: (id: string) => { label: string } | undefined) {
  const named = ids
    .slice(0, 5)
    .map((id) => `"${byId(id)?.label ?? id}"`)
    .join(', ');
  const elided = ids.length - Math.min(ids.length, 5);
  return elided > 0 ? `${named} +${elided} more` : named;
}

/**
 * The components the design accounts for through its brief — corroborated
 * bindings and traced flows. These are the boxes the walkthrough is expected to
 * explain; a box no claim rests on is not yet part of the answer, so the
 * narrative is not asked to justify it.
 */
function accountedNodeIds(ctx: RuleContext): Set<string> {
  const { graph, index, brief } = ctx;
  const verdicts = judgeBrief(index, brief);
  const backed = bindingBackedNodeIds(verdicts);
  const touched = flowTouchedNodeIds(index, brief);
  const accounted = new Set<string>();
  for (const node of graph.nodes) {
    if (ANNOTATION_KINDS.includes(node.kind)) continue;
    if (backed.has(node.id) || touched.has(node.id)) accounted.add(node.id);
  }
  return accounted;
}

const narrativePresent: Expectation = {
  id: 'exp.nar.present',
  dimension: 'explanation',
  weight: 1,
  severityIfUnmet: 'high',
  minDifficulty: 'intro',
  archetypes: 'all',
  requiresNarration: true,
  appliesWithoutNarration: true,
  title: 'The design is never explained in words',
  teach: () =>
    'No walkthrough was written, so the design has to be read off the boxes — and an interviewer does not grade boxes, they grade the story you tell over them. Explain, in your own words, why each component is there and how each requirement is served. Without that, the strongest diagram is still a guess the reader has to finish for you.',
  satisfiedBy: ({ narration }) => (narration?.present ? met([]) : unmet()),
};

/**
 * The walkthrough has to explain the components the design leans on — not merely
 * mention them. Grounded: intersect the brief-accounted node set with the nodes
 * whose rationale reads as prose; any accounted node without a substantive
 * rationale is the gap.
 */
const componentsExplained: Expectation = {
  id: 'exp.nar.components-explained',
  dimension: 'explanation',
  weight: 3,
  severityIfUnmet: 'medium',
  minDifficulty: 'intro',
  archetypes: 'all',
  requiresNarration: true,
  title: 'Components the walkthrough never explains',
  teach: () =>
    'Every component the design rests on should have a reason the reader can hear you give: what it does, and why it earns its place. A box the walkthrough never speaks to reads as unexamined — the reviewer cannot tell a deliberate choice from an accident.',
  satisfiedBy: (ctx) => {
    const accounted = accountedNodeIds(ctx);
    const explained = new Set(ctx.narration?.explainedNodeIds ?? []);
    const missing = uniqueSorted([...accounted].filter((id) => !explained.has(id)));
    if (missing.length === 0) return met(uniqueSorted([...explained]));
    return unmet(
      missing,
      [],
      `${labelsOf(missing, (id) => ctx.index.byId(id))} ${
        missing.length === 1
          ? 'is part of the design but the walkthrough never explains it'
          : 'are part of the design but the walkthrough never explains them'
      }. Say what ${missing.length === 1 ? 'it does' : 'each does'} and why ${missing.length === 1 ? 'it is' : 'they are'} there — a component you cannot explain is one you cannot defend.`,
    );
  },
};

/**
 * Each thing the system must do should be narrated as a walk, in words, the way
 * the brief traces it on the canvas. Grounded: the narrated requirement ordinals
 * must cover every functional requirement the prompt poses.
 */
const flowsNarrated: Expectation = {
  id: 'exp.nar.flows-narrated',
  dimension: 'explanation',
  weight: 2,
  severityIfUnmet: 'medium',
  minDifficulty: 'intro',
  archetypes: 'all',
  requiresNarration: true,
  title: 'Requirements the walkthrough never narrates',
  teach: (facts) =>
    `The prompt asks for ${facts.functionalRequirementCount} things the system must do, and each should be a story you can tell — the request arriving, the components it touches, where it comes to rest. A requirement with a traced flow but no words is a path the reader has to narrate for you.`,
  satisfiedBy: ({ facts, narration }) => {
    const narrated = new Set(narration?.narratedRequirementIndexes ?? []);
    const missing: number[] = [];
    for (let index = 0; index < facts.functionalRequirementCount; index += 1) {
      if (!narrated.has(index)) missing.push(index);
    }
    if (missing.length === 0) return met([]);
    return unmet(
      [],
      [],
      `${missing.length} of the prompt's ${facts.functionalRequirementCount} functional requirements are never narrated. Walk each one through the design in words, or the walkthrough is only a partial answer.`,
    );
  },
};

const overviewWritten: Expectation = {
  id: 'exp.nar.overview',
  dimension: 'explanation',
  weight: 1,
  severityIfUnmet: 'low',
  minDifficulty: 'standard',
  archetypes: 'all',
  requiresNarration: true,
  title: 'No big-picture overview of the design',
  teach: () =>
    'Open with the shape of the design — the one or two decisions everything else follows from. An interviewer listens for whether you can summarize your own architecture before drilling in; a walkthrough that starts in the weeds hides the reasoning that matters most.',
  satisfiedBy: ({ narration }) => (narration?.overviewSubstantive ? met([]) : unmet()),
};

export const narrativeExpectations: Expectation[] = [
  narrativePresent,
  componentsExplained,
  flowsNarrated,
  overviewWritten,
];
