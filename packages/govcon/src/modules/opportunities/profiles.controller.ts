import { Controller, Get } from '@nestjs/common';
import type { ListProfilesResponse } from '@sysdesign/contracts';

import { OpportunitiesService } from './opportunities.service';

/** The profile registry as data; the client reads it, never edits it. */
@Controller('profiles')
export class ProfilesController {
  constructor(private readonly opportunities: OpportunitiesService) {}

  @Get()
  list(): ListProfilesResponse {
    return { data: this.opportunities.listProfiles() };
  }
}
