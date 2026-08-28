import { Controller, Get } from '@nestjs/common';

/** Liveness for Tilt and Playwright's webServer wait. */
@Controller('health')
export class HealthController {
  @Get()
  health(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
