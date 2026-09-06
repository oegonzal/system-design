import type { PromptLibraryDocumentDto, PromptLibraryEntryDto } from '@sysdesign/contracts';

/** Where goals come from. The filesystem adapter is the starter; a database-backed one drops in here. */
export interface PromptLibrary {
  list(): Promise<PromptLibraryEntryDto[]>;
  get(id: string): Promise<PromptLibraryDocumentDto | null>;
}
