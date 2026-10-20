/**
 * A prompt's sections, by the one structure every prompt in the studio has:
 * an H1 title, then H2 sections (`DRAFT_SECTIONS` renders them, the library
 * is written in them, and an authored prompt is refused for a format that
 * reveals by section unless it has them). Reading the headings is reading
 * declared structure, never prose: a heading line is one that starts with
 * `## `.
 */
export interface MarkdownSection {
  /** The heading text without its marks; null for what comes before the first H2. */
  heading: string | null;
  /** The lines under it, verbatim, joined. */
  body: string;
}

const H2 = '## ';

export function markdownSections(markdown: string): MarkdownSection[] {
  const sections: MarkdownSection[] = [];
  let current: MarkdownSection = { heading: null, body: '' };
  const lines: string[] = [];
  const close = () => {
    current.body = lines.join('\n').trim();
    if (current.heading !== null || current.body.length > 0) sections.push(current);
    lines.length = 0;
  };
  for (const line of markdown.split('\n')) {
    if (line.startsWith(H2)) {
      close();
      current = { heading: line.slice(H2.length).trim(), body: '' };
    } else {
      lines.push(line);
    }
  }
  close();
  return sections;
}

/** How many H2 sections the markdown has — what a section-revealing format requires at least two of. */
export const sectionCount = (markdown: string): number =>
  markdownSections(markdown).filter((section) => section.heading !== null).length;

/**
 * The markdown up to the end of its first H2 section: the title and preface
 * with the first section — what a candidate sees of an interview prompt
 * before asking. Markdown with no second H2 is returned whole.
 */
export function firstSection(markdown: string): string {
  const sections = markdownSections(markdown);
  const kept: string[] = [];
  let headings = 0;
  for (const section of sections) {
    if (section.heading !== null) {
      headings += 1;
      if (headings > 1) break;
      kept.push(`${H2}${section.heading}\n\n${section.body}`);
    } else {
      kept.push(section.body);
    }
  }
  return kept.join('\n\n').trim();
}
