import { Controller, Get } from '@nestjs/common';
import type { GetProgressResponse } from '@sysdesign/contracts';
import { ok } from '../../common/envelope';

import { ProgressService } from './progress.service';

@Controller('progress')
export class ProgressController {
  constructor(private readonly progress: ProgressService) {}

  /** The author's standing per competency, counted from the loop's recorded verdicts. */
  @Get()
  async read(): Promise<GetProgressResponse> {
    return ok(await this.progress.progress());
  }
}
