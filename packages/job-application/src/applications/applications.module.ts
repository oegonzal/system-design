import { Module, type DynamicModule } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { JobApplication } from '@sysdesign/db';

import { RECORD_SOURCE } from '../advisor/ports';
import { ApplicationsService } from './applications.service';
import { MikroOrmApplicationStore } from './persistence/mikro-orm-application-store';
import { POLICY, type ScatterPolicy } from './policy';
import { APPLICATION_STORE } from './ports';
import { ApplicationRecordSource } from './record-source';
import { SessionRecord } from './session-record';

/**
 * The domain: the record of applications, the policy over it, what a
 * session's events do to it, and the record as the advisor protocol reads it.
 * Global, so the intake and the advisor routes reach what it exports without
 * importing the registered module again.
 */
@Module({})
export class ApplicationsModule {
  static register(policy: ScatterPolicy): DynamicModule {
    return {
      module: ApplicationsModule,
      global: true,
      imports: [MikroOrmModule.forFeature([JobApplication])],
      providers: [
        { provide: POLICY, useValue: policy },
        { provide: APPLICATION_STORE, useClass: MikroOrmApplicationStore },
        { provide: RECORD_SOURCE, useClass: ApplicationRecordSource },
        ApplicationsService,
        SessionRecord,
      ],
      exports: [RECORD_SOURCE, ApplicationsService, SessionRecord],
    };
  }
}
