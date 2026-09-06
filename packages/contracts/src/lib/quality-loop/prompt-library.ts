import type { ApiResponse } from '../envelope';

/** A goal the quality loop can be pointed at — one markdown document in the service's library. */
export interface PromptLibraryEntryDto {
  id: string;
  title: string;
}

export interface PromptLibraryDocumentDto extends PromptLibraryEntryDto {
  markdown: string;
}

export type ListPromptLibraryResponse = ApiResponse<PromptLibraryEntryDto[]>;
export type GetPromptLibraryDocumentResponse = ApiResponse<PromptLibraryDocumentDto>;
