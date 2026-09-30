/**
 * The route report: which judge the router would pick for a brief, running
 * nothing. The retrieval report's twin — the tool that measures the
 * classifier against a prompt library before any run depends on it.
 */
import { Inject, Injectable } from '@nestjs/common';
import type { RouteReportDto } from '@sysdesign/contracts';

import { briefRoutes } from '../../orchestrators/common';
import { bareGoal } from '../../orchestrators/memory/recall/inject';
import type { RouterPorts } from '../../orchestrators/router/ports';
import { RunsService } from '../runs/runs.service';
import { ROUTER_PORTS } from './tokens';

@Injectable()
export class RouterService {
  constructor(
    private readonly runs: RunsService,
    @Inject(ROUTER_PORTS) private readonly ports: RouterPorts,
  ) {}

  /** The routes the brief could take and the one the classifier picks, or null when it cannot say. */
  async routeReport(goal: string): Promise<RouteReportDto> {
    const routes = briefRoutes(this.runs.pipelines());
    const answer = await this.ports.classifier.classify(bareGoal(goal), routes);
    return { routes, pipeline: answer?.pipeline ?? null, rationale: answer?.rationale ?? null };
  }
}
