import type { DesignTranscript } from '@sysdesign/contracts';

const NONE = '_None._';

/**
 * The interview as a document: the phases with when each began and ended,
 * then every turn in order, so the file reads without the studio.
 */
export function transcriptMarkdown(transcript: DesignTranscript): string {
  const lines: string[] = ['# Transcript — the interview as it ran', ''];
  lines.push('## Phases', '');
  if (transcript.phases.length === 0) {
    lines.push(NONE, '');
  } else {
    lines.push('| Phase | Began | Ended |', '| --- | --- | --- |');
    for (const phase of transcript.phases) {
      lines.push(`| ${phase.id} | ${phase.startedAt} | ${phase.endedAt ?? '—'} |`);
    }
    lines.push('');
  }
  lines.push('## Turns', '');
  if (transcript.turns.length === 0) {
    lines.push(NONE);
  } else {
    transcript.turns.forEach((turn, index) => {
      const disclosed =
        turn.disclosesCriterionIds !== undefined && turn.disclosesCriterionIds.length > 0
          ? ` _(discloses ${turn.disclosesCriterionIds.join(', ')})_`
          : '';
      lines.push(`${index + 1}. **${turn.role}** (${turn.phase}): ${turn.text}${disclosed}`);
    });
  }
  return `${lines.join('\n')}\n`;
}
