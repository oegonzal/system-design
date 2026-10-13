import {
  MAX_AGENCY_OFFICES,
  type AgencyOfficesRequest,
  type AgencyOutlook,
  type AwardFamilyChoice,
} from '@sysdesign/contracts';

import { agencyNamed, alignAgencyYears } from '../agency';
import type { LensBody, LensSpec } from '../lens';
import { agencyBodySchema } from '../schemas';
import { disclosuresOf, missing, spend, type LensDeps } from './deps';
import { directoryLens } from './directory';
import { asOfFrom } from './shared';

export interface AgencyQuery {
  toptierCode: string;
  fiscalYear: number;
  awardFamily: AwardFamilyChoice;
}

/**
 * One agency's headroom: its budgetary resources, obligations and outlays
 * by fiscal year with the cadence by period, and its sub-agencies and
 * offices for the year asked, with their new-award counts.
 */
export const agencyLens = (deps: LensDeps): LensSpec<AgencyQuery, LensBody<AgencyOutlook>> => ({
  lens: 'agency',
  source: deps.sources.budgets.id,
  schema: agencyBodySchema,
  disclosures: disclosuresOf(deps.sources.budgets, deps.sources.offices),
  async load(query) {
    const directory = await deps.read(directoryLens(deps), {});
    if (directory.kind !== 'ok') return directory;
    const entry = agencyNamed(directory.body.entries, query.toptierCode);
    if (entry === null) return missing('agency', query.toptierCode);
    const tally = { requests: 0 };

    const budgetRequest = { toptierCode: query.toptierCode };
    const budgets = await spend(
      deps,
      tally,
      { source: deps.sources.budgets.id, operation: 'agency-budget', query: budgetRequest },
      () => deps.sources.budgets.budgets(budgetRequest),
    );
    if (budgets.kind !== 'ok') return budgets;

    const officesRequest: AgencyOfficesRequest = {
      toptierCode: query.toptierCode,
      fiscalYear: query.fiscalYear,
      awardFamily: query.awardFamily,
      limit: MAX_AGENCY_OFFICES,
      page: 1,
    };
    const offices = await spend(
      deps,
      tally,
      { source: deps.sources.offices.id, operation: 'agency-offices', query: officesRequest },
      () => deps.sources.offices.offices(officesRequest),
    );
    if (offices.kind !== 'ok') return offices;

    return {
      kind: 'ok',
      body: {
        toptierCode: query.toptierCode,
        name: entry.name,
        abbreviation: entry.abbreviation.length > 0 ? entry.abbreviation : null,
        years: alignAgencyYears(budgets.value),
        officesFiscalYear: query.fiscalYear,
        awardFamily: query.awardFamily,
        subAgencies: offices.value.subAgencies,
        truncated: offices.value.hasMore,
      },
      asOf: await asOfFrom(deps),
      requests: tally.requests,
    };
  },
});
