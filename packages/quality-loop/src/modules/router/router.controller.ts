import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import type { RouteReportRequest, RouteReportResponse } from '@sysdesign/contracts';

import { ZodValidationPipe } from '../runs/zod.pipe';
import { routeReportRequestSchema } from './router-request';
import { RouterService } from './router.service';

@Controller('router')
export class RouterController {
  constructor(private readonly router: RouterService) {}

  /** Which judge the router would pick for this brief, running no pipeline. One model call. */
  @Post('report')
  @HttpCode(200)
  async report(
    @Body(new ZodValidationPipe(routeReportRequestSchema)) body: RouteReportRequest,
  ): Promise<RouteReportResponse> {
    return { data: await this.router.report(body.goal) };
  }
}
