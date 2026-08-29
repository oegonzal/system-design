/**
 * Every expectation the pass can evaluate, universal core first. Archetype
 * banks register here — the one place to add them — and each gates on its
 * archetype, so banks can never leak findings across prompt families.
 */
import type { Expectation } from '../types';
import { coreExpectations } from './core';
import { flashSaleExpectations } from './flash-sale';
import { mediaStreamingExpectations } from './media-streaming';
import { realtimeAnalyticsExpectations } from './realtime-analytics';

export const EXPECTATIONS: readonly Expectation[] = [
  ...coreExpectations,
  ...flashSaleExpectations,
  ...mediaStreamingExpectations,
  ...realtimeAnalyticsExpectations,
];
