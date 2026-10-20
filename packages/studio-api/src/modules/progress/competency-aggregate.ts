import {
  CANVAS_CRITERION_KINDS,
  isCanvasCriterionKind,
  type CanvasCriterionKind,
  type CompetencyProgressDto,
} from '@sysdesign/contracts';

/** One graded revision's verdicts, as the aggregate reads them: when it was graded, which session, and each kind's result. */
export interface GradedRevision {
  sessionId: string;
  gradedAt: string;
  criteria: readonly { kind: string; result: string }[];
}

const SETTLED = new Set(['pass', 'partial', 'fail']);

/**
 * Counts per competency over the author's graded revisions — the loop's
 * verdicts, counted and never weighed. The kinds come out in the contract's
 * order, every declared kind present; a kind a run assessed that the contract
 * no longer declares is still counted, after them, so a stored verdict is
 * never silently dropped. `recent` is the pass share per session, over the
 * last `window` sessions in which the kind was assessed, newest last, with
 * each session read at its newest graded revision that assessed the kind.
 */
export function aggregateCompetencies(
  revisions: readonly GradedRevision[],
  window = 5,
): CompetencyProgressDto[] {
  const kinds = [
    ...CANVAS_CRITERION_KINDS,
    ...new Set(
      revisions
        .flatMap((revision) => revision.criteria.map((criterion) => criterion.kind))
        .filter((kind) => !isCanvasCriterionKind(kind)),
    ),
  ];
  const newestFirst = [...revisions].sort((a, b) => b.gradedAt.localeCompare(a.gradedAt));
  return kinds.map((kind) => {
    let passed = 0;
    let partial = 0;
    let failed = 0;
    let lastPractisedAt: string | null = null;
    const perSession = new Map<string, { passed: number; assessed: number }>();
    for (const revision of newestFirst) {
      const own = revision.criteria.filter(
        (criterion) => criterion.kind === kind && SETTLED.has(criterion.result),
      );
      if (own.length === 0) continue;
      if (lastPractisedAt === null) lastPractisedAt = revision.gradedAt;
      for (const criterion of own) {
        if (criterion.result === 'pass') passed += 1;
        else if (criterion.result === 'partial') partial += 1;
        else failed += 1;
      }
      // The newest graded revision of a session stands for the session.
      if (!perSession.has(revision.sessionId)) {
        perSession.set(revision.sessionId, {
          passed: own.filter((criterion) => criterion.result === 'pass').length,
          assessed: own.length,
        });
      }
    }
    const recent = [...perSession.values()]
      .slice(0, window)
      .reverse()
      .map(({ passed: p, assessed }) => Math.round((100 * p) / assessed) / 100);
    return {
      kind,
      assessed: passed + partial + failed,
      passed,
      partial,
      failed,
      lastPractisedAt,
      recent,
    };
  });
}

/**
 * The declared kind the author is weakest on, by pass share, among the kinds
 * assessed at least `minAssessed` times; null when nothing qualifies. Ties go
 * to the kind assessed less, then to the contract's order.
 */
export function weakestKind(
  competencies: readonly CompetencyProgressDto[],
  minAssessed = 3,
): CanvasCriterionKind | null {
  const candidates = competencies.filter(
    (competency): competency is CompetencyProgressDto & { kind: CanvasCriterionKind } =>
      competency.assessed >= minAssessed && isCanvasCriterionKind(competency.kind),
  );
  if (candidates.length === 0) return null;
  const share = (competency: CompetencyProgressDto) => competency.passed / competency.assessed;
  const declared = (kind: CanvasCriterionKind) => CANVAS_CRITERION_KINDS.indexOf(kind);
  const weakerFirst = (
    a: CompetencyProgressDto & { kind: CanvasCriterionKind },
    b: CompetencyProgressDto & { kind: CanvasCriterionKind },
  ) => share(a) - share(b) || a.assessed - b.assessed || declared(a.kind) - declared(b.kind);
  return [...candidates].sort(weakerFirst)[0]?.kind ?? null;
}
