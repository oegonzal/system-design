import { Module } from '@nestjs/common';
import { join } from 'node:path';

import { FilePromptLibrary } from './file-prompt-library';
import { PromptsController } from './prompts.controller';
import { PROMPT_LIBRARY } from './tokens';

/** The repo root is the cwd for both `nx serve` and `node packages/quality-loop/dist/main.js`. */
const promptsDir = (): string =>
  process.env['QUALITY_LOOP_PROMPTS_DIR'] ?? join(process.cwd(), 'packages/quality-loop/prompts');

@Module({
  controllers: [PromptsController],
  providers: [{ provide: PROMPT_LIBRARY, useFactory: () => new FilePromptLibrary(promptsDir()) }],
})
export class PromptsModule {}
