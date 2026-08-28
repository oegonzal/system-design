import { CRITICS, type CriticName } from './critics';
import { evidenceAppearsIn } from './evidence';

export type Severity = 'low' | 'medium' | 'high';

export interface Finding {
  severity: Severity;
  file: string;
  line?: number;
  category: string;
  evidence: string;
  problem: string;
  recommendation: string;
}

export interface CriticReport {
  critic: CriticName;
  findings: Finding[];
}

export interface SanitiseResult {
  report: CriticReport;
  dropped: string[];
}

/** How an unverifiable quote is handled. */
export type EvidenceGuard = 'enforce' | 'warn' | 'off';

export interface SanitiseContext {
  /** Files whose diff actually reached the critic. */
  reviewedFiles: string[];
  changedFiles: string[];
  /** The exact prompt this critic was sent — the corpus evidence is checked against. */
  prompt: string;
  /** False when no stated purpose was available, which disables scope categories. */
  intentAvailable: boolean;
  evidenceGuard?: EvidenceGuard;
}

/**
 * Deterministic guards against a critic wandering outside its brief.
 *
 * This stays the single place a critic finding can be dropped: the `dropped`
 * strings are user-facing, and splitting the logic across modules would make
 * "why was this dropped?" a two-file question. Rule findings never pass through
 * here — they are produced deterministically, so there is nothing to distrust.
 *
 * The order matters — first match wins, and it is arranged so the message names
 * the real cause. "You invented a file" and "we never showed you that file" are
 * different problems with different fixes.
 */
export function sanitise(report: CriticReport, context: SanitiseContext): SanitiseResult {
  const allowed = new Set(CRITICS[report.critic].categories);
  const scopeOnly = new Set(CRITICS[report.critic].scopeCategories);
  const changed = new Set(context.changedFiles);
  const reviewed = new Set(context.reviewedFiles);
  const guard: EvidenceGuard = context.evidenceGuard ?? 'warn';
  const dropped: string[] = [];

  const findings = report.findings.filter((finding) => {
    if (!changed.has(finding.file)) {
      dropped.push(`${report.critic}: file outside the change set — ${finding.file}`);
      return false;
    }
    if (!reviewed.has(finding.file)) {
      // Unsupported by construction: the critic was never shown this file.
      dropped.push(`${report.critic}: file was not in the reviewed diff — ${finding.file}`);
      return false;
    }
    if (!allowed.has(finding.category)) {
      dropped.push(`${report.critic}: unregistered category — ${finding.category}`);
      return false;
    }
    if (scopeOnly.has(finding.category) && !context.intentAvailable) {
      dropped.push(
        `${report.critic}: ${finding.category} needs a stated purpose, and none was available`,
      );
      return false;
    }

    if (guard === 'off') return true;

    const check = evidenceAppearsIn(finding.evidence, context.prompt);
    if (check.verified) return true;

    // In `warn` the finding survives and the line is recorded, so a systematic
    // matcher regression is diagnosable from the run history rather than only
    // visible as findings that quietly stopped appearing.
    const note = `${report.critic}: evidence not found in the supplied context (${check.reason}) — ${finding.file}`;
    dropped.push(guard === 'enforce' ? note : `would drop — ${note}`);
    return guard !== 'enforce';
  });

  return { report: { critic: report.critic, findings }, dropped };
}
