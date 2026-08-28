import { Controller, Get } from '@nestjs/common';

/** Liveness for Tilt, Playwright's webServer wait, and the k8s deployment. */
@Controller('health')
export class HealthController {
  @Get()
  health(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
