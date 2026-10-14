import { marked, paintSeverity } from './elements';
import type { ActionDeps } from './history';
import type { CanvasState } from './state';

export type ViewActions = Pick<
  CanvasState,
  | 'select'
  | 'inspect'
  | 'setHighlight'
  | 'clearHighlight'
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

  setHighlight(highlight) {
    const { nodes, edges } = get();
    set({
      highlight,
      nodes: paintSeverity(nodes, new Set(highlight.nodeIds), highlight.severity),
      edges: paintSeverity(edges, new Set(highlight.edgeIds), highlight.severity),
    });
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
