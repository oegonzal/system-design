/**
 * Brief↔diagram alignment rules. Where the brief bank EARNS explanation (did
 * the author account for the design?), these SUBTRACT for claims the canvas
 * refuses to support. The entire pack is gated on a submitted brief, so a
 * diagram without one is graded exactly as before.
 *
 * Severity follows how much the canvas disagrees, which is a distinction the
 * old prose rules could not make: the diagram saying the OPPOSITE of a claim
 * is worse than the diagram saying nothing about it.
 */
import { briefHasClaims } from '@sysdesign/contracts';

import { judgeBrief, type BindingVerdict } from '../mechanisms';
import type { EvalRule, RuleContext, RuleFinding } from '../types';
import { uniqueSorted } from './shared';

/** The gate every rule in this pack shares. */
function verdictsFor(ctx: RuleContext): BindingVerdict[] {
  if (!briefHasClaims(ctx.brief)) return [];
  return judgeBrief(ctx.index, ctx.brief);
}

const labelFor = (ctx: RuleContext, id: string) => ctx.index.byId(id)?.label ?? id;
const labelList = (ctx: RuleContext, ids: readonly string[]) =>
  ids.map((id) => `"${labelFor(ctx, id)}"`).join(', ');

const bindingContradicted: EvalRule = {
  id: 'explanation.binding-contradicted',
  dimension: 'explanation',
  check(ctx) {
    const findings: RuleFinding[] = [];
    for (const verdict of verdictsFor(ctx)) {
      if (verdict.contradicted.length === 0) continue;
      findings.push({
        ruleId: bindingContradicted.id,
        dimension: 'explanation',
        severity: 'high',
        title: `The canvas contradicts the ${verdict.binding.mechanism} claim`,
        message: `The brief binds ${verdict.binding.mechanism} to ${labelList(ctx, verdict.contradicted)}, but ${verdict.contradicted.length === 1 ? 'that component is' : 'those components are'} configured to do the opposite. A reader cannot trust either artifact when they disagree: fix the configuration if the claim is right, or drop the claim if the configuration is.`,
        affectedNodeIds: [...verdict.contradicted].sort(),
        affectedEdgeIds: [],
        suggestion: null,
      });
    }
    return findings;
  },
};

const unbackedBinding: EvalRule = {
  id: 'explanation.unbacked-binding',
  dimension: 'explanation',
  check(ctx) {
    const findings: RuleFinding[] = [];
    for (const verdict of verdictsFor(ctx)) {
      if (verdict.corroborated.length > 0 || verdict.contradicted.length > 0) continue;
      findings.push({
        ruleId: unbackedBinding.id,
        dimension: 'explanation',
        severity: 'medium',
        title: `Nothing on the canvas provides ${verdict.binding.mechanism}`,
        message: `The brief binds ${verdict.binding.mechanism} to ${labelList(ctx, verdict.binding.nodeIds)}, and the diagram shows no component providing it — no configuration declares it and no structure demonstrates it. Draw or configure the mechanism so the claim can be checked, or bind the requirement to whatever actually holds it.`,
        affectedNodeIds: [...verdict.binding.nodeIds].sort(),
        affectedEdgeIds: [],
        suggestion: null,
      });
    }
    return findings;
  },
};

const shotgunBinding: EvalRule = {
  id: 'explanation.shotgun-binding',
  dimension: 'explanation',
  check(ctx) {
    const findings: RuleFinding[] = [];
    for (const verdict of verdictsFor(ctx)) {
      // Only when the claim is partly right: a wholly unbacked binding is the
      // rule above, and charging both would teach one lesson twice.
      if (verdict.corroborated.length === 0) continue;
      if (verdict.uncorroborated.length <= verdict.corroborated.length) continue;
      findings.push({
        ruleId: shotgunBinding.id,
        dimension: 'explanation',
        severity: 'low',
        title: `The ${verdict.binding.mechanism} claim names more than holds it`,
        message: `Of the components bound to ${verdict.binding.mechanism}, ${verdict.corroborated.length} provide${verdict.corroborated.length === 1 ? 's' : ''} it and ${verdict.uncorroborated.length} do not — ${labelList(ctx, verdict.uncorroborated)}. Naming everything is the structural form of a vague answer: bind the components that carry the requirement, not the ones near it.`,
        affectedNodeIds: [...verdict.uncorroborated].sort(),
        affectedEdgeIds: [],
        suggestion: null,
      });
    }
    return findings;
  },
};

const unclaimedMechanism: EvalRule = {
  id: 'explanation.unclaimed-mechanism',
  dimension: 'explanation',
  check(ctx) {
    const unclaimed = uniqueSorted(verdictsFor(ctx).flatMap((verdict) => verdict.unclaimed));
    if (unclaimed.length === 0) return [];
    return [
      {
        ruleId: unclaimedMechanism.id,
        dimension: 'explanation',
        // Informational by design: taking no credit for something is not a
        // defect, it is an opportunity the author probably wants pointed out.
        severity: 'info',
        title: 'Mechanisms you built and never claimed',
        message: `The diagram demonstrates capabilities no binding takes credit for, on ${labelList(ctx, unclaimed)}. If these hold one of the prompt's requirements, say so — an interviewer marks what you can point at, not what happens to be on the board.`,
        affectedNodeIds: unclaimed,
        affectedEdgeIds: [],
        suggestion: null,
      },
    ];
  },
};

export const briefRules: EvalRule[] = [
  bindingContradicted,
  unbackedBinding,
  shotgunBinding,
  unclaimedMechanism,
];
