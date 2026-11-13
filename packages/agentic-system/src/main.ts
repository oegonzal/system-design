import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { VectorIndex } from '@sysdesign/agentic-memory';

import { AppModule } from './app/app.module';
import { agenticSystemConfigFromEnv, PACKAGE_ROOT } from './config';
import { VECTOR_INDEX } from './memory';
import { readSettings } from './settings';

/**
 * The agentic-system service: it designs and coaches agentic-memory strategies
 * on the quality loop and hands each finished run to the memory-design
 * orchestrator to learn from. A cycle takes a memory brief (POST /designs starts
 * it, GET /designs/:id polls it), coaches a strategy from it on the loop, and
 * digests the finished run into memory; the strategy itself is read from the
 * loop run. A settled run's strategy becomes a memory space (POST /spaces) that
 * the agentic-memory runtime executes — remember, update, invalidate, recall,
 * consolidate and history under /spaces/:id — and a text handed to a space is
 * digested on the loop into its typed memories (POST /spaces/:id/digests), read
 * back (GET …/digests/:runId) and remembered once (POST …/remember). Beside
 * GET /health.
 */
async function bootstrap(): Promise<void> {
  process.on('uncaughtException', (error) => {
    console.error(error);
    process.exit(1);
  });
  const settings = readSettings(PACKAGE_ROOT);
  const config = agenticSystemConfigFromEnv(settings);
  const app = await NestFactory.create(AppModule.register(config));
  app.enableShutdownHooks();
  await app.listen(config.port);
  const logger = new Logger('AgenticSystem');
  logger.log(`agentic-system listening on http://localhost:${config.port}/health`);
  logger.log(
    `design: ${settings.sources.design} → pipeline ${settings.design.pipeline}, orchestrator ${settings.design.orchestrator}`,
  );
  logger.log(`loop: ${config.loopUrl}, bus: ${config.notificationsUrl}`);
  const embeddings = config.embedder.model ?? `disabled (${config.embedder.reason})`;
  // The collection the index is bound to — a table in the app's database — or none without a model.
  const vectors = app.get<VectorIndex>(VECTOR_INDEX).collection ?? 'none';
  logger.log(
    `memory: ${settings.policySource} (${settings.sources.memory}), embeddings: ${embeddings}, vectors: ${vectors}`,
  );
}

bootstrap().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
