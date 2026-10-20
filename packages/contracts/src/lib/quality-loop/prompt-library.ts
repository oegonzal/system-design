import type { ApiResponse } from '../envelope';

/**
 * A goal the quality loop can be pointed at — one markdown document in the
 * service's library. `folder` is the first directory below the library root
 * the document sits in, or null at the root: declared structure a reader may
 * look up, never a reading of the document's prose.
 */
export interface PromptLibraryEntryDto {
  id: string;
  title: string;
  folder: string | null;
}

export interface PromptLibraryDocumentDto extends PromptLibraryEntryDto {
  markdown: string;
}

export type ListPromptLibraryResponse = ApiResponse<PromptLibraryEntryDto[]>;
export type GetPromptLibraryDocumentResponse = ApiResponse<PromptLibraryDocumentDto>;
