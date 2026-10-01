import { saveStarStorySchema, type SaveStarStoryRequest } from '@sysdesign/contracts';

/**
 * The STAR form's reading of the one save rule, `saveStarStorySchema` — the
 * rule the API refuses with. The form never restates it; it only turns the
 * rule's issues into a sentence beside the field each one is about.
 */

/** The fields the rule can refuse, keyed as the request names them. */
export const STORY_FIELDS = ['title', 'situation', 'task', 'action', 'result', 'tags'] as const;
export type StoryField = (typeof STORY_FIELDS)[number];

type SaveIssue = NonNullable<
  ReturnType<typeof saveStarStorySchema.safeParse>['error']
>['issues'][number];

export interface StoryCheck {
  /** The request as the rule accepts it — trimmed — or null while it refuses it. */
  accepted: SaveStarStoryRequest | null;
  /** The first refusal per field, as copy; absent for a field the rule accepts. */
  errors: Partial<Record<StoryField, string>>;
  /** Fields refused for being empty — what a disabled Save says is still missing. */
  missing: StoryField[];
}

const isStoryField = (key: PropertyKey | undefined): key is StoryField =>
  STORY_FIELDS.some((field) => field === key);

/** What one issue says to the author, about the field at the head of its path. */
function copyOf(field: StoryField, issue: SaveIssue, tags: readonly string[]): string {
  const [, index] = issue.path;
  if (issue.code === 'too_small') return 'Required.';
  if (issue.code === 'too_big') {
    // An entry's own issue names the entry; the list's issue counts them.
    if (typeof index === 'number') {
      return `“${tags[index] ?? ''}” is longer than ${issue.maximum} characters.`;
    }
    if (issue.origin === 'array') {
      return `At most ${issue.maximum} ${field} — this has ${tags.length}.`;
    }
    return `At most ${issue.maximum} characters.`;
  }
  return issue.message;
}

/** Checks a payload against the save rule, field by field. */
export function checkStory(payload: SaveStarStoryRequest): StoryCheck {
  const parsed = saveStarStorySchema.safeParse(payload);
  if (parsed.success) return { accepted: parsed.data, errors: {}, missing: [] };
  const errors: Partial<Record<StoryField, string>> = {};
  const missing: StoryField[] = [];
  for (const issue of parsed.error.issues) {
    const [field] = issue.path;
    if (!isStoryField(field) || errors[field] !== undefined) continue;
    errors[field] = copyOf(field, issue, payload.tags);
    if (issue.code === 'too_small') missing.push(field);
  }
  return { accepted: null, errors, missing };
}

/** `" postgres, caching , postgres,, "` → `['postgres', 'caching']`: trimmed, deduped, none dropped. */
export function parseTags(raw: string): string[] {
  return [
    ...new Set(
      raw
        .split(',')
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0),
    ),
  ];
}
