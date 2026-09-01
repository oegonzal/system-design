/**
 * The narrative bank: what a design narrative must do to earn the
 * communication dimension. Every expectation here is `requiresNarrative` —
 * without prose none applies, communication scores null ("Not assessed"),
 * and a diagram-only submission is graded exactly as before.
 *
 * Coverage is decided by the shared contracts helpers (`unmentionedNodeLabels`,
 * `hasFlowStory`, `unaddressedNfrKinds`) — the same ones the editor's live
 * checklist shows the author, so a submission is never graded against a
 * different notion of coverage than the one on screen.
 */
import {
  NFR_KINDS,
  hasFlowStory,
  unaddressedNfrKinds,
  unmentionedNodeLabels,
} from '@sysdesign/contracts';
import type { NfrKind } from '@sysdesign/contracts';

import { uniqueSorted } from '../../../rules/shared';
import type { Expectation } from '../types';
import { met, unmet } from '../types';

/** Labels are named up to this many; the rest collapse into "+N more". */
const MAX_NAMED_LABELS = 5;

function formatLabels(labels: readonly string[]): string {
  const named = labels
    .slice(0, MAX_NAMED_LABELS)
    .map((label) => `"${label}"`)
    .join(', ');
  const elided = labels.length - Math.min(labels.length, MAX_NAMED_LABELS);
  return elided > 0 ? `${named} +${elided} more` : named;
}

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
    const story = narrative ?? '';
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
    // A canvas with no edges has no flows to narrate.
    if (graph.edges.length === 0 || hasFlowStory(narrative ?? '')) return met([]);
    return unmet();
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
    const words = (narrative ?? '').split(/\s+/).filter(Boolean).length;
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
    satisfiedBy: ({ narrative }) =>
      unaddressedNfrKinds([kind], narrative ?? '').length === 0 ? met([]) : unmet(),
  };
}

export const narrativeExpectations: Expectation[] = [
  componentsExplained,
  flowStory,
  substance,
  ...NFR_KINDS.map(addressesKind),
];
