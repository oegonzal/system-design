/**
 * Tailwind runs as a PostCSS plugin, not through @tailwindcss/vite. The Vite
 * plugin resolves its `vite` peer from the workspace root, which pins the Vite
 * every other package builds with, while Astro bundles its own newer Vite — and
 * the plugin calls Vite at runtime, so one build would mix two Vites. The
 * PostCSS plugin depends on neither.
 */
export default {
  plugins: { '@tailwindcss/postcss': {} },
};
