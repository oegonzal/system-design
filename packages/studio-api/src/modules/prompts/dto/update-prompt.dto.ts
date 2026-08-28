import { IsIn } from 'class-validator';
import { PROMPT_STATUSES, type PromptStatus, type UpdatePromptRequest } from '@sysdesign/contracts';

/** Archive / reactivate — the only mutable field on a generated prompt. */
export class UpdatePromptRequestDto implements UpdatePromptRequest {
  @IsIn([...PROMPT_STATUSES])
  status!: PromptStatus;
}
