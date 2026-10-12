/**
 * The router orchestrator's wire types: a brief is classified into one of the
 * registered judges, and that judge runs it. The classifier's answer is
 * evidence, locked to the registered ids; the runner's declared-pipeline check
 * is what dispatches. The route report is the tool beside it: which judge the
 * router would pick for a goal, running nothing.
 */
import { z } from 'zod';

import type { ApiResponse } from '../envelope';
import { llmModelSchema } from '../llm-model';

export const ROUTER_ORCHESTRATOR_ID = 'router';

/** Why the classify step skipped — beyond the runner's own reasons. */
export const ROUTER_STEP_REASONS = ['no-routes', 'unclassified'] as const;
export type RouterStepReason = (typeof ROUTER_STEP_REASONS)[number];

/** A registered pipeline a brief may be routed to, as the classifier sees it. */
export interface RouteDto {
  id: string;
  description: string;
}

/** What the router records at open, under `OrchestrationRunDto.context`: which model classifies. */
export const routerContextSchema = z.strictObject({ classifier: llmModelSchema });
export type RouterContextDto = z.infer<typeof routerContextSchema>;

/** The body of `POST /router/report`. */
export interface RouteReportRequest {
  goal: string;
}

/** Which judge the router would pick for a goal; null when the classifier could not say. */
export interface RouteReportDto {
  routes: RouteDto[];
  pipeline: string | null;
  rationale: string | null;
}

export type RouteReportResponse = ApiResponse<RouteReportDto>;
