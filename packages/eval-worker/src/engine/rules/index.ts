/**
 * The complete rule catalog, one array the engine iterates. Order here is
 * cosmetic — the engine re-sorts findings for byte-determinism — but keeping
 * it in rubric order makes the catalog easy to audit against the dimensions.
 */
import type { EvalRule } from '../types';
import { briefRules } from './brief';
import { dagRules } from './dag';
import { dataRules } from './data';
import { hygieneRules } from './hygiene';
import { interfaceRules } from './interfaces';
import { messagingRules } from './messaging';

import { performanceRules } from './performance';
import { reliabilityRules } from './reliability';
import { scalabilityRules } from './scalability';
import { securityRules } from './security';

export const RULES: EvalRule[] = [
  ...reliabilityRules,
  ...scalabilityRules,
  ...performanceRules,
  ...dataRules,
  ...messagingRules,
  ...securityRules,
  ...hygieneRules,
  // Archetype packs sit after the dimension files; each rule still registers
  // under the dimension its lesson belongs to.
  ...dagRules,
  // Interface-aware pack: wakes only once the author declares operations
  // (see rules/interfaces.ts for the feature gate), inert everywhere else.
  ...interfaceRules,
  // Brief-alignment pack: wakes only once a design brief is submitted (see
  // rules/brief.ts for the feature gate), inert otherwise.
  ...briefRules,
];
