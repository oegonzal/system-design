import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import type {
  GetImprovementRunResponse,
  GetImproverAvailabilityResponse,
} from '@sysdesign/contracts';

import { ok } from '../../common/envelope';
import { toImprovementRunDto } from './improvement-runs.mapper';
import { ImprovementRunsService } from './improvement-runs.service';

@Controller('improvement-runs')
export class ImprovementRunsController {
  constructor(private readonly runs: ImprovementRunsService) {}

  /** Declared before :id so the literal path wins the match. */
  @Get('availability')
  availability(): GetImproverAvailabilityResponse {
    return ok(this.runs.availability());
  }

  /** The polling target: status + live trajectory. */
  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<GetImprovementRunResponse> {
    return ok(toImprovementRunDto(await this.runs.findOne(id)));
  }

  /** 202: the worker observes the flip between iterations and stops. */
  @Post(':id/cancel')
  @HttpCode(202)
  async cancel(@Param('id', ParseUUIDPipe) id: string): Promise<GetImprovementRunResponse> {
    return ok(toImprovementRunDto(await this.runs.cancel(id)));
  }
}
