/**
 * The route report: which judge the router would pick for a brief, running
 * nothing. The retrieval report's twin — the tool that measures the
 * classifier against a prompt library before any run depends on it.
 */
import { Inject, Injectable } from '@nestjs/common';
import type { RouteReportDto } from '@sysdesign/contracts';

import { briefRoutes } from '../../orchestrators/common';
import type { RouterPorts } from '../../orchestrators/router/steps';
import { bareGoal } from '../memory/compose';
import { RunsService } from '../runs/runs.service';
import { ROUTER_PORTS } from './tokens';

@Injectable()
export class RouterService {
  constructor(
    private readonly runs: RunsService,
    @Inject(ROUTER_PORTS) private readonly ports: RouterPorts,
  ) {}

  async report(goal: string): Promise<RouteReportDto> {
    const routes = briefRoutes(this.runs.list());
    const answer = await this.ports.classifier.classify(bareGoal(goal), routes);
    return { routes, pipeline: answer?.pipeline ?? null, rationale: answer?.rationale ?? null };
  }
}
