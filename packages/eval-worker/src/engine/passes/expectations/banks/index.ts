/**
 * Every expectation the pass can evaluate, universal core first. Archetype
 * banks for media-streaming, workflow-automation, realtime-analytics and
 * dag-orchestration join this list as they land — the registry is the one
 * place to add them.
 */
import type { Expectation } from '../types';
import { coreExpectations } from './core';
import { flashSaleExpectations } from './flash-sale';

export const EXPECTATIONS: readonly Expectation[] = [...coreExpectations, ...flashSaleExpectations];
