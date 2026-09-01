/**
 * The narrative bank: what a design narrative must do to earn the
 * communication dimension.
 *
 * `exp.nar.present` applies whether or not prose was submitted, so silence
 * scores 0 rather than dropping the dimension out of the rubric — a diagram
 * nobody can follow is not a finished answer. The rest grade the prose itself
 * and only exist once there is some.
 *
 * Coverage is decided by the shared contracts helpers (`unmentionedNodeLabels`,
 * `hasFlowStory`, `unaddressedNfrKinds`) — the same ones the editor's live
 * checklist shows the author, so a submission is never graded against a
 * different notion of coverage than the one on screen. Because every one of
 * those helpers is a substring test, they are all gated behind
 * `creditableStory`: a list of the words the checks look for earns nothing,
 * and neither does prose that describes a different system than the canvas.
 */
import {
  MIN_PROSE_SENTENCES,
  NFR_KINDS,
  contradictedCapabilities,
  hasFlowStory,
  readsAsProse,
  unaddressedNfrKinds,
  unmentionedNodeLabels,
} from '@sysdesign/contracts';
import type { CanvasGraph, NfrKind } from '@sysdesign/contracts';

import { uniqueSorted } from '../../../rules/shared';
import type { Expectation } from '../types';
import { met, unmet } from '../types';

/** Labels are named up to this many; the rest collapse into "+N more". */
const MAX_NAMED_LABELS = 5;

/**
 * A story that misdescribes this many of its own configured capabilities is
 * no longer describing this design. Below the threshold a contradiction is a
 * slip: the alignment rule charges for it and the coverage still counts.
 */
const MAX_TOLERATED_CONTRADICTIONS = 3;

/**
 * Every content check below is a substring test, and both ways of faking one
 * are cheap: list the words the checks look for, or name the right components
 * while saying the opposite of what they do. So substring evidence is only
 * credited when the prose is prose AND is not wholesale contradicting the
 * canvas; otherwise the checks report unmet with the reason. The gate is
 * all-or-nothing on purpose — a text either describes this design or it does
 * not, and half a keyword list is not half an explanation.
 */
function creditableStory(graph: CanvasGraph, narrative: string | null): string | null {
  const story = (narrative ?? '').trim();
  if (story.length === 0 || !readsAsProse(story)) return null;
  if (contradictedCapabilities(graph, story).length >= MAX_TOLERATED_CONTRADICTIONS) return null;
  return story;
}

/** Why the gate closed, so the finding never blames the wrong thing. */
function uncreditableDetail(graph: CanvasGraph, narrative: string | null): string {
  const story = (narrative ?? '').trim();
  if (story.length > 0 && readsAsProse(story)) {
    const denied = contradictedCapabilities(graph, story)
      .map((entry) => entry.capability)
      .join(', ');
    return `The narrative contradicts the canvas on ${denied} — it describes a different system than the one drawn, so its coverage of this one cannot be credited. Reconcile the two: correct the prose if the diagram is right, or correct the diagram if the prose is.`;
  }
  return 'The narrative names the right words but never puts them in sentences, so nothing in it can be credited: a reader learns which components exist and no more. Substring coverage is not an explanation — say what each component does, how a request moves between them, and which requirement each mechanism holds.';
}

function formatLabels(labels: readonly string[]): string {
  const named = labels
    .slice(0, MAX_NAMED_LABELS)
    .map((label) => `"${label}"`)
    .join(', ');
  const elided = labels.length - Math.min(labels.length, MAX_NAMED_LABELS);
  return elided > 0 ? `${named} +${elided} more` : named;
}

/**
 * The one expectation whose subject is the absence of prose. Every other
 * check here is skipped when nothing was submitted; this one applies anyway,
 * so a diagram shipped in silence scores communication 0 instead of having
 * the dimension renormalized out of its grade. Explaining your design is part
 * of the exercise, and a design nobody can follow is not a finished answer.
 */
const narrativePresent: Expectation = {
  id: 'exp.nar.present',
  dimension: 'communication',
  weight: 1,
  severityIfUnmet: 'high',
  minDifficulty: 'intro',
  archetypes: 'all',
  requiresNarrative: true,
  appliesWithoutNarrative: true,
  title: 'The design ships without a narrative',
  teach: () =>
    'No narrative was submitted, so the diagram has to speak for itself — and boxes never do. An interview is won on the explanation: which component owns which requirement, how a request travels between them, and what happens when a piece fails. Write the walkthrough; it is graded with the diagram, not beside it.',
  satisfiedBy: ({ narrative }) => ((narrative ?? '').trim().length > 0 ? met([]) : unmet()),
};

const componentsExplained: Expectation = {
  id: 'exp.nar.components-explained',
  dimension: 'communication',
  weight: 2,
  severityIfUnmet: 'medium',
  minDifficulty: 'intro',
  archetypes: 'all',
  requiresNarrative: true,
  title: 'Components the narrative never explains',
  teach: () =>
    'A reader should find every component in the story: a box the prose skips reads as either unexplained thinking or an unnecessary box. Extend the narrative until each remaining component earns its place.',
  satisfiedBy: ({ graph, narrative }) => {
    const story = creditableStory(graph, narrative);
    if (story === null) return unmet([], [], uncreditableDetail(graph, narrative));
    const missing = unmentionedNodeLabels(graph, story);
    if (missing.length === 0) {
      return met(uniqueSorted(graph.nodes.map((node) => node.id)));
    }
    const missingKeys = new Set(missing.map((label) => label.toLowerCase()));
    const affected = graph.nodes
      .filter((node) => missingKeys.has(node.label.trim().toLowerCase()))
      .map((node) => node.id);
    return unmet(
      uniqueSorted(affected),
      [],
      `The narrative never mentions ${formatLabels(missing)} — ${
        missing.length === 1 ? 'a component' : `${missing.length} components`
      } the diagram depends on ${missing.length === 1 ? 'has' : 'have'} no sentence saying what ${
        missing.length === 1 ? 'it is' : 'they are'
      } for. A reader should find every component in the story: a box the prose skips reads as either unexplained thinking or an unnecessary box. Extend the narrative until each remaining component earns its place.`,
    );
  },
};

