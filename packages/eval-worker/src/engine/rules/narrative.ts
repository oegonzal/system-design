/**
 * Narrative rules: once the author submits a design narrative — prose that
 * explains what each component is for and how they work together — that story
 * becomes graded evidence against the diagram. The ENTIRE pack is
 * feature-gated on a non-blank narrative, so a canvas submitted without prose
 * is graded exactly as before. Coverage is decided by the shared
 * `unmentionedNodeLabels` helper, the same one the UI shows the author, so a
 * submission is never graded against a different notion of coverage than the
 * one on screen. Predicates are deliberately conservative — word counts and
 * literal substrings, never fuzzy NLP.
 */
import { unmentionedNodeLabels } from '@sysdesign/contracts';

import type { EvalRule, RuleFinding } from '../types';
import { uniqueSorted } from './shared';

/** The gate every rule in this pack shares: null or blank prose → silent. */
function presentNarrative(narrative: string | null): string | null {
  const trimmed = narrative?.trim() ?? '';
  return trimmed.length === 0 ? null : trimmed;
}

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

const unexplainedComponents: EvalRule = {
  id: 'hygiene.narrative-unexplained-components',
  dimension: 'hygiene',
  check({ graph, narrative }) {
    const story = presentNarrative(narrative);
    if (story === null) return [];
    const missing = unmentionedNodeLabels(graph, story);
    if (missing.length === 0) return [];
    const missingKeys = new Set(missing.map((label) => label.toLowerCase()));
    const affected = graph.nodes
      .filter((node) => missingKeys.has(node.label.trim().toLowerCase()))
      .map((node) => node.id);
    const finding: RuleFinding = {
      ruleId: unexplainedComponents.id,
      dimension: 'hygiene',
      severity: 'medium',
      title: 'Components the narrative never explains',
      message: `The narrative never mentions ${formatLabels(missing)} — ${
        missing.length === 1 ? 'a component' : `${missing.length} components`
      } the diagram depends on ${missing.length === 1 ? 'has' : 'have'} no sentence saying what ${
        missing.length === 1 ? 'it is' : 'they are'
      } for. A reader should find every component in the story: a box the prose skips reads as either unexplained thinking or an unnecessary box. Extend the narrative until each remaining component earns its place.`,
      affectedNodeIds: uniqueSorted(affected),
      affectedEdgeIds: [],
      suggestion: null,
    };
    return [finding];
  },
};

/** Below this, prose cannot be explaining a multi-component system. */
const MIN_NARRATIVE_WORDS = 30;
/** Canvases smaller than this may legitimately need only a sentence. */
const MIN_NODES_FOR_THIN = 3;

const tooThin: EvalRule = {
  id: 'hygiene.narrative-too-thin',
  dimension: 'hygiene',
  check({ graph, narrative }) {
    const story = presentNarrative(narrative);
    if (story === null) return [];
    if (graph.nodes.length < MIN_NODES_FOR_THIN) return [];
    const words = story.split(/\s+/).length;
    if (words >= MIN_NARRATIVE_WORDS) return [];
    return [
      {
        ruleId: tooThin.id,
        dimension: 'hygiene',
        severity: 'low',
        title: 'A narrative too thin to explain the design',
        message: `The narrative is ${words} word${words === 1 ? '' : 's'} for a canvas of ${
          graph.nodes.length
        } components — a couple of sentences cannot explain a system. Say what each component is for, how a request travels between them, and which requirement each mechanism serves; the prose is graded with the diagram, not beside it.`,
        affectedNodeIds: [],
        affectedEdgeIds: [],
        suggestion: null,
      },
    ];
  },
};

/** Verbs whose presence shows the story describes movement, not just parts. */
const FLOW_VERBS = [
  'calls',
  'sends',
  'publishes',
  'consumes',
  'reads',
  'writes',
  'streams',
  'routes',
  'queues',
  'caches',
  'replicates',
  'drains',
] as const;

const noFlowStory: EvalRule = {
  id: 'hygiene.narrative-no-flow-story',
  dimension: 'hygiene',
  check({ graph, narrative }) {
    const story = presentNarrative(narrative);
    if (story === null) return [];
    if (graph.edges.length === 0) return [];
    const haystack = story.toLowerCase();
    if (FLOW_VERBS.some((verb) => haystack.includes(verb))) return [];
    return [
      {
        ruleId: noFlowStory.id,
        dimension: 'hygiene',
        severity: 'info',
        title: 'A story that names parts but never says how they talk',
        message: `The canvas draws ${graph.edges.length} edge${
          graph.edges.length === 1 ? '' : 's'
        }, yet the narrative never uses a flow verb — calls, sends, publishes, consumes, reads, writes — so the story names parts but never says how they talk. Walk one request through the arrows: who calls whom, what is written where, and what flows back. The arrows are the design; the prose should narrate them.`,
        affectedNodeIds: [],
        affectedEdgeIds: [],
        suggestion: null,
      },
    ];
  },
};

export const narrativeRules: EvalRule[] = [unexplainedComponents, tooThin, noFlowStory];
