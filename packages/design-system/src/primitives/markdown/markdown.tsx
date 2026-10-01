import styled from '@emotion/styled';
import { useMemo, type HTMLAttributes, type ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { Heading, type HeadingLevel } from '../heading/heading';
import { Link } from '../link/link';
import { Table } from '../table/table';

/**
 * The rendered document's plane. Block spacing is the column gap, so every
 * block — paragraph, list, table, code — sits the same distance from its
 * neighbours without per-element margins; the elements the components map
 * does not take over (lists, code, quotes, rules, the two smallest headings)
 * are styled here from the theme's tokens.
 */
const Article = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[3]}px;
  font-family: ${({ theme }) => theme.font.family.base};
  font-size: ${({ theme }) => theme.font.size.md};
  line-height: ${({ theme }) => theme.font.lineHeight.normal};
  color: ${({ theme }) => theme.color.text.primary};
  overflow-wrap: anywhere;

  p,
  ul,
  ol,
  pre,
  blockquote,
  h5,
  h6 {
    margin: 0;
  }

  ul,
  ol {
    padding-left: ${({ theme }) => theme.space[6]}px;
  }

  li + li {
    margin-top: ${({ theme }) => theme.space[1]}px;
  }

  /* A GitHub task item: the checkbox reads its text as its label. */
  li.task-list-item {
    list-style: none;
  }

  li.task-list-item > label {
    display: inline-flex;
    align-items: baseline;
    gap: ${({ theme }) => theme.space[2]}px;
  }

  li > ul,
  li > ol {
    margin-top: ${({ theme }) => theme.space[1]}px;
  }

  h5,
  h6 {
    font-weight: ${({ theme }) => theme.font.weight.semibold};
    line-height: ${({ theme }) => theme.font.lineHeight.tight};
  }

  h5 {
    font-size: ${({ theme }) => theme.font.size.md};
  }

  h6 {
    font-size: ${({ theme }) => theme.font.size.sm};
    color: ${({ theme }) => theme.color.text.secondary};
  }

  code {
    font-family: ${({ theme }) => theme.font.family.mono};
    font-size: ${({ theme }) => theme.font.size.sm};
    padding: 0 ${({ theme }) => theme.space[1]}px;
    border-radius: ${({ theme }) => theme.radius.sm};
    background: ${({ theme }) => theme.color.bg.subtle};
  }

  pre {
    padding: ${({ theme }) => theme.space[4]}px;
    overflow: auto;
    white-space: pre-wrap;
    border: 1px solid ${({ theme }) => theme.color.border.subtle};
    border-radius: ${({ theme }) => theme.radius.sm};
    background: ${({ theme }) => theme.color.bg.subtle};
  }

  pre code {
    padding: 0;
    background: transparent;
  }

  blockquote {
    padding-left: ${({ theme }) => theme.space[4]}px;
    border-left: 3px solid ${({ theme }) => theme.color.border.default};
    color: ${({ theme }) => theme.color.text.secondary};
  }

  hr {
    width: 100%;
    margin: 0;
    border: none;
    border-top: 1px solid ${({ theme }) => theme.color.border.subtle};
  }

  img {
    max-width: 100%;
  }

  /* A table scrolls (TableScroller) rather than squeeze, so its cells wrap
     between words and never inside one: 'anywhere' would let a cell shrink to
     a letter's width, breaking 'availability' mid-word in a narrow column. */
  th,
  td {
    overflow-wrap: break-word;
  }
`;

/** Lets a wide table scroll on its own instead of stretching the column. */
const TableScroller = styled.div`
  overflow-x: auto;
`;

interface Rendered {
  children?: ReactNode;
}

interface RenderedAnchor extends Rendered {
  href?: string;
  title?: string;
}

interface RenderedListItem extends Rendered {
  className?: string;
}

const TASK_ITEM_CLASS = 'task-list-item';

/** Where the document's headings land: its own `#` at `base`, each deeper `#` one level lower. */
type HeadingTag = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
const MARKDOWN_HEADINGS: readonly HeadingTag[] = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
const DESIGN_SYSTEM_LEVELS: readonly HeadingLevel[] = [1, 2, 3, 4];

/** A document heading the type scale has a step for, made once per level. */
const DESIGNED_HEADINGS = new Map(
  DESIGN_SYSTEM_LEVELS.map((level) => [
    level,
    function DocumentHeading({ children }: Rendered) {
      return <Heading level={level}>{children}</Heading>;
    },
  ]),
);

/**
 * A document heading at `level`: the design system's `Heading` while the
 * type scale has a step for it, the article's own h5/h6 styling below that.
 */
