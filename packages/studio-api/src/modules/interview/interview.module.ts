import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { DesignRevision, DesignSession, InterviewTurn } from '@sysdesign/db';

import { SessionsModule } from '../sessions/sessions.module';
import { InterviewController } from './interview.controller';
import { InterviewService } from './interview.service';

@Module({
  imports: [
    MikroOrmModule.forFeature([InterviewTurn, DesignSession, DesignRevision]),
    SessionsModule,
  ],
  controllers: [InterviewController],
  providers: [InterviewService],
})
export class InterviewModule {}
