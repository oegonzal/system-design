/**
 * Transient prop filtering.
 *
 * Emotion forwards every prop to the DOM for a string tag, which is how style
 * props end up as invalid HTML attributes and React console warnings. The
 * house convention is a `$` prefix for props that exist only to drive styles,
 * and this predicate is the one place that convention is enforced:
 *
 *     const Root = styled('button', transient)<{ $variant: Variant }>`…`;
 *
 * `@emotion/is-prop-valid` is deliberately not used. It is a separate package
 * that pnpm's strict layout would require declaring explicitly, and it solves
 * a different problem — guessing which arbitrary props are valid HTML — that
 * the `$` convention makes unnecessary.
 *
 * `as` is filtered even though it carries no `$`. Emotion decides whether to
 * honour `as` by asking `shouldForwardProp('as')` and treating a `true` answer
 * as "the caller wants this on the DOM": with a naive predicate,
 * `<Root as="main">` renders `<div as="main">` — the tag is not swapped and
 * the attribute leaks. `Stack` and `Surface` both need real landmark and list
 * semantics, so this exclusion is what makes their `as` prop work at all. The
 * only thing it costs is `styled('link', transient)`, where `as` is a genuine
 * HTML attribute; nothing here renders a `<link>`.
 */
export const transient = {
  shouldForwardProp: (prop: string) => prop !== 'as' && !prop.startsWith('$'),
};
