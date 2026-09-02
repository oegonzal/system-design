import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { MAX_IMPROVE_ITERATIONS, type StartImprovementRunRequest } from '@sysdesign/contracts';

import { SubmitRevisionRequestDto } from '../../sessions/dto/submit-revision.dto';

/**
 * The current canvas state, exactly as a submit carries it — the run's base
 * revision is persisted from this body — plus an optional iteration budget.
 */
export class StartImprovementRunRequestDto
  extends SubmitRevisionRequestDto
  implements StartImprovementRunRequest
{
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_IMPROVE_ITERATIONS)
  maxIterations?: number;
}
