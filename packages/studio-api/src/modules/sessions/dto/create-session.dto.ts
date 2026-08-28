import { IsUUID } from 'class-validator';
import type { CreateSessionRequest } from '@sysdesign/contracts';

export class CreateSessionRequestDto implements CreateSessionRequest {
  @IsUUID()
  promptId!: string;
}