const flowStory: Expectation = {
  id: 'exp.nar.flow-story',
  dimension: 'communication',
  weight: 1,
  severityIfUnmet: 'low',
  minDifficulty: 'intro',
  archetypes: 'all',
  requiresNarrative: true,
  title: 'A story that names parts but never says how they talk',
  teach: () =>
    'The narrative never uses a flow verb — calls, sends, publishes, consumes, reads, writes — so the story names parts but never says how they talk. Walk one request through the arrows: who calls whom, what is written where, and what flows back. The arrows are the design; the prose should narrate them.',
  satisfiedBy: ({ graph, narrative }) => {
    // A canvas with no edges has no flows to narrate — checked before the
    // credibility gate, which has nothing to weigh when there is no flow.
    if (graph.edges.length === 0) return met([]);
    const story = creditableStory(graph, narrative);
    if (story === null) return unmet([], [], uncreditableDetail(graph, narrative));
    return hasFlowStory(story) ? met([]) : unmet();
  },
};

/** Below this, prose cannot be explaining a multi-component system. */
const MIN_NARRATIVE_WORDS = 30;
/** Canvases smaller than this may legitimately need only a sentence. */
const MIN_NODES_FOR_SUBSTANCE = 3;

const substance: Expectation = {
  id: 'exp.nar.substance',
  dimension: 'communication',
  weight: 1,
  severityIfUnmet: 'low',
  minDifficulty: 'intro',
  archetypes: 'all',
  requiresNarrative: true,
  title: 'A narrative too thin to explain the design',
  teach: () =>
    'A couple of sentences cannot explain a system. Say what each component is for, how a request travels between them, and which requirement each mechanism serves; the prose is graded with the diagram, not beside it.',
  satisfiedBy: ({ graph, narrative }) => {
    if (graph.nodes.length < MIN_NODES_FOR_SUBSTANCE) return met([]);
    const story = creditableStory(graph, narrative);
    if (story === null) return unmet([], [], uncreditableDetail(graph, narrative));
    const words = story.split(/\s+/).filter(Boolean).length;
    if (words >= MIN_NARRATIVE_WORDS) return met([]);
    return unmet(
      [],
      [],
      `The narrative is ${words} word${words === 1 ? '' : 's'} for a canvas of ${
        graph.nodes.length
      } components — a couple of sentences cannot explain a system. Say what each component is for, how a request travels between them, and which requirement each mechanism serves; the prose is graded with the diagram, not beside it.`,
    );
  },
};

/**
 * Every other check in this bank is a substring test, which a bare list of
 * the words they look for satisfies perfectly. This one grades the SHAPE of
 * the writing — real sentences, and the connective tissue only sentences
 * have — so that naming the components is not the same as explaining them.
 * It cannot judge whether the prose is any good; that is the LLM narrative
 * critic's job, and its findings stay advisory by design.
 */
const writtenAsProse: Expectation = {
  id: 'exp.nar.written-as-prose',
  dimension: 'communication',
  weight: 1,
  severityIfUnmet: 'medium',
  minDifficulty: 'intro',
  archetypes: 'all',
  requiresNarrative: true,
  title: 'A list of the right words, not an explanation',
  teach: () =>
    `The narrative does not read as prose: an explanation needs at least ${MIN_PROSE_SENTENCES} real sentences that connect the components to each other, not a list of component names and requirement keywords. Say what each piece does, in sentences a reader could follow aloud — the checklist is a scaffold, not the answer.`,
  satisfiedBy: ({ narrative }) => (readsAsProse(narrative ?? '') ? met([]) : unmet()),
};

/**
 * One expectation per NFR kind the prompt carries: the story must engage
 * with the requirement in its own vocabulary. `nfrKind` both gates
 * applicability and resolves the nfrId citation on the unmet finding.
 */
function addressesKind(kind: NfrKind): Expectation {
  return {
    id: `exp.nar.addresses-${kind}`,
    dimension: 'communication',
    weight: 1,
    severityIfUnmet: 'low',
    nfrKind: kind,
    minDifficulty: 'intro',
    archetypes: 'all',
    requiresNarrative: true,
    title: `A story silent on the ${kind} requirement`,
    teach: (facts) => {
      const nfr = facts.nfrs.find((candidate) => candidate.kind === kind);
      const demand = nfr
        ? `The prompt demands "${nfr.statement}"${nfr.target ? ` (${nfr.target})` : ''}`
        : `The prompt carries a ${kind} requirement`;
      return `${demand}, but the narrative never engages with it — no sentence says which mechanism holds that line. Name the component that carries this requirement and how it does so; a design that meets a requirement silently is indistinguishable from one that forgot it.`;
    },
    satisfiedBy: ({ graph, narrative }) => {
      const story = creditableStory(graph, narrative);
      if (story === null) return unmet([], [], uncreditableDetail(graph, narrative));
      return unaddressedNfrKinds([kind], story).length === 0 ? met([]) : unmet();
    },
  };
}

export const narrativeExpectations: Expectation[] = [
  narrativePresent,
  componentsExplained,
  flowStory,
  substance,
  writtenAsProse,
  ...NFR_KINDS.map(addressesKind),
];
