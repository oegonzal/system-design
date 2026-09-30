import { Controller, Get } from '@nestjs/common';

/** Liveness — the route every app's `main.ts` logs and every smoke test hits. */
@Controller('health')
export class HealthController {
  @Get()
  health(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
