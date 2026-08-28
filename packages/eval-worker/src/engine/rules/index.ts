/**
 * The complete rule catalog, one array the engine iterates. Order here is
 * cosmetic — the engine re-sorts findings for byte-determinism — but keeping
 * it in rubric order makes the catalog easy to audit against the dimensions.
 */
import type { EvalRule } from '../types';
import { dataRules } from './data';
import { hygieneRules } from './hygiene';
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
];
