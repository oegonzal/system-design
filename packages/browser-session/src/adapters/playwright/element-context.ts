/** The words around an element as the page shows them, which its context is composed from (`contextOf`). */
export interface ContextParts {
  /** What its `aria-describedby` names. */
  described: string;
  placeholder: string;
  /** The legend of the fieldset it sits in. */
  legend: string;
  /** The words just before a control whose name asks nothing. */
  preceding: string;
  /** What a file control accepts. */
  accepts: string;
}

/**
 * Its context: its description, its placeholder, its question — the legend
 * of its fieldset, the question its radios are named after, else the words
 * before it, one of them, never two — and what a file control accepts.
 */
export const contextOf = (parts: ContextParts, groupQuestion: string): string | null => {
  const question = parts.legend || groupQuestion || parts.preceding;
  const context = [
    parts.described,
    parts.placeholder,
    question,
    parts.accepts === '' ? '' : `accepts ${parts.accepts}`,
  ]
    .filter((part) => part.length > 0)
    .join(' · ');
  return context === '' ? null : context;
};
