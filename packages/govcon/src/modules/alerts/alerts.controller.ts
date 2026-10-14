import { Controller, Get, Query } from '@nestjs/common';
import {
  DEFAULT_ALERTS_LIMIT,
  MAX_ALERTS_LIMIT,
  type ListAlertsResponse,
} from '@sysdesign/contracts';
import { page, pageFields, ZodValidationPipe } from '@sysdesign/nest-kit';
import { z } from 'zod';

import { AlertsService } from './alerts.service';

/** The query of `GET /alerts`. */
const listAlertsQuerySchema = z.strictObject(pageFields(MAX_ALERTS_LIMIT, DEFAULT_ALERTS_LIMIT));
type ListAlertsQueryInput = z.output<typeof listAlertsQuerySchema>;

/** What was raised, for the page a digest's "and more" points at. */
@Controller('alerts')
export class AlertsController {
  constructor(private readonly alerts: AlertsService) {}

  @Get()
  async list(
    @Query(new ZodValidationPipe(listAlertsQuerySchema)) query: ListAlertsQueryInput,
  ): Promise<ListAlertsResponse> {
    const [data, total] = await this.alerts.list(query);
    return page(data, total, query);
  }
}
