import { Logger, Module } from '@nestjs/common';
import { qualityLoopAvailabilityFromEnv, type LlmClient } from '@sysdesign/llm';

import {
  noClassifier,
  type BriefClassifier,
  type RouterPorts,
} from '../../orchestrators/router/ports';
import { availabilityOf, llmBacked } from '../runs/llm-backed';
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
    // No model means no classifier, and a classify step that says so.
    {
      provide: BRIEF_CLASSIFIER,
      useFactory: (client: LlmClient): BriefClassifier =>
        llmBacked(client, (llm, warn) => new LlmBriefClassifier(llm, warn), noClassifier, logger),
      inject: [QUALITY_LOOP_LLM],
    },
    {
      provide: ROUTER_PORTS,
      useFactory: (classifier: BriefClassifier): RouterPorts => ({
        classifier,
        llm: availabilityOf(classifier, () => qualityLoopAvailabilityFromEnv().reason),
      }),
      inject: [BRIEF_CLASSIFIER],
    },
  ],
  exports: [ROUTER_PORTS],
})
export class RouterModule {}
