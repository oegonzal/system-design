import { Controller, Get } from '@nestjs/common';
import type { ListPipelinesResponse } from '@sysdesign/contracts';

import { RunsService } from './runs.service';

@Controller('pipelines')
export class PipelinesController {
  constructor(private readonly runs: RunsService) {}

  @Get()
  list(): ListPipelinesResponse {
    return { data: this.runs.list() };
  }
}
