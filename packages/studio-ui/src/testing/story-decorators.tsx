import '@xyflow/react/dist/style.css';

import { ReactFlowProvider } from '@xyflow/react';
import type { Decorator } from '@storybook/react-vite';
import { useState, type ReactNode } from 'react';

import { createCanvasStore, type CanvasStore } from '../features/canvas/canvas-store';
import { CanvasStoreProvider } from '../features/canvas/canvas-store-context';

/**
 * Shared Storybook decorators for canvas-adjacent components. Kept out of the
 * `*.stories.*` glob (this file is a helper, not a story) and free of
 * `next/*` imports — the catalog policy.
 */

/** React Flow context + a sized, positioned container + the RF stylesheet. */
export const withReactFlow: Decorator = (Story) => (
  <ReactFlowProvider>
    <div style={{ width: 480, height: 360, position: 'relative' }}>
      <Story />
    </div>
  </ReactFlowProvider>
);

function SeededStoreProvider({
  seed,
  children,
}: {
  seed?: (store: CanvasStore) => void;
  children: ReactNode;
}) {
  const [store] = useState(() => {
    const created = createCanvasStore();
    seed?.(created);
    return created;
  });
  return <CanvasStoreProvider store={store}>{children}</CanvasStoreProvider>;
}

/** A fresh canvas store per story mount, optionally pre-seeded. */
export function withCanvasStore(seed?: (store: CanvasStore) => void): Decorator {
  const decorator: Decorator = (Story) => (
    <SeededStoreProvider seed={seed}>
      <Story />
    </SeededStoreProvider>
  );
  return decorator;
}
