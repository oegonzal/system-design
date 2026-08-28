/**
 * Side-effect stylesheet imports (`import '@xyflow/react/dist/style.css'`)
 * have no type declarations of their own; the bundlers handle the CSS, this
 * keeps tsc satisfied.
 */
declare module '*.css';
