# System Design Studio

Practice distributed-systems design on an interactive canvas. Generate interview
prompts grounded in real production experience, sketch the architecture with
system-design building blocks (gateways, load balancers, services, databases,
caches, queues, event streams, …), and get graded, teaching-oriented feedback
from a critic/eval pipeline — then iterate until the design holds up.

> Full setup, architecture and workflow docs land alongside the packages they
> describe. This README grows with the workspace.

## Workspace

pnpm + Nx monorepo. Packages carry a `project.json` (no per-package
`package.json`); all dependencies are hoisted to the root and Nx is the single
entry point for every target.

```
pnpm install
pnpm exec nx run-many -t lint typecheck test build --all
```