function headingAt(level: number): Components[HeadingTag] {
  const clamped = Math.min(Math.max(level, 1), MARKDOWN_HEADINGS.length);
  const designed = DESIGN_SYSTEM_LEVELS.find((candidate) => candidate === clamped);
  return designed === undefined ? MARKDOWN_HEADINGS[clamped - 1] : DESIGNED_HEADINGS.get(designed);
}

function Anchor({ href, title, children }: RenderedAnchor) {
  return (
    <Link href={href} title={title} rel="noopener noreferrer">
      {children}
    </Link>
  );
}

/**
 * A task-list item wraps its checkbox and text in one label, so the box is
 * named by the text beside it — GitHub flavour renders the input bare.
 */
function ListItem({ className, children }: RenderedListItem) {
  const task = className?.split(' ').includes(TASK_ITEM_CLASS) ?? false;
  return <li className={className}>{task ? <label>{children}</label> : children}</li>;
}

function ScrollingTable({ children }: Rendered) {
  return (
    <TableScroller>
      <Table>{children}</Table>
    </TableScroller>
  );
}

const BLOCKS: Components = {
  a: Anchor,
  li: ListItem,
  table: ScrollingTable,
};

const COMPONENT_SETS = new Map<number, Components>();

/** The element map for a document whose own `#` lands at `base` — one per base, made once. */
function componentsFor(base: number): Components {
  const known = COMPONENT_SETS.get(base);
  if (known) return known;
  const headings = Object.fromEntries(
    MARKDOWN_HEADINGS.map((tag, depth) => [tag, headingAt(base + depth)]),
  ) as Components;
  const components = { ...headings, ...BLOCKS };
  COMPONENT_SETS.set(base, components);
  return components;
}

/** The slice of the markdown tree this file reads: a node, its depth and text, its children. */
interface MarkdownNode {
  type: string;
  depth?: number;
  value?: string;
  children?: MarkdownNode[];
}

const textOf = (node: MarkdownNode): string =>
  node.value ?? (node.children ?? []).map(textOf).join('');

const normalized = (text: string): string => text.replace(/\s+/g, ' ').trim();

/** Every heading one step up — the document's sections taking the place of the title above them. */
const promoteHeadings = (node: MarkdownNode): void => {
  if (node.type === 'heading' && node.depth !== undefined) node.depth = Math.max(1, node.depth - 1);
  node.children?.forEach(promoteHeadings);
};

/**
 * A remark step for a document the page already titles. A prompt written to
 * stand alone opens with its own title as `#`; when that heading says
 * exactly what the page shows, it is dropped and the sections under it step
 * up into its place — the title reads once, and the outline has no gap.
 */
const omitLeadingTitle = (title: string) => () => (tree: MarkdownNode) => {
  const first = tree.children?.[0];
  if (first?.type !== 'heading' || first.depth !== 1) return;
  if (normalized(textOf(first)) !== normalized(title)) return;
  tree.children?.shift();
  tree.children?.forEach(promoteHeadings);
};

export interface MarkdownProps extends HTMLAttributes<HTMLDivElement> {
  /**
   * The block's accessible name — what a screen reader calls the document.
   * Not shown: the page around the block titles it.
   */
  label: string;
  /** GitHub-flavoured markdown; raw HTML in it is dropped, never rendered. */
  text: string;
  /**
   * The title the page already shows over the document. A document that
   * opens with that same `#` heading does not repeat it, and its sections
   * step up into the title's place.
   */
  title?: string;
  /**
   * The outline level the document's own `#` takes — one under the heading
   * that titles the block; deeper headings step down from it. Default 3.
   */
  headingLevel?: number;
}

/**
 * A document rendered to read — a prompt, a library preview. GitHub
 * flavour (tables, task lists, strikethrough, autolinks), every element in
 * the design system's own type and colour, and nothing the author did not
 * write: raw HTML is skipped and unsafe URL schemes are stripped, so a
 * markdown body from the model is safe to show as-is. Its headings sit
 * under the page's own, so a prompt written to stand alone never mints a
 * second page title.
 *
 * For text that must appear exactly as written — a rendered artifact whose
 * bracketed ids a finding cites — use `PreformattedText`.
 */
export function Markdown({ label, text, title, headingLevel = 3, ...rest }: MarkdownProps) {
  const components = componentsFor(headingLevel);
  const plugins = useMemo(
    () => (title === undefined ? [remarkGfm] : [remarkGfm, omitLeadingTitle(title)]),
    [title],
  );
  return (
    <Article aria-label={label} {...rest}>
      <ReactMarkdown remarkPlugins={plugins} components={components} skipHtml>
        {text}
      </ReactMarkdown>
    </Article>
  );
}
