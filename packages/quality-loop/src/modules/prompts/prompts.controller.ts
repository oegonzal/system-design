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

  @Get(':id')
  async get(@Param('id') id: string): Promise<GetPromptLibraryDocumentResponse> {
    const document = await this.library.get(id);
    if (!document) throw new NotFoundException(`prompt ${id} not found`);
    return { data: document };
  }
}
