import {
  GOVCON_TOPICS,
  tierAtLeast,
  type AlertPolicy,
  type GovconAlert,
  type Lead,
} from '@sysdesign/contracts';

import type { DigestKind } from './digest';

/** What these alerts are called in the digest a person reads. */
export const LEADS_DIGEST: DigestKind = {
  origin: 'govcon.leads',
  one: 'new lead',
  many: 'new leads',
};

/**
 * One alert per ranked lead in the tier the profile asks to hear about, or a
 * better one, keyed by its notice — so a notice is raised once, however often
 * it is ranked again. A policy with no tier raises none. The leads come in
 * already ranked: what a gate of the profile's keeps off its list is not
 * among them, so nothing is raised that the list would not show.
 */
export function newLeadAlerts(
  leads: readonly Lead[],
  policy: AlertPolicy,
  profileId: string,
): GovconAlert[] {
  const floor = policy.newLeadTier;
  if (floor === null) return [];
  return leads.flatMap((lead) => {
    if (lead.tier === null || !tierAtLeast(lead.tier, floor)) return [];
    const { opportunity } = lead;
    return [
      {
        topic: GOVCON_TOPICS.leadNew,
        key: { kind: 'lead-new' as const, subject: opportunity.noticeId },
        payload: {
          profileId,
          noticeId: opportunity.noticeId,
          title: opportunity.title,
          noticeType: opportunity.noticeType,
          agencyPath: opportunity.agencyPath,
          naicsCode: opportunity.naicsCode,
          responseDeadlineAt: opportunity.responseDeadlineAt,
          score: lead.score,
          tier: lead.tier,
        },
      },
    ];
  });
}
