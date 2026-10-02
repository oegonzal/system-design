import type {
  EvidenceLedger,
  IsoDateString,
  IterationMode,
  LlmExchangeSummaryDto,
  QualityControlDecision,
  RemediationNote,
  RunErrorDto,
  ValidationReport,
} from '@sysdesign/contracts';

import type {
  ArtifactState,
  ContractState,
  LensCell,
  OrchestrationState,
  RunHeader,
  StandingState,
  StepRow,
} from './state';

/**
 * What happened, one event at a time, in the engine's own declared order.
 *
 * An action is derived from a snapshot of the wire, so it is an honest claim
 * about *what* happened, its order and its payload — and no claim at all about
 * wall-clock time beyond the timestamps the wire itself carries. Declaration
 * order is presented deliberately: a wave's evidence is a function of the
 * order the pipeline declares its lenses in, never of which call answered
 * first, so that is the order worth reading.
 *
 * Every action carries the scope it belongs to, which is what lets one rail
 * show an orchestration, its steps, their child runs and each run's iterations
 * without any view having to work out where it is.
 */

export interface ActionScope {
  orchestrationRunId?: string;
  stepId?: string;
  runId?: string;
  iteration?: number;
}

/** Where an entry in the log came from. */
export const PROVENANCES = ['reconstructed', 'recorded'] as const;
export type Provenance = (typeof PROVENANCES)[number];

interface ActionBase {
  /**
   * Stable identity. The same event derived from two snapshots yields the same
   * key, which is how the log stays append-only across polls. An action whose
   * payload may still change carries a digest of that payload in its key, so a
   * change is a new action rather than an edit of an old one.
   */
  key: string;
  /** A short label for the rail — what happened, in words. */
  label: string;
  scope: ActionScope;
  /** The wire's own timestamp for this event, when it carries one. */
  at?: IsoDateString | null;
}

export type InspectorAction = ActionBase &
  (
    | { type: 'run/opened'; run: RunHeader }
    | { type: 'contract/derived'; contract: ContractState }
    | { type: 'contract/provided'; contract: ContractState }
    | { type: 'contract/adopted'; contract: ContractState }
    | { type: 'iteration/began'; iteration: number; mode: IterationMode }
    | { type: 'artifact/produced'; artifact: ArtifactState }
    | { type: 'artifact/provided'; artifact: ArtifactState }
    | { type: 'artifact/adopted'; artifact: ArtifactState }
    | { type: 'artifact/absent' }
    | { type: 'validation/ran'; reports: ValidationReport[] }
    | { type: 'critic/reported'; cellKey: string; cell: LensCell }
    | { type: 'evaluator/reported'; cellKey: string; cell: LensCell }
    | { type: 'ledger/normalised'; ledger: EvidenceLedger }
    | {
        type: 'decision/decided';
        decision: QualityControlDecision;
        remediations: RemediationNote[];
      }
    | { type: 'iteration/ended'; iteration: number; durationMs: number }
    | { type: 'run/standing'; standing: StandingState }
    | { type: 'run/failed'; error: RunErrorDto }
    | { type: 'exchange/recorded'; exchange: LlmExchangeSummaryDto }
    | { type: 'orchestration/opened'; orchestration: OrchestrationState }
    | { type: 'step/started'; step: StepRow }
    | { type: 'step/opened-run'; stepId: string; runId: string }
    | { type: 'step/completed'; step: StepRow }
    | { type: 'step/skipped'; step: StepRow }
    | { type: 'step/failed'; step: StepRow }
    | {
        type: 'orchestration/finished';
        status: OrchestrationState['status'];
        finishedAt: IsoDateString | null;
        error: RunErrorDto | null;
      }
  );

export type ActionType = InspectorAction['type'];

/**
 * The action types, grouped the way a reader filters them. Declared as data so
 * the rail's filter control is generated rather than written out.
 */
export const ACTION_GROUPS = {
  run: ['run/opened', 'run/standing', 'run/failed'],
  contract: ['contract/derived', 'contract/provided', 'contract/adopted'],
  iteration: ['iteration/began', 'iteration/ended'],
  artifact: ['artifact/produced', 'artifact/provided', 'artifact/adopted', 'artifact/absent'],
  validation: ['validation/ran'],
  lenses: ['critic/reported', 'evaluator/reported'],
  evidence: ['ledger/normalised'],
  decision: ['decision/decided'],
  exchanges: ['exchange/recorded'],
  orchestration: [
    'orchestration/opened',
    'orchestration/finished',
    'step/started',
    'step/opened-run',
    'step/completed',
    'step/skipped',
    'step/failed',
  ],
} as const satisfies Readonly<Record<string, readonly ActionType[]>>;

export type ActionGroup = keyof typeof ACTION_GROUPS;

const GROUP_OF = new Map<ActionType, ActionGroup>(
  (Object.entries(ACTION_GROUPS) as [ActionGroup, readonly ActionType[]][]).flatMap(
    ([group, types]) => types.map((type): [ActionType, ActionGroup] => [type, group]),
  ),
);

/** The group an action belongs to. Total over the union: every type is listed above. */
export const groupOf = (type: ActionType): ActionGroup => {
  const group = GROUP_OF.get(type);
  /* c8 ignore next -- unreachable while ACTION_GROUPS covers the union, which the spec asserts */
  if (group === undefined) throw new Error(`no group declares ${type}`);
  return group;
};
