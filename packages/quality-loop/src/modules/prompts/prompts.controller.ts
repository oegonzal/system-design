import { Controller, Get, Inject, NotFoundException, Param } from '@nestjs/common';
import type {
  GetPromptLibraryDocumentResponse,
  ListPromptLibraryResponse,
} from '@sysdesign/contracts';

import type { PromptLibrary } from './prompt-library';
import { PROMPT_LIBRARY } from './tokens';

@Controller('prompts')
export class PromptsController {
  constructor(@Inject(PROMPT_LIBRARY) private readonly library: PromptLibrary) {}

  @Get()
  async list(): Promise<ListPromptLibraryResponse> {
    return { data: await this.library.list() };
  }

  /**
   * A prompt id is a path below the library root, so it may carry separators —
   * `agentic/workflow-graph-engine`. The wildcard accepts those segments;
   * Express hands them back as an array, and an id that arrived percent-encoded
   * as one segment comes back as a string. Both are the same id, rejoined.
   */
  @Get('*id')
  async get(
    @Param('id') id: string | readonly string[],
  ): Promise<GetPromptLibraryDocumentResponse> {
    const key = Array.isArray(id) ? id.join('/') : (id as string);
    const document = await this.library.get(key);
    if (!document) throw new NotFoundException(`prompt ${key} not found`);
    return { data: document };
  }
}
