import { Logger, Module } from '@nestjs/common';
import type { LlmClient } from '@sysdesign/llm';

import type { BriefClassifier, RouterPorts } from '../../orchestrators/router/ports';
import { RunsModule } from '../runs/runs.module';
import { QUALITY_LOOP_LLM } from '../runs/tokens';
import { LlmBriefClassifier } from './classifier/llm-brief-classifier';
import { RouterController } from './router.controller';
import { RouterService } from './router.service';
import { BRIEF_CLASSIFIER, ROUTER_PORTS } from './tokens';

const logger = new Logger('RouterModule');

/**
 * The router orchestrator's one adapter — the brief classifier over the same
 * client the runs use — and the tool beside it that needs it without a run:
 * the route report. The run itself is an orchestration.
 */
@Module({
  imports: [RunsModule],
  controllers: [RouterController],
  providers: [
    RouterService,
    {
      provide: BRIEF_CLASSIFIER,
      useFactory: (client: LlmClient): BriefClassifier =>
        new LlmBriefClassifier(client, (message) => logger.warn(message)),
      inject: [QUALITY_LOOP_LLM],
    },
    {
      provide: ROUTER_PORTS,
      useFactory: (classifier: BriefClassifier): RouterPorts => ({
        classifier,
        model: { model: classifier.model },
      }),
      inject: [BRIEF_CLASSIFIER],
    },
  ],
  exports: [ROUTER_PORTS],
})
export class RouterModule {}
