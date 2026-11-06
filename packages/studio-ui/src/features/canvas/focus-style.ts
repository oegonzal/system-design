import type { CSSProperties } from 'react';

/** How far an element off the shown path fades: present, legible, plainly not the point. */
export const OFF_PATH_OPACITY = 0.35;

/**
 * The dimming of an element off the shown path, as inline style — like the
 * line's stroke and the pill's place, so a copy of the diagram (the PDF)
 * keeps it. Nothing while no path is shown or the element is on it.
 */
export const dimmedStyle = (onPath: boolean | undefined): CSSProperties =>
  onPath === false ? { opacity: OFF_PATH_OPACITY } : {};
