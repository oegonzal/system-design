/**
 * A mission declares facts for the engine under `##` headings, one bullet
 * each — its Marks, its Stop conditions. This is the one reader of such a
 * section: the bullets under a heading, trimmed, blank lines skipped, up to
 * the next heading; none when the heading is absent. What a bullet means is
 * each section's own grammar.
 */
export function bulletsUnder(mission: string, heading: string): string[] {
  const lines = mission.split('\n');
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start === -1) return [];
  const bullets: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^#{1,2} /.test(line)) break;
    if (line.trim() === '') continue;
    bullets.push(line.trim());
  }
  return bullets;
}
