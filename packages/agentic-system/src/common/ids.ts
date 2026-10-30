import { randomUUID } from 'node:crypto';

import { Global, Module } from '@nestjs/common';

/** The one source of fresh ids every layer draws from, so a spec can fix it in one place. */
export const IDS = Symbol('IDS');
export type Ids = () => string;

@Global()
@Module({
  providers: [{ provide: IDS, useValue: (): string => randomUUID() }],
  exports: [IDS],
})
export class IdsModule {}
