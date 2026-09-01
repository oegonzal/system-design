/**
 * The brief bank: what a design brief must do to earn the explanation
 * dimension.
 *
 * Every check here is a set operation over ids. The author names the
 * components that hold a requirement; the engine independently computes which
 * components demonstrate that mechanism and intersects the two. Nothing is
 * matched as text, so the grade is stable under renaming a box, rewording a
 * requirement, or writing in another language — and unstable under claiming
 * something the canvas does not do, which is the sensitivity a grading
 * predicate is supposed to have.
 *
 * `exp.brf.present` applies whether or not a brief was submitted, so silence
 * scores 0 rather than dropping the dimension out of the rubric.
 */
import {
  ANNOTATION_KINDS,
  FLOW_SINK_KINDS,
  NFR_KINDS,
  briefHasClaims,
  type NfrKind,
} from '@sysdesign/contracts';

import {
  bindingBackedNodeIds,
  corroboratedBindings,
  flowTouchedNodeIds,
  judgeBrief,
} from '../../../mechanisms';
import { sortById, uniqueSorted } from '../../../rules/shared';
import type { Expectation } from '../types';
import { met, unmet } from '../types';

// `ANNOTATION_KINDS` and `FLOW_SINK_KINDS` come from contracts so the brief
// editor guides the author by the same vocabulary this grades with.

function labelsOf(ids: readonly string[], byId: (id: string) => { label: string } | undefined) {
  const named = ids
    .slice(0, 5)
    .map((id) => `"${byId(id)?.label ?? id}"`)
    .join(', ');
  const elided = ids.length - Math.min(ids.length, 5);
  return elided > 0 ? `${named} +${elided} more` : named;
}

const briefPresent: Expectation = {
  id: 'exp.brf.present',
  dimension: 'explanation',
  weight: 1,
  severityIfUnmet: 'high',
  minDifficulty: 'intro',
  archetypes: 'all',
  requiresBrief: true,
  appliesWithoutBrief: true,
  title: 'The design explains nothing',
  teach: () =>
    'No brief was submitted, so the diagram has to speak for itself — and boxes never do. Bind each requirement to the components that hold it and trace one request through the arrows. That is the part of an interview you are actually marked on: not that the pieces exist, but that you can say which piece holds which promise.',
  satisfiedBy: ({ brief }) => (briefHasClaims(brief) ? met([]) : unmet()),
};

/**
 * The anti-bloat check, and the reason a component now costs something. A box
 * earns its place by being on a traced flow, by being vouched for by a binding
 * the canvas CORROBORATES, or by declaring a responsibility. Membership in an
 * uncorroborated binding is worth nothing — otherwise naming every node in
 * every binding would account for the whole canvas for free.
 */
const componentsAccounted: Expectation = {
  id: 'exp.brf.components-accounted',
  dimension: 'explanation',
  weight: 3,
  severityIfUnmet: 'medium',
  minDifficulty: 'intro',
  archetypes: 'all',
  requiresBrief: true,
  title: 'Components nothing in the design accounts for',
  teach: () =>
    'Every component should be there for a reason a reader can find: on a traced flow, holding a bound requirement, or declaring what it is responsible for. A box none of those reach is either unexplained thinking or an unnecessary box, and a reviewer cannot tell which.',
  satisfiedBy: ({ graph, index, brief }) => {
    const verdicts = judgeBrief(index, brief);
    const backed = bindingBackedNodeIds(verdicts);
    const touched = flowTouchedNodeIds(index, brief);

    const unaccounted = sortById(
      graph.nodes.filter((node) => {
        if (ANNOTATION_KINDS.includes(node.kind)) return false;
        if (backed.has(node.id) || touched.has(node.id)) return false;
        return (node.responsibilities ?? []).length === 0;
      }),
    );

    if (unaccounted.length === 0) {
      return met(uniqueSorted(graph.nodes.map((node) => node.id)));
    }
    const ids = unaccounted.map((node) => node.id);
    return unmet(
      ids,
      [],
      `${labelsOf(ids, (id) => index.byId(id))} ${
        ids.length === 1 ? 'is on the canvas but nothing' : 'are on the canvas but nothing'
      } accounts for ${ids.length === 1 ? 'it' : 'them'} — no traced flow passes through, no corroborated binding names ${ids.length === 1 ? 'it' : 'them'}, and ${ids.length === 1 ? 'it declares' : 'they declare'} no responsibility. Bind ${ids.length === 1 ? 'it' : 'them'} to the requirement ${ids.length === 1 ? 'it holds' : 'they hold'}, route a flow through, or remove ${ids.length === 1 ? 'it' : 'them'}.`,
    );
  },
};

