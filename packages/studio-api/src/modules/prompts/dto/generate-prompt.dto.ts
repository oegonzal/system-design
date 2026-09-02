import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import {
  PROMPT_DIFFICULTIES,
  type GeneratePromptRequest,
  type PromptDifficulty,
} from '@sysdesign/contracts';

export class GeneratePromptRequestDto implements GeneratePromptRequest {
  /** Omitted → the service rotates to the least-practiced experience. */
  @IsOptional()
  @IsUUID()
  experienceId?: string;

  /** Defaults to 'standard' in the service. */
  @IsOptional()
  @IsIn([...PROMPT_DIFFICULTIES])
  difficulty?: PromptDifficulty;

  /**
   * Omitted → the service derives one from the experience slug and prompt
   * count. Capped at 2^31-1 because the column is an int4 — the DTO rejects
   * what Postgres could not store.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(2147483647)
  seed?: number;
}
