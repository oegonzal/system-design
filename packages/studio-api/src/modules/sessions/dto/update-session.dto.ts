import { IsIn } from 'class-validator';
import {
  SESSION_STATUSES,
  type SessionStatus,
  type UpdateSessionRequest,
} from '@sysdesign/contracts';

export class UpdateSessionRequestDto implements UpdateSessionRequest {
  @IsIn([...SESSION_STATUSES])
  status!: SessionStatus;
}
