import type { AwardFamilyChoice, ScopeQuery } from '@sysdesign/contracts';

import { codesOf } from '../codes';

/** The scope as the bar holds it: code lists as typed, the agency's toptier code, the family. */
export interface ScopeDraft {
  naics: string;
  psc: string;
  agency: string;
  awardFamily: AwardFamilyChoice;
}

export const EMPTY_SCOPE: ScopeDraft = { naics: '', psc: '', agency: '', awardFamily: 'both' };

/** One code in or out of a typed list, the rest kept as they were. */
export const toggleCode = (list: string, code: string): string => {
  const codes = codesOf(list);
  const next = codes.includes(code) ? codes.filter((item) => item !== code) : [...codes, code];
  return next.join(', ');
};

/** The draft as the API's query: empty fields drop out, the family always travels. */
export const scopeQueryOf = (draft: ScopeDraft): ScopeQuery => {
  const naics = codesOf(draft.naics);
  const psc = codesOf(draft.psc);
  return {
    ...(naics.length > 0 ? { naics } : {}),
    ...(psc.length > 0 ? { psc } : {}),
    ...(draft.agency.length > 0 ? { agency: draft.agency } : {}),
    awardFamily: draft.awardFamily,
  };
};
