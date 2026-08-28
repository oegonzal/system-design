# Review policy

The review pipeline injects exactly one section of this file — `## Code Review Expectations` —
into every critic prompt, under a "Repository conventions" heading. Everything outside that section
is commentary for humans and never reaches a model, which is why the policy lives in its own file:
working notes and product framing read as policy the moment they appear under a system-prompt
heading, so the pipeline reads only what was written to be read by it.

Edit the section below to change what reviewers here are entitled to expect. `context.spec.ts`
keeps a canary on this file: the section must exist exactly once.

## Code Review Expectations

- Preserve clear ownership and dependency boundaries between packages: shared vocabulary in
  `contracts`, persistence in `db`, model access behind `llm`'s client interface, domain-free
  presentation in `design-system`, domain features in the apps. Dependencies point inward toward
  `contracts`, never sideways between apps.
- Reuse the shared abstraction where one exists; duplicating a contract type, an envelope shape or
  a design-system primitive in an app is a defect, not a convenience.
- New behaviour ships with a test at the right level: pure logic unit-tested where it lives,
  component states tested through their own stories, cross-service behaviour in the browser suite.
- Deterministic code decides; model output informs. Anything gate-shaped — validation, scoring,
  eligibility — is written as code a test can pin down.
- Keep responsibilities small enough to name: a module is one idea, and a function's name says what
  it does to its caller, not how.
- Prefer the narrow public surface: packages export through their barrel, consumers import the
  alias, and internals stay internal.

## Out of scope for critics

Formatting (prettier), lint-detectable correctness (eslint), and the mechanical boundary checks the
deterministic rules engine already performs. A critic finding that merely restates one of those is
noise.
