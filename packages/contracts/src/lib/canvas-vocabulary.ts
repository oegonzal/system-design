import {
  DEFAULT_NODE_LABELS,
  EDGE_CONFIG_HINTS,
  kindsInCategory,
  NODE_KIND_CATEGORIES,
} from './canvas';
import { NODE_KIND_GUIDE } from './node-guide';

export const CANVAS_VOCABULARY_HEADING = '## Canvas vocabulary';

/**
 * The canvas's own vocabulary as a section of every canvas goal: each role
 * a block may play, shelf by shelf, in the words the palette teaches the
 * author (`NODE_KIND_GUIDE`), and the keys a connection is offered — so
 * every lens reads a block's `kind` by the same definition the author drew
 * it from, on any platform or none.
 */
export function renderCanvasVocabularySection(): string {
  const lines = [
    CANVAS_VOCABULARY_HEADING,
    '',
    `Every block plays one of the roles below (its \`kind\`); a block that names a platform service is that service in that role, and its \`boundary\`, where set, says where it sits. A connection is one hop, sync or async, and declares how it is made as config entries — the keys an author is offered are ${EDGE_CONFIG_HINTS.join(', ')}; any key is accepted.`,
  ];
  for (const category of NODE_KIND_CATEGORIES) {
    const kinds = kindsInCategory(category.id);
    if (kinds.length === 0) continue;
    lines.push('', `### ${category.label}`, '');
    for (const kind of kinds) {
      lines.push(`- \`${kind}\` — ${DEFAULT_NODE_LABELS[kind]}: ${NODE_KIND_GUIDE[kind].what}`);
    }
  }
  return lines.join('\n');
}
