/**
 * The engine's half of every prompt. A pipeline's md persona says what a lens
 * knows; this file says how it must behave — cite only listed ids, answer in
 * the schema, be complete and concise — and renders the sections every stage
 * shares. The goal reaches the model from here and from nowhere else, less
 * the index section its composer wrote for the validators.
 */
import type {
  ArtifactLocation,
  RemediationNote,
  SuccessCriterion,
  UpstreamEvidence,
  ValidationReport,
} from '@sysdesign/contracts';
import { stripIndexSection } from '@sysdesign/contracts';

import { capText } from '@sysdesign/run-dump';

import { GOAL_MAX_BYTES } from '../contracts';
import { actionable } from '../controllers/context';
import type { AdvisoryMemory, UpstreamEvidenceBundle } from '../ports';

const RULES: Record<'criteria' | 'producer' | 'critic' | 'evaluator', readonly string[]> = {
  criteria: [
    'Extract the success criteria the goal states or clearly implies. Classify each by the listed kinds.',
    'Never invent a requirement the goal does not support; never merge two distinct requirements.',
  ],
  producer: [
    'Produce the artifact in the required structure. Every field is read by expert judges against criteria derived from the goal.',
    'Be concrete and specific to the goal; state assumptions instead of hiding them.',
  ],
  critic: [
    'Report DEFECTS only: what is wrong, where it is, how severe, how sure you are, and how fixable.',
    'Cite locations and criteria only by the listed ids. Never restate a listed validation problem.',
    'Fewer, sharper findings beat many weak ones. An empty list is a valid answer.',
  ],
  evaluator: [
    'Judge how well the artifact satisfies each listed criterion, one result per criterion, in order.',
    'Cite the artifact parts that are your evidence by their listed ids. Judge the artifact, not its prose style.',
  ],
};

/**
 * What a reply is held to, as the seam holds it: a size is an ask, a
 * structural fault a refusal that is named before the next ask.
 */
const OUTPUT_RULE = [
  'Reply with ONE complete JSON object that satisfies the schema — nothing else.',
  'Each maxLength and maxItems is the size asked for: write to fit it. A string a little over is accepted and noted; a list over is cut to size from its end; a wrong type, a missing field, an unknown id or enum value, or an empty required string refuses the whole reply and you will be asked again with the fault named.',
].join(' ');

export function systemPrompt(role: keyof typeof RULES, persona: string): string {
  return [persona.trim(), '', ...RULES[role], OUTPUT_RULE].join('\n');
}

export interface GoalSection {
  text: string;
  clipped: boolean;
}

/**
 * The goal under a heading, without the index section its composer wrote for
 * the validators: a model reading the index reads the engine's bookkeeping
 * instead of the task, and the validators read the goal as stored.
 */
export function goalSection(goal: string): GoalSection {
  const capped = capText(stripIndexSection(goal), GOAL_MAX_BYTES);
  return {
    text: ['# Goal', '', capped.text, capped.truncated ? '\n[goal truncated]' : ''].join('\n'),
    clipped: capped.truncated,
  };
}

export function kindsSection(kinds: Readonly<Record<string, string>>): string {
  return [
    '# Criterion kinds',
    '',
    ...Object.entries(kinds).map(([id, meaning]) => `- ${id}: ${meaning}`),
  ].join('\n');
}

/**
 * The criteria the pipeline declares for every goal of its kind, shown to the
 * deriver so it derives what the goal adds and never restates these. Empty
 * when the pipeline declares none, so the prompt says nothing about them.
 */
export function fixedCriteriaSection(
  fixed: readonly { kind: string; statement: string }[],
): string | null {
  if (fixed.length === 0) return null;
  return [
    '# Criteria already on the checklist',
    '',
    'These head every checklist of this pipeline and are graded with the rest. Do not restate them; derive only what the goal adds.',
    '',
    ...fixed.map((criterion) => `- [${criterion.kind}] ${criterion.statement}`),
  ].join('\n');
}

export function typesSection(types: Readonly<Record<string, string>>): string {
  return [
    '# Finding types',
    '',
    ...Object.entries(types).map(([id, meaning]) => `- ${id}: ${meaning}`),
  ].join('\n');
}

