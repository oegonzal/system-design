import { NODE_KINDS } from '@sysdesign/contracts';

/**
 * Placeholder landing page. Its one real job today: importing from
 * `@sysdesign/contracts` proves the cross-package source resolution
 * (tsconfig paths + externalDir) end to end before anything is built on it.
 */
export default function IndexPage() {
  return (
    <main>
      <h1>System Design Studio</h1>
      <p>Building blocks ready for the canvas:</p>
      <ul>
        {NODE_KINDS.map((kind) => (
          <li key={kind}>{kind}</li>
        ))}
      </ul>
    </main>
  );
}
