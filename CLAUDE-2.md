## ROLE

- You are a master frontend and backend architect + senior software full stack engineer

# RULES

- Always design, plan, and implement with abstraction rather than hardcoding concrete implementation especially on core engine architecture. Do not use brittle hardcoded heuristics like word count, substring matching, prefixes, suffixes, etc for deterministic rules and business logic as these are anti-patterns and tend to weaken the application. Tend towards abstractions that can deal with any inputs, use-cases, prompts, events, etc
- KEEP planning, design, and implementation as consistent as possible project architecture and folder structure for cleasiness and consistency (also use IoC, SoC, SoT, Dry, modular, declarative, colocation, normalization, consistent contracts, best practice design patterns where possible as if you were an expert software architect). Design and implement using best practices: do not repeat, seperation of concerns, Source of Truth, Inversion of Control, core-engine/port/adapter patterns, decoupled, modular architecture
- Db changes should be done iteratively through migration steps via MikroORM
- Use Nx to prevent duplicating reusable Typescript types & interfaces, as well as react components, etc
- Keep implementations and designs simple, do not hallucinate
- Css should be designed as reuseable styled components using standardized theme and design system

## TASKS

- For critics/eval being structurally advisory and that LLM can never move the score - although true - it should definitely be the case that the critics/eval own an expertise or lens and return evidence that can be followed up deterministically for scoring (for example critics should note the weaknesses in the current inputs - including diagram, briefs, and narratives - against identified hard requirements from the prompt in a grounded, traceable, and identifiable manner. Thus, critic should note weaknesses based on the critics expertise and return rationals, severitys, requirement groundings, confidences, etc for different issues found based on its type/expertise in system design and evaluators should likewise do similar but based on their lens type as focused with fulfilling the requirement directly). ultrathink - assure to use existing architecture and focus refining with existing architecture if possible - it is okay to scale structures like critic types that find weaknesses (eg. focus on “What is wrong, where is it, how severe is it, and what components/rules could fix it?”), evaluators (eg. focus on “What does the evidence imply about objective alignment, completeness, feasibility, risk, future gain, etc?”) and engine deterministic and generic logic that use evidence and lens evaluation severities + confidences + rationales + factor evaluations (eg. 'none', 'low', 'medium', 'high', etc) to score and find improvement areas. Focus all efforts, while avoiding brittle hardcoded hearistics (eg. word counts, substrings, prefixes, suffixes, hardcoding, etc) from biasing logic, on sample prompt from /Users/oscargonzalez/Dev/interview-prep/system-design-prep/full-stack-order-history-brighton-and-shopify.pdf ultrathink
- verify will headed run playwright mcp on new tab on chrome browser to verify recent implementation works. Assure to complete the rest of the veriticals in LLM passes (critic, narrative, depth, workability, scenarios) if not completed. Also, for a components 'properties' panel on the ux - I don't really know how ops, knobs, fulfills, events are grouped in the panel or why they are even options for the component/ops. Are all these options available at the global level for all components? ultrathink also are they being critc-evaluated and making sure they are correct and not hanging? ultrathink additionally, since it may not be possible to know all ops, knobs, fulfills, events, etc then llm, if not already, should be suggesting arbitrary options in realtime that maybe another pipeline is verifying for fit and relevance rather than just always considering only from the finite set of hardcoded ops, knobs, fulfills, events, etc that are in project (if this is how it is currently working - i am not sure - thus check for me and assure flexibility and option space is flexible for best fit system design solutions and problem identification to a prompt ultrathink). It is a top priority to use existing functionality or resuse as much as possible and if refactor is needed for resuability then proceed. implementations should be modular and decoupled as best as possible ultrathink and try to keep new lines of code count low. aim for clean abstract code rather than hardcoded imperative code
- ultrathink next i want to know more about the critic and evaluator architecture. For coverage policy are critics finding weaknesses by critic specialty type and are evaluators grounding evidence by their lens type to requirements? ultrathink and evaluate deterministic rules and scoring are solid, especially for ensuring important requirements - including but not limited to functional, non-functional, and scale targets - are being met for the the prompt ultrathink and more importantly also make sure prompts are high quality and not too sparse/ambiguous in such a way that producing a system design would be too hard to grade upon ultrathink but do not over complicate the solution either. Lastly assure critic and evaluators use best practice for flexibility, extensibility, configurability, and declarativity in order to have good composable combinations of critic experts and evaluator lenses evaluating based on requirement grounding and coverage/type lenses if not already excelling in this ultrathink critics/evaluations ideally should be able to judge api and contract simplicity and effectiveness if system design component has an interface or api ultrathink remember do not overcomplicate implementation as I want code to stay clean and maintainable and i want to prevent maintaining legacy functionality or backwards compatibility or old contracts/interfaces. lastly ultrathink and assure critics/evaluators/modules/components/services/etc are not hardcoded to certain system design prompts when the goal of the project is to fairly and generically apply best practices principles to any type of prompt and system design - thus pipeline and engine should not be bias to hardcoded use cases and should focus on best practices patterns lenses and expertise, use most relevant lenses/expertise for prompt use cases, and output fair feedbacks/revisions. This should be more of a refinement round rather than completely new implementations

## PROJECT

- System Design application with interactive diagraming UX to practice distribited system, backend systems, full stack systems software engineering. Use /Users/oscargonzalez/Dev/interview-prep/system-design-prep/Resume_a2.pdf for generating system design prompts based on users relevant professional experience. Should also use a dedicated background process that is a critic/eval pipeline to give feedback and grade users response to each prompt.

## REQUIREMENTS

- DESIGN interactive UX with system design components (all components that apply like gateway, database, queue, event stream, etc)
- Prompt generator for designing system based on similar systems from users experiences in resume found in /Users/oscargonzalez/Dev/interview-projects/chorus/engineering-interview
- critic/eval live pipeline to grade and feedback user's results iteratively and help generate correction / improvement designs to users design on the UX - goal is to teach user and maximize their knowledge of best practices in system design and distributed systems for super scalable architectures
- lastly, persisting and developing the users repository for STAR method responses to different system design interview questions and user's past production level features experiences

## TOOLS

- Typescript
- Tilt w/ kubernetes
- git init + npm init
- ci/cd pipeline + git-actions + lint/build/format + critic/evaluator pipeline (critics::: reusability/mono-structuring/types | testability | readability/coupling —> evaluator -> deterministic rules by engine)
- Monorepo Nx
- React w/ Nextjs / React
- React Flow = diagram/node-editor engine
- Nodejs w/ Nestjs framework
- Postgres w/ MikroORM
- ERD / common types / interfaces
- Migrations w/ MikroORM
- DTO validation pipeline, service/controller, dto / monorepo contracts for common typescript interfaces/types, restful calls
- Vitest / Playwright
- CI/CD code review
- EmotionCSS
- Reusable components (w/ event-listeners & modularity & decoupling) library
- Theming & design-system
- Storybook
