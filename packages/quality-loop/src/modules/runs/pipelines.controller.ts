import { Controller, Get } from '@nestjs/common';
import type { ApiResponse } from '@sysdesign/contracts';

import type { PipelineSummary } from '../../core/pipeline';
import { RunsService } from './runs.service';

@Controller('pipelines')
export class PipelinesController {
  constructor(private readonly runs: RunsService) {}

  @Get()
  list(): ApiResponse<PipelineSummary[]> {
    return { data: this.runs.list() };
  }
}
