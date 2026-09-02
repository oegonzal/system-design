/**
 * Every expectation the pass can evaluate, universal core first. Archetype
 * banks register here — the one place to add them — and each gates on its
 * archetype, so banks can never leak findings across prompt families.
 */
import type { Expectation } from '../types';
import { briefExpectations } from './brief';
import { coreExpectations } from './core';
import { dagOrchestrationExpectations } from './dag';
import { flashSaleExpectations } from './flash-sale';
import { mediaStreamingExpectations } from './media-streaming';
import { narrativeExpectations } from './narrative';
import { orderHistoryExpectations } from './order-history';
import { productExpectations } from './product';
import { realtimeAnalyticsExpectations } from './realtime-analytics';
import { workflowAutomationExpectations } from './workflow';

export const EXPECTATIONS: readonly Expectation[] = [
  ...coreExpectations,
  ...flashSaleExpectations,
  ...mediaStreamingExpectations,
  ...realtimeAnalyticsExpectations,
  ...workflowAutomationExpectations,
  ...dagOrchestrationExpectations,
  ...orderHistoryExpectations,
  // Workflow-scoped: gated on the prompt carrying a spec, so only workflow
  // prompts assess the product dimension.
  ...productExpectations,
  // Brief-scoped: these grade the author's claims about the design and
  // are the only expectations allowed to read them.
  ...briefExpectations,
  // Narration-scoped last: they grade the prose walkthrough by reference, read
  // the narrative's typed projection, and carry the "no top grade without a
  // walkthrough" cap through `exp.nar.present`.
  ...narrativeExpectations,
];
