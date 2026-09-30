import styled from '@emotion/styled';
import type { HTMLAttributes, ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { Heading, type HeadingLevel } from '../heading/heading';
import { Link } from '../link/link';
import { Stack } from '../stack/stack';
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

/**
 * The document's own `#` is the block's label, one level above, so its
 * headings step down: `#` → h3, `##` → h4, `###` → h5, the rest → h6. A
 * prompt written to stand alone never mints a second page title.
 */
const heading = (level: HeadingLevel) =>
  function DemotedHeading({ children }: Rendered) {
    return <Heading level={level}>{children}</Heading>;
  };

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

const COMPONENTS: Components = {
  h1: heading(3),
  h2: heading(4),
  h3: 'h5',
  h4: 'h6',
  h5: 'h6',
  h6: 'h6',
  a: Anchor,
  li: ListItem,
  table: ScrollingTable,
};

const PLUGINS = [remarkGfm];

export interface MarkdownProps extends HTMLAttributes<HTMLDivElement> {
  /** The heading over the block, and the block's accessible name. */
  label: string;
  /** GitHub-flavoured markdown; raw HTML in it is dropped, never rendered. */
  text: string;
}

/**
 * A document rendered to read — a prompt, a library preview. GitHub
 * flavour (tables, task lists, strikethrough, autolinks), every element in
 * the design system's own type and colour, and nothing the author did not
 * write: raw HTML is skipped and unsafe URL schemes are stripped, so a
 * markdown body from the model is safe to show as-is.
 *
 * For text that must appear exactly as written — a rendered artifact whose
 * bracketed ids a finding cites — use `PreformattedText`.
 */
export function Markdown({ label, text, ...rest }: MarkdownProps) {
  return (
    <Stack gap={2} {...rest}>
      <Heading level={3}>{label}</Heading>
      <Article aria-label={label}>
        <ReactMarkdown remarkPlugins={PLUGINS} components={COMPONENTS} skipHtml>
          {text}
        </ReactMarkdown>
      </Article>
    </Stack>
  );
}