const flowsTraced: Expectation = {
  id: 'exp.brf.flows-traced',
  dimension: 'explanation',
  weight: 2,
  severityIfUnmet: 'medium',
  minDifficulty: 'intro',
  archetypes: 'all',
  requiresBrief: true,
  title: 'No request is traced end to end',
  teach: () =>
    'Trace at least one request from the client to the thing that stores its result. A design is a set of promises about what happens to a request; a reviewer follows the arrows to check them, and a brief with no traced path leaves that walk to be guessed.',
  satisfiedBy: ({ index, brief }) => {
    if (brief === null) return unmet();
    const complete = brief.flows.filter((flow) => {
      const edges = flow.path.map((edgeId) =>
        index.edges().find((candidate) => candidate.id === edgeId),
      );
      if (edges.length === 0 || edges.some((edge) => edge === undefined)) return false;
      // Connected walk, checked here too — the API rejects a broken path, but
      // the engine never assumes another layer did its job.
      for (let step = 1; step < edges.length; step += 1) {
        if (edges[step]?.source !== edges[step - 1]?.target) return false;
      }
      const first = index.byId(edges[0]?.source ?? '');
      const last = index.byId(edges[edges.length - 1]?.target ?? '');
      return first?.kind === 'client' && last !== undefined && FLOW_SINK_KINDS.includes(last.kind);
    });

    if (complete.length === 0) return unmet();
    return met(
      uniqueSorted(
        complete.flatMap((flow) =>
          flow.path.flatMap((edgeId) => {
            const edge = index.edges().find((candidate) => candidate.id === edgeId);
            return edge ? [edge.source, edge.target] : [];
          }),
        ),
      ),
      uniqueSorted(complete.flatMap((flow) => flow.path)),
    );
  },
};

const flowsCoverFunctionals: Expectation = {
  id: 'exp.brf.flows-cover-functionals',
  dimension: 'explanation',
  weight: 1,
  severityIfUnmet: 'low',
  minDifficulty: 'standard',
  archetypes: 'all',
  requiresBrief: true,
  title: 'Functional requirements no flow accounts for',
  teach: (facts) =>
    `The prompt asks for ${facts.functionalRequirementCount} things the system must do. Each one should be a path a reader can follow on the canvas — if a requirement has no flow, either the design does not serve it or the diagram does not show how.`,
  satisfiedBy: ({ facts, brief }) => {
    if (brief === null) return unmet();
    const claimed = new Set(brief.flows.map((flow) => flow.requirementIndex));
    const missing: number[] = [];
    for (let index = 0; index < facts.functionalRequirementCount; index += 1) {
      if (!claimed.has(index)) missing.push(index);
    }
    if (missing.length === 0) return met([]);
    return unmet(
      [],
      [],
      `${missing.length} of the prompt's ${facts.functionalRequirementCount} functional requirements have no traced flow. Every thing the system must do should be a path through the diagram, or the diagram is not yet an answer to this prompt.`,
    );
  },
};

/**
 * The check that stops a token brief scoring like a real one: it is met only
 * when every requirement kind carries a binding, every binding is backed, and
 * none is contradicted. Never vacuously true.
 */
