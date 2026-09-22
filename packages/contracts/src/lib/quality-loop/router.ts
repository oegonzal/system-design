/**
 * The router orchestrator's wire types: a brief is classified into one of the
 * registered judges, and that judge runs it. The classifier's answer is
 * evidence, locked to the registered ids; the runner's declared-pipeline check
 * is what dispatches. The route report is the tool beside it: which judge the
 * router would pick for a goal, running nothing.
 */
import type { ApiResponse } from '../envelope';
import type { LlmAvailabilityDto } from '../llm-availability';

export const ROUTER_ORCHESTRATOR_ID = 'router';

/** Why the classify step skipped — beyond the runner's own reasons. */
export const ROUTER_STEP_REASONS = ['classifier-disabled', 'no-routes', 'unclassified'] as const;
export type RouterStepReason = (typeof ROUTER_STEP_REASONS)[number];

/** A registered pipeline a brief may be routed to, as the classifier sees it. */
export interface RouteDto {
  id: string;
  description: string;
}

/** What the router records at open, under `OrchestrationRunDto.context`. */
export interface RouterContextDto {
  classifier: LlmAvailabilityDto;
}

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