export function criteriaSection(criteria: readonly SuccessCriterion[]): string {
  const lines = criteria.map(
    (criterion) => `- ${criterion.id} [${criterion.kind}] ${criterion.statement}`,
  );
  return ['# Success criteria', '', ...(lines.length > 0 ? lines : ['(none)'])].join('\n');
}

export function artifactSection(rendered: string): string {
  return ['# Artifact', '', rendered].join('\n');
}

export function locationsSection(locations: readonly ArtifactLocation[]): string {
  return [
    '# Locations you may cite',
    '',
    ...locations.map((location) => `- ${location.id} — ${location.label}`),
  ].join('\n');
}

/**
 * What deterministic validators already found — a critic must add, not
 * repeat. "Already counted" is true by construction: the problems listed are
 * the ones the controller acts on, chosen by its own predicate, so one that
 * only informs — a field past the size it was asked for — is on the record
 * and never in a judge's prompt.
 */
export function validationSection(validation: readonly ValidationReport[]): string {
  const lines = validation.flatMap((report) =>
    report.problems
      .filter(actionable)
      .map((problem) => `- [${report.validatorId}] ${problem.message}`),
  );
  return [
    '# Known validation problems (already counted)',
    '',
    ...(lines.length > 0 ? lines : ['(none)']),
  ].join('\n');
}

/** The heading the producer's advisory memories sit under — and that no other stage's prompt contains. */
export const MEMORIES_HEADING = '# Lessons from earlier runs (advisory)';

const MEMORIES_LEAD =
  'Lessons earlier runs taught, recalled for this goal and curated before you see them. They are advice, not requirements: no success criterion comes from them, the goal and the criteria win wherever they differ, and a lesson that does not fit this goal is left out.';

/**
 * A run's advisory memories, for the producer only. The lead travels with
 * them, so a producer handed none is told nothing about memory at all.
 */
export function memoriesSection(memories: readonly AdvisoryMemory[]): string {
  return [
    MEMORIES_HEADING,
    '',
    MEMORIES_LEAD,
    '',
    ...memories.map((memory) => `- [${memory.ref}] ${memory.text}`),
  ].join('\n');
}

export function remediationsSection(heading: string, notes: readonly RemediationNote[]): string {
  const lines = notes.map(
    (note) =>
      `- [${note.severity}] ${note.note}${note.targetRefs.length > 0 ? ` (at: ${note.targetRefs.join(', ')})` : ''}`,
  );
  return [`# ${heading}`, '', ...(lines.length > 0 ? lines : ['(none)'])].join('\n');
}

/**
 * What the wave before confirmed, for a lens that declared it consumes it. The
 * instruction travels with the evidence rather than living in a role rule, so
 * a lens that consumes nothing is told nothing.
 */
export function upstreamSections(
  bundle: UpstreamEvidenceBundle,
  consumes: readonly UpstreamEvidence[],
): string[] {
  const sections: string[] = [];
  if (consumes.includes('findings')) {
    const lines = bundle.findings.map((finding) => {
      const at = finding.locationRefs.length > 0 ? finding.locationRefs.join(', ') : '(unlocated)';
      const names =
        finding.criterionIds.length > 0 ? ` → criteria ${finding.criterionIds.join(', ')}` : '';
      const why = finding.rationale ? `\n  ${finding.rationale}` : '';
      return `- [${finding.severity}] ${finding.type} at ${at}${names}${why}`;
    });
    sections.push(
      [
        '# Confirmed upstream defects',
        '',
        'Independent samples agreed on each of these. A criterion one of them names is at most partial unless you show the defect does not touch it.',
        '',
        ...(lines.length > 0 ? lines : ['(none confirmed)']),
      ].join('\n'),
    );
  }
  if (consumes.includes('results')) {
    const lines = bundle.results.map(
      (evidence) => `- ${evidence.criterionId} [${evidence.kind}]: ${evidence.result}`,
    );
    sections.push(
      ['# Upstream criterion results', '', ...(lines.length > 0 ? lines : ['(none yet)'])].join(
        '\n',
      ),
    );
  }
  return sections;
}

export const joinSections = (...sections: readonly string[]): string => sections.join('\n\n');
