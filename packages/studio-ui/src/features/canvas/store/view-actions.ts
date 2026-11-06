import { focusPainted, marked, paintFocus, paintSeverity } from './elements';
import type { ActionDeps } from './history';
import type { CanvasState } from './state';

export type ViewActions = Pick<
  CanvasState,
  | 'select'
  | 'inspect'
  | 'setHighlight'
  | 'clearHighlight'
  | 'focusPath'
  | 'clearFocus'
  | 'setReadOnly'
  | 'requestFit'
  | 'attachViewport'
>;

/** What the author sees, not what they made: selection, highlight, read-only, framing. None is an edit. */
export const viewActions = ({ set, get }: ActionDeps): ViewActions => ({
  select(id) {
    const { nodes, edges } = get();
    set({ selectedId: id, nodes: marked(nodes, id), edges: marked(edges, id) });
  },

  inspect(id) {
    const { nodes, edges, selectedId } = get();
    if (id === selectedId) return;
    const element = nodes.find((node) => node.id === id) ?? edges.find((edge) => edge.id === id);
    if (!element?.selected) return;
    set({ selectedId: id });
  },

  // A finding's highlight and a shown path exclude each other: an element the
  // finding points at must never be the one dimmed off the path.
  setHighlight(highlight) {
    const { nodes, edges } = get();
    const unfocused = paintFocus(nodes, edges, null);
    set({
      highlight,
      focus: null,
      nodes: paintSeverity(unfocused.nodes, new Set(highlight.nodeIds), highlight.severity),
      edges: paintSeverity(unfocused.edges, new Set(highlight.edgeIds), highlight.severity),
    });
  },

  focusPath(criterionId) {
    const { nodes, edges, bindings } = get();
    set({
      highlight: null,
      ...focusPainted({
        nodes: paintSeverity(nodes, new Set<string>(), null),
        edges: paintSeverity(edges, new Set<string>(), null),
        bindings,
        focus: { criterionId },
      }),
    });
  },

  clearFocus() {
    const { nodes, edges, focus } = get();
    if (!focus) return;
    set({ focus: null, ...paintFocus(nodes, edges, null) });
  },

  clearHighlight() {
    const { nodes, edges, highlight } = get();
    if (!highlight) return;
    set({
      highlight: null,
      nodes: paintSeverity(nodes, new Set<string>(), null),
      edges: paintSeverity(edges, new Set<string>(), null),
    });
  },

  setReadOnly(readOnly) {
    const { history } = get();
    set({ readOnly, history: { ...history, openKey: null } });
  },

  requestFit() {
    set({ fitRequest: get().fitRequest + 1 });
  },

  attachViewport(viewport) {
    set({ viewport });
  },
});
