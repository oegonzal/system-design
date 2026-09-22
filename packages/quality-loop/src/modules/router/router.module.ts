import { Logger, Module } from '@nestjs/common';
import { qualityLoopAvailabilityFromEnv, type LlmClient } from '@sysdesign/llm';

import type { RouterPorts } from '../../orchestrators/router/steps';
import { RunsModule } from '../runs/runs.module';
import { QUALITY_LOOP_LLM } from '../runs/tokens';
import { LlmBriefClassifier, noClassifier, type BriefClassifier } from './classifier';
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
    // No model means no classifier, and a classify step that says so.
    {
      provide: BRIEF_CLASSIFIER,
      useFactory: (client: LlmClient): BriefClassifier =>
        client.enabled ? new LlmBriefClassifier(client, (m) => logger.warn(m)) : noClassifier,
      inject: [QUALITY_LOOP_LLM],
    },
    {
      provide: ROUTER_PORTS,
      useFactory: (classifier: BriefClassifier): RouterPorts => ({
        classifier,
        llm: {
          enabled: classifier.enabled,
          model: classifier.model,
          reason: classifier.enabled ? null : qualityLoopAvailabilityFromEnv().reason,
        },
      }),
      inject: [BRIEF_CLASSIFIER],
    },
  ],
  exports: [ROUTER_PORTS],
})
export class RouterModule {}
