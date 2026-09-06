import { Controller, Get } from '@nestjs/common';

/** Liveness. */
@Controller('health')
export class HealthController {
  @Get()
  health(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
