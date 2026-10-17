import { Global, Module } from '@nestjs/common';

/** The one clock every layer reads, so a spec can fix it in one place. */
export const CLOCK = Symbol('CLOCK');
export type Clock = () => Date;

@Global()
@Module({
  providers: [{ provide: CLOCK, useValue: (): Date => new Date() }],
  exports: [CLOCK],
})
export class ClockModule {}