const mechanismsCorroborated: Expectation = {
  id: 'exp.brf.mechanisms-corroborated',
  dimension: 'explanation',
  weight: 2,
  severityIfUnmet: 'high',
  minDifficulty: 'intro',
  archetypes: 'all',
  requiresBrief: true,
  title: 'Claims the diagram does not back up',
  teach: () =>
    'A binding is a claim about your own canvas, and the engine checks it against the canvas rather than taking your word for it. Every requirement should carry a binding, every binding should name components that actually provide the mechanism, and none should name a component configured to do the opposite.',
  satisfiedBy: ({ facts, index, brief }) => {
    if (!briefHasClaims(brief)) return unmet();
    const verdicts = judgeBrief(index, brief);
    if (verdicts.length === 0) return unmet();

    const boundKinds = new Set(
      verdicts
        .filter((verdict) => verdict.corroborated.length > 0)
        .map((verdict) => facts.nfrs.find((nfr) => nfr.id === verdict.binding.nfrId)?.kind)
        .filter((kind): kind is NfrKind => kind !== undefined),
    );
    const missingKinds = facts.nfrKinds.filter((kind) => !boundKinds.has(kind));
    const unbacked = verdicts.filter(
      (verdict) => verdict.corroborated.length === 0 || verdict.contradicted.length > 0,
    );

    if (missingKinds.length === 0 && unbacked.length === 0) {
      return met(uniqueSorted(verdicts.flatMap((verdict) => verdict.corroborated)));
    }
    const parts: string[] = [];
    if (missingKinds.length > 0) {
      parts.push(`no corroborated binding covers ${missingKinds.join(', ')}`);
    }
    if (unbacked.length > 0) {
      parts.push(
        `${unbacked.length} binding${unbacked.length === 1 ? '' : 's'} the canvas does not support`,
      );
    }
    return unmet(
      uniqueSorted(unbacked.flatMap((verdict) => verdict.binding.nodeIds)),
      [],
      `The brief does not hold up against the diagram: ${parts.join(', and ')}. A claim the canvas cannot back is the one an interviewer probes first.`,
    );
  },
};

/**
 * One expectation per NFR kind the prompt carries. `nfrKind` both gates
 * applicability and resolves the nfrId citation on the unmet finding, so the
 * author is told exactly which requirement went unbound.
 */
function bindsKind(kind: NfrKind): Expectation {
  return {
    id: `exp.brf.binds-${kind}`,
    dimension: 'explanation',
    weight: 1,
    severityIfUnmet: 'low',
    nfrKind: kind,
    minDifficulty: 'intro',
    archetypes: 'all',
    requiresBrief: true,
    title: `The ${kind} requirement is bound to nothing`,
    teach: (facts) => {
      const nfr = facts.nfrs.find((candidate) => candidate.kind === kind);
      const demand = nfr
        ? `The prompt demands "${nfr.statement}"${nfr.target ? ` (${nfr.target})` : ''}`
        : `The prompt carries a ${kind} requirement`;
      return `${demand}, and no binding names a component that holds it. Say which part of your design carries this requirement and by what mechanism — a requirement met by accident is indistinguishable from one that was forgotten.`;
    },
    satisfiedBy: ({ facts, index, brief }) => {
      if (!briefHasClaims(brief)) return unmet();
      const idsOfKind = new Set(facts.nfrs.filter((nfr) => nfr.kind === kind).map((nfr) => nfr.id));
      const backing = corroboratedBindings(judgeBrief(index, brief)).filter((verdict) =>
        idsOfKind.has(verdict.binding.nfrId),
      );
      if (backing.length === 0) return unmet();
      return met(uniqueSorted(backing.flatMap((verdict) => verdict.corroborated)));
    },
  };
}

export const briefExpectations: Expectation[] = [
  briefPresent,
  componentsAccounted,
  flowsTraced,
  flowsCoverFunctionals,
  mechanismsCorroborated,
  ...NFR_KINDS.map(bindsKind),
];
