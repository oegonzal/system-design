import type { Criterion } from './criterion';

/**
 * The memory host's client (packages/agentic-memory-client): one port onto a
 * memory space for every agent, its HTTP adapter, the binding an agent
 * declares, and the in-process adapter a consumer's specs run on.
 */
export const AGENTIC_MEMORY_CLIENT_CRITERIA: readonly Criterion[] = [
  {
    id: 'AMC-1',
    statement:
      "One port onto the memory host serves every agent that keeps memories in a space: its HTTP adapter sends each verb on its declared route and unwraps the envelope, reads a space or a digest the host says it does not have as null — a 404 naming what is missing, never one naming nothing — and raises transport-agnostic errors — unreachable, timed out, refused with the host's status, code, message, issues and what was missing, or a strategy that did not compile with its report — under a declared timeout that covers the body as well as the answer, deciding nothing from a refusal's prose.",
  },
  {
    id: 'AMC-2',
    statement:
      'A caller may declare how long it rides out a restarting host: within that window a repeatable call that nobody answered, or that the host failed, is asked again at the declared pause; a write is never asked twice, since a dead socket does not tell a call the host received from one that never arrived; a call the host held past its time is never asked again; which calls are repeatable — the reads, and the ensure, idempotent by name — is declared once as data beside their routes; and a caller that declares nothing is never kept waiting.',
  },
  {
    id: 'AMC-3',
    statement:
      "An agent declares what it needs of a space as data — the named space and the run it is made from, the register each role names with the kind, operations and metadata fields it will use, and the scope keys it will name — and the binding is checked once against the space's compile report and declared scope keys before the agent starts, refusing every unmet need by role and by name; a space that does not compile binds nothing.",
  },
  {
    id: 'AMC-4',
    statement:
      "The in-process adapter serves the same port over the runtime on in-memory stores, parsing each request with the contracts schema the host's door uses and raising the same errors from the runtime's refusals, so a consumer's spec proves identity, supersession, scope visibility and refusals against the engine rather than a script; it is reached from the testing entry alone, and the production barrel reaches contracts alone.",
  },
];
