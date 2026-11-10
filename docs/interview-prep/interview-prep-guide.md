# Lead Software Engineer Interview Prep — System Design and Résumé Defense

_Compiled 2026-11-02 from `docs/interview-prep/prep-material.md` (snapshot sha256 `df3b3791a42a…`). Every line of the source is preserved; the material was re-organised and formatted for print, and the current-project section was added from the repository's code and docs._

**How to use this document.** Part I is the résumé defense: for each company and bullet, the interviewer's questions with the answers, ordered as an interviewer would ask them; the table of contents doubles as a question bank for self-testing. Part II is the general system-design reference the questions draw on. Part III is security: a definitions catalog for quick lookup, the authentication and authorization best practices, and the security flows for Frequence, Gala and TicketSocket. Appendix A lists every **[VERIFY]** detail to confirm from memory, Appendix B indexes the material by theme (components, CI/CD, security, diagrams and more), Appendix C maps each bullet of the résumé the company holds to where it is covered, and Appendix D collects every spoken answer into one rehearsal script.

## Contents

- **Part I — Résumé Defense Playbook**
  - Gala Games & Entertainment — Lead Full Stack SE
    - 1. Full-stack engineering across Vue, React Native TV, APIs, and blockchain
      - Q1. “Draw the end-to-end architecture for one of those Gala product flows.”
      - Q2. “How did you divide responsibilities between the frontend, backend and blockchain?”
      - Q3. “How did you deal with eventual consistency between blockchain state and application state?”
      - Q4. “How did you keep Vue and React Native TV from duplicating domain logic?”
      - Q5. “Tell me about an architecture decision another senior engineer disagreed with.”
      - Follow-up: “You keep saying we. What did YOU own?”
    - 2. Gala Film creator-to-fan media, ownership and rewards
      - Q1. “Design the Gala Film platform.”
      - Q2. “Where do video, metadata and ownership live?”
      - Q3. “How do you efficiently determine NFT entitlement?”
      - Q4. “How do you prevent reward abuse?”
      - Q5. “Media says watched, blockchain unavailable. How do you eventually issue exactly one reward?”
    - 3. Gala NestJS/AWS/GCP/MongoDB at 10,000+ concurrency
      - Q1. “What changed between before and after scaling?”
      - Q2. “What was the bottleneck at 350, 1k, 5k, 10k?”
      - Q3. “How were NestJS services deployed? Stateless?”
      - Q4. “How was MongoDB modeled and indexed?”
      - Q5. “How did you verify 10,000 concurrent?”
      - Follow-up: “Why MongoDB instead of PostgreSQL?”
      - “Why AWS and GCP?”
      - “What state prevented NestJS from being completely stateless?”
      - “How did you handle DB connection pooling?”
    - 4. Vision API + vector search + Sanity
      - Q1. “Walk me through the pipeline.”
      - Q2. “What exactly did you send to Vision?”
      - Q3. “Where did vector search enter?”
      - Q4. “Which model and vector DB?”
      - Q5. “How did you prevent a wrong thumbnail from automatically publishing?”
    - 5. Token / ICO launch flows
      - Q1. “Design an ICO/token launch for a traffic spike.”
      - Q2. “How do you prevent over-purchasing or duplicates?”
      - Q3. “DB or blockchain as source of truth?”
      - Q4. “Blockchain succeeded but backend timed out.”
      - Q5. “How did you deploy something this high risk?”
  - Frequence + Madhive — Lead Senior SE
    - 6. Platform execution / engineering maturity
      - Q1. “What did engineering maturity concretely mean?”
      - Q2. “Draw omnichannel architecture.”
      - Q3. “What makes AdTech workflow systems difficult to scale?”
      - Q4. “What did you personally contribute?”
      - Q5. “What would an acquisition technical diligence team examine?”
    - 7. Technical direction across 30+ engineers/QAs
      - Q1. “How can you influence 30+ engineers?”
      - Q2. “How were architecture decisions proposed and enforced?”
      - Q3. “What PR standard changed quality?”
      - Q4. “What belongs in a shared design system?”
      - Q5. “Break down a large product request.”
      - Follow-up: “How did you handle disagreement?”
      - “How did you prevent yourself becoming the bottleneck?”
      - “How did offshore teams get sufficient context?”
    - 8. Angular widget framework
      - Q1. “What was a widget?”
      - Q2. “How did the system decide which widgets appeared?”
      - Q3. “How did widgets communicate?”
      - Q4. “How did you version framework changes?”
      - Q5. “How would you migrate it to React?”
    - 9. Playwright/Jest/Claude/Datadog testing
      - Q1. “Walk me through an actual test.”
      - Q2. “Where was Claude multimodal used?”
      - Q3. “Why AI instead of normal assertions?”
      - Q4. “How did tests run in CI?”
      - Q5. “Explain 50% bug reduction and 60% manual QA reduction.”
      - “How did you handle flaky tests?”
      - “How did you stop LLM nondeterminism from creating false failures?”
      - “What did Datadog contribute?”
    - 10. High-variation workflow validation
      - Q1. “What made workflows high variation?”
      - Q2. “How do you avoid combinatorial explosion?”
      - Q3. “How select representative configurations?”
      - Q4. “How structure fixtures?”
      - Q5. “CTV vs Spectrum TV vs Radio?”
  - TicketSocket & IceCreamSocial — Lead Full Stack SE
    - 11. AngularJS → React + TypeScript
      - Q1. “How do you migrate without freezing development?”
      - Q2. “How did AngularJS and React coexist?”
      - Q3. “How did you handle shared state?”
      - Q4. “What did TypeScript materially improve?”
      - Q5. “How did Storybook help?”
      - Follow-up: “Why React?”
      - Follow-up: “Why not modern Angular?”
      - Follow-up: “How did you measure improvement?”
    - 12. Configurable dashboards and white-label workflows
      - Q1. “Design the configuration system.”
      - Q2. “How determine branding, permissions and widgets?”
      - Q3. “How isolate tenant data?”
      - Q4. “How handle roles?”
      - Q5. “Real-time inventory vs historical reporting: same API?”
    - 13. PostgreSQL, stored procedures, triggers, webhooks, transactions
      - Q1. “Give me a real query/index improvement.”
      - Q2. “Why stored procedures/triggers?”
      - Q3. “Downsides of triggers?”
      - Q4. “How avoid DB update + event publication mismatch?”
      - Q5. “Duplicate/out-of-order Square webhook?”
    - 14. AWS ticketing scaling 350 → 10,000+
      - Q1. “Draw before and after.”
      - Q2. “What does JWT-based service allocation mean?”
      - Q3. “How prevent double-selling a seat?”
      - Q4. “One million users arrive at once.”
      - Q5. “How validate 10,000 concurrent?”
      - Follow-up: “Why Redis?”
      - Follow-up: “Why not Redis alone as seat source of truth?”
    - 15. Testing to 70% + Redocly/Swagger
      - Q1. “How do you get 90k lines from ~0 to 70%?”
      - Q2. “Which tests first?”
      - Q3. “Global threshold or changed code?”
      - Q4. “How test legacy code without DI?”
      - Q5. “How did Swagger/OpenAPI do more than documentation?”
      - Follow-up: “Why 70% instead of 100%?”
  - Visa — Full Stack Engineer
    - 16. Angular/D3 risk dashboard
      - Q1. “What was the data pipeline?”
      - Q2. “Raw operational data or aggregated read model?”
      - Q3. “Tens of thousands of D3 nodes?”
      - Q4. “Where was risk calculated?”
      - Q5. “How did dashboard reduce incidents by 30%?”
      - Follow-up: “Would 15-minute stale risk data be acceptable?”
    - 17. Real-time vendor portal
      - Q1. “What does real-time mean?”
      - Q2. “Draw vendor approval workflow.”
      - Q3. “How model independent departmental approvals?”
      - Q4. “How maintain audit history?”
      - Q5. “How measure 80% reduction?”
  - Enfav LLC and the personal projects — the current project: the quality-loop engine and agentic memory
    - 19. The quality loop: one shared AI core (producer → critics → evaluators → controller → trace)
      - Q1. “Draw the quality loop end to end.”
      - Q2. “Why separate critics, evaluators and a controller?”
      - Q3. “How is a pipeline defined?”
      - Q4. “How does the controller decide?”
      - Q5. “How do you keep bad LLM output from corrupting a run?”
      - Q6. “What is a run record, and how do you replay?”
      - Q7. “What did you measure, and what did you change because of a measurement?”
      - Follow-up: “What are the loop limits, and what happens when they are hit?”
      - Follow-up: “How do lessons get stored, and who reads them?”
      - Follow-up: “What is an orchestrator versus a pipeline?”
    - 20. Memory: digest and recall
      - Q1. “Design the memory system”
      - Q2. “Why digest through the quality loop?”
      - Q3. “Postgres plus Qdrant: what lives where?”
      - Q4. “How does recall work, and who sees it?”
      - Q5. “Admission, duplicates, retraction and unit scoping”
      - Q6. “The agentic-memory runtime and the job assistant's migration”
      - Follow-up: “What is the consistency model of the memory store?”
      - Follow-up: “Qdrant is down in the middle of a digest. What happens?”
      - Follow-up: “How do you re-index safely?”
    - 21. Platform, delivery, security and observability
      - Q1. “Draw the deployment topology.”
      - Q2. “CI/CD: what gates a change?”
      - Q3. “Security: model access, secrets, tenancy, trust.”
      - Q4. “Observability: what did a run do, and is the loop healthy?”
      - Q5. “A production failure and what you changed.”
      - Follow-up: “How would you scale this to many tenants and concurrent runs?”
      - Follow-up: “What would you change first to make it a production multi-tenant service?”
    - 22. The same engine behind the Studio and browser automation; ownership and evidence
      - Q1. “How does the Studio grade a canvas with this engine?”
      - Q2. “How does a browser session become a quality-loop run?”
      - Q3. “What did you personally own, and what evidence backs the numbers?”
  - Personal Project — Agentic Engine (the résumé's DAG / graph-search wording, kept for reference)
    - 18. Agentic Engine
      - Q1. “How does natural language become a DAG?”
      - Q2. “Why DAG? What about loops?”
      - Q3. “Where do critics/evals enter?”
      - Q4. “Explain beam search.”
      - Q5. “How do JSON schemas protect against LLM nondeterminism?”
      - Q6. “XState vs DAG?”
      - Q7. “How does MCP fit?”
      - Q8. “Explain the RAG pipeline.”
      - Q9. “Node 8 fails after 7 side effects.”
      - Q10. “How horizontally scale thousands of workflows without executing a node twice?”
  - The 10 cross-cutting questions they can ask about any bullet
    - 1. “Draw it.”
    - 2. “What did you personally own?”
    - 3. “Why that technology?”
    - 4. “What was the scale?”
    - 5. “What happens when it fails?”
    - 6. “How do you prevent duplicates?”
    - 7. “What consistency do you need?”
    - 8. “How do you observe it?”
    - 9. “How is it secured?”
    - 10. “How do you know your resume metric is true?”
  - The answer structure I recommend memorizing
- **Part II — System Design Reference**
  - 0. Study notes: API gateway responsibilities, S3 event notifications, fan-out, and the problem → component map
    - The components that come up most often in interviews
    - API gateway responsibilities
    - Why Infrastructure Wins Over Application Code
    - Approach 1: The Cloud/Infrastructure Way (Recommended)
    - The interview mindset
    - Fan-out for feeds
    - S3 event notifications
    - How S3 Natively Interfaces with a Queue
    - Why This Design Makes Sense (The Architecture Breakdown)
    - The problem → component map
  - 1. Common components of a scalable system
    - The components that come up most often in interviews
    - A common scalable architecture to keep in your head
  - 2. Ten high-yield architectures, a notification system, and the pattern behind them
    - 1. URL Shortener
    - 2. Twitter / X News Feed
    - 3. Instagram / Image Sharing
    - 4. YouTube / Video Streaming
    - 5. WhatsApp / Real-Time Chat
    - 6. Uber / Lyft
    - 7. Amazon / E-Commerce Checkout
    - 8. Ticketmaster / Flash-Sale Ticketing
    - 9. Google Drive / Dropbox
    - 10. Search Engine / Elasticsearch-Style Search
    - Bonus: Notification System
    - The pattern you should recognize in almost every interview
    - For your interview in one hour, memorize this sequence
  - 3. SQL vs NoSQL, database indexes, and Kafka event streaming
    - 1. SQL vs. NoSQL — when to use each
    - 2. Database indexes
    - 3. Why not index everything?
    - 4. Is Elasticsearch/OpenSearch also an "index"?
    - 5. Kafka / event streaming
    - 6. Real Kafka example
    - 7. How do I determine Kafka topics?
    - 8. Kafka partitions
    - 9. How do you choose the partition key?
    - 10. What is a consumer group?
    - 11. Different consumer groups = pub/sub
    - 12. Topic vs partition vs consumer group
    - 13. Example interview architecture
    - 14. Kafka vs normal message queue
    - Interview cheat sheet
  - 4. Cassandra and wide-column databases
    - Why use Cassandra?
    - Why is it called "wide-column"?
    - Cassandra vs PostgreSQL
    - Cassandra vs MongoDB
  - 5. Explaining security at TicketSocket: Auth0 identity federation and merchant payment processors
    - 1. White-label authentication with Auth0
    - 2. The JWT might contain tenant context
    - 3. Don't claim an exact Auth0 configuration you don't remember
    - Payment processors: think “tenant-scoped provider adapters”
    - Payment authorization needs multiple layers
    - A very strong way to connect both sides in your interview
  - 6. Edge layer, admission tokens, sessions, and cookies in a waiting-room flow
    - 1. What exactly is the “edge layer”?
    - 2. What is an admission token?
    - 3. Why use an admission token?
    - 4. Admission token vs login JWT
    - 5. What is a session?
    - 6. What is a cookie?
    - 7. Cookie vs session
    - 8. Where would session state be stored?
    - 9. Or you can avoid server-side sessions
    - 10. How does the browser get redirected?
    - 11. What happens after the user gets admitted?
    - 12. Should the client also check?
    - 13. The proper design is both client and server enforcement
    - 14. Full example
    - 15. What do Secure / HttpOnly / SameSite mean?
    - 16. Queue polling
    - 17. Client redirects after admission
    - 18. What if the user manually changes the URL?
    - 19. Page route vs API route
    - 20. A complete architecture
    - 21. One subtle point: authenticated vs anonymous buyers
    - 22. A good session model
    - 23. What I'd do in a real design
    - The simplest mental model
- **Part III — Security, identity and authorization**
  - 7. Security catalog — quick-reference definitions
    - Identity, federation and protocols
    - Tokens and claims
    - Access control and tenancy
    - Sessions and the browser
    - Strong authentication
    - Keys, signatures, replay and integrity
    - Secrets, least privilege and infrastructure
    - Browser boundaries that are not security
    - Web3 transactions
    - Alphabetical index of terms
    - The security mental model
  - 8. Authentication and authorization — best practices and flows
    - Authentication flow
    - Authorization flow
    - Best-practice split between gateway and service
    - RBAC vs ABAC
    - Multi-tenant security
    - Sessions vs JWTs
    - Token lifetimes
    - Cookies
    - CSRF vs XSS
    - Service-to-service authentication
    - Secrets management
    - Password storage
    - Authorization should be deny-by-default
    - Policy layer
    - API design: 401 vs 403
    - Authorization and database queries
    - Rate limiting and abuse prevention
    - Logging and audit
    - Distributed tracing
    - CI/CD security
    - Failure behavior
    - Key rotation
    - A strong interview system-design answer
  - 9. Security by company — Frequence multi-tenant SaaS, Gala Web3 accounts and inventory, TicketSocket SSO, payments and webhooks
    - Frequence/Madhive — multi-tenant SaaS security
      - Lead-level architecture
      - Layer the tenant isolation
      - RBAC + ABAC
      - Frontend responsibility
      - Frequence CI/CD security flow
    - Gala — account, wallets, token transactions and scarce digital inventory
      - 1. Gala account authentication
      - 2. Proving wallet ownership
      - 3. Sensitive token/collectible transaction
      - 4. Preventing replay and duplicate token transactions
      - 5. Protecting collectible/token inventory
      - 6. Crypto key safety
      - Gala CI/CD and launch security
    - TicketSocket — white-label SSO, tenant identity and merchant payment processing
      - TicketSocket SSO: existing merchant user → white-label TicketSocket
      - Full redirect flow
      - Safe JWT/token handling
      - Never put bearer tokens in URLs
      - Tenant isolation after SSO
      - TicketSocket payment-provider architecture
      - Merchant payment credentials
      - Card data/tokenization
      - Ticket purchase + payment security
      - Idempotent payment flow
      - Signed webhook verification
      - Out-of-order webhook handling
      - Merchant refund authorization
      - TicketSocket CI/CD security flow
    - Gala vs Frequence vs TicketSocket — security comparison
    - What “zero trust” means in these systems
    - Three 60-second interview answers to memorize
      - Frequence
      - Gala
      - TicketSocket
- **Appendix A — Pre-interview checklist: every [VERIFY] marker**
- **Appendix B — Theme index: components, CI/CD, security, diagrams and more**
- **Appendix C — Where each bullet of the résumé the company holds is covered**
- **Appendix D — Rehearsal script: every spoken answer in one place**

# Part I — Résumé Defense Playbook

This part pairs every interviewer question with its answer, résumé bullet by résumé bullet. Two requests produced the material; both are kept here so the framing is clear.

> **Original request (questions):** I have an interview with a company who keeps grilling me hard on the resume i have attached. For each item of my job experiences (do not miss a single one) can you emulate being a lead software engineering interviewer interviewing me for a lead role and ask me system design type questions, a few questions for each of the points i have under each company in EXPERIENCE section. It is very important not to miss a single point since they really use the resume past experience company points and personal projects points to ask how i accomplished what i satated on each point and how i system designed it - do not miss a single point to make a few questions for

> **Original request (answers):** Now for each question (without missing a single one) can you produce a technical response highlighting key points like system design components thouroughly, ci/cd, security, diagrams, but not limited to those so etc points too. Be very detailed with response to each question as if that question was crucial for landing the lead technical software engineer role and take your time with responses ultrathink

**The interviewer's opening note.** Yes. I went through the attached resume line-by-line. There are 17 distinct EXPERIENCE bullets plus 1 Personal Project bullet, and I cover every one below. I’d expect a hard Lead Engineer interviewer to treat every quantified or architectural claim as an invitation to drill down into what you personally owned, architecture, data flow, scale, consistency, failure behavior, security, observability, and tradeoffs.

A strong practice rule: answer the first question for each bullet in ~90 seconds, then assume the interviewer interrupts with the remaining questions.

**The answer playbook's opening note.** Yes. I’ll treat this as a **Lead Engineer resume-defense playbook**.

One important constraint: your resume establishes the claims, technologies, and outcomes, but it does **not** establish every low-level implementation detail an interviewer could ask about. I won’t manufacture past experience for you. When the resume or details you’ve already given me support something, I’ll write it as an interview-ready first-person answer. Where you need to confirm an implementation detail from memory, I’ll mark it **[VERIFY]**. Before the interview, replace those with what you actually did.

I’m covering **every question and follow-up from the previous response**, including the cross-cutting questions at the end.

**How to read this part.** Each company section lists its résumé bullets. Under each bullet, every interviewer question appears as **Interviewer:** followed by **Answer**. The answers are written to be defended, not recited: anything marked **[VERIFY]** is a detail only you can confirm, and Appendix A collects every such marker into one checklist.

## Gala Games & Entertainment — Lead Full Stack SE

_Security flows for this company: Part III › 9. Security by company › Gala — account, wallets, token transactions and scarce digital inventory; definitions in Part III › 7. Security catalog._

Your resume has five Gala bullets spanning the Vue/React Native/backend/blockchain surfaces, Gala Film, 10,000+ concurrency, Vision/vector/Sanity automation, and token/ICO launch ownership.

Your resume claims five distinct Gala areas: full-stack collectibles/Film/Web3 work, Gala Film delivery, Node/NestJS scalability to 10,000+ concurrent users, Vision/vector/Sanity automation, and production-critical token/ICO launches. _Oscar Gonzalez - Lead Engineer …_

### 1. Full-stack engineering across Vue, React Native TV, APIs, and blockchain

> **Résumé bullet:** 1. “Drove full-stack engineering for Gala collectibles, Film, and Web3 launch workflows across Vue.js web, React Native TV, backend APIs, and blockchain product surfaces.”

Lead interviewer questions:

#### Q1. “Draw the end-to-end architecture for one of those Gala product flows.”

**Interviewer:** “Draw the end-to-end architecture for one of those Gala product flows. Start at the Vue or React Native client and take me all the way through your APIs and blockchain interaction. What were the major services and data stores?”

**Answer**

A strong answer is to choose **one concrete product**, rather than attempting to describe all of Gala.

For example, collectibles:

```text
                         USER
                          │
                ┌─────────┴──────────┐
                │                    │
                ▼                    ▼
          Vue.js Web App       React Native TV
                │                    │
                └─────────┬──────────┘
                          │ HTTPS
                          ▼
                   API Gateway / LB
                          │
                          ▼
                 Node.js / NestJS API
                          │
        ┌─────────────────┼──────────────────┐
        │                 │                  │
        ▼                 ▼                  ▼
     MongoDB          Auth/User State     CMS / Media
        │                                    │
        │                                    ▼
        │                                  Sanity
        │
        ▼
 Blockchain Integration Layer
        │
        ▼
 GalaChain / Web3 infrastructure
```

I would explain it like:

> “I separated the system into client presentation, application/domain services, off-chain application state, and blockchain state. Vue and React Native TV were clients rather than authoritative stores. NestJS APIs normalized access to user state, collectible metadata, entitlement information, and blockchain workflows. MongoDB handled application-oriented state where fast application queries were more appropriate than querying the blockchain directly. Blockchain calls were isolated behind an integration layer because chain interactions have very different latency and failure semantics from ordinary database calls.”

For an asynchronous blockchain operation:

```text
Client
  │
  │ POST action
  ▼
NestJS
  │
  ├── validate user
  ├── validate request
  ├── persist PENDING operation
  │
  ▼
Blockchain interaction
  │
  ├── submitted
  ├── confirmation/finalization
  │
  ▼
Update application state
  │
  ▼
Client sees COMPLETED
```

Lead-level points to mention:

- clients are not trusted sources of ownership;
- blockchain access is abstracted;
- state transitions should be explicit;
- chain operations should be idempotent where possible;
- long-running operations should not hold an HTTP request open indefinitely;
- retries must distinguish “request failed” from “transaction may have succeeded.”

For CI/CD, a sensible architecture would include:

```text
PR
 ↓
lint + typecheck
 ↓
unit/integration tests
 ↓
build Vue / RN / Nest artifacts
 ↓
security/dependency scanning
 ↓
staging
 ↓
E2E/smoke tests
 ↓
production deployment
```

Use that only to the extent it matches your actual pipeline.

---

#### Q2. “How did you divide responsibilities between the frontend, backend and blockchain?”

**Interviewer:** “You mention web, TV, APIs, and blockchain in one bullet. How did you divide responsibilities between those layers? What business state lived in your backend versus on-chain?”

**Answer**

Interview-ready answer:

> “I tried to keep each layer responsible for the type of state it was best suited to own. The frontend owned presentation and transient UX state. Backend services owned application workflows, authorization, metadata, caching and integration orchestration. Blockchain was used for state that actually needed blockchain guarantees—for example digital ownership or blockchain-native transactions. I specifically would not have the client directly decide that a user owned an asset based on client state.”

Think:

```text
Frontend
--------
rendering
navigation
local UX state
optimistic UI

Backend
-------
authorization
business rules
aggregation
CMS integration
user/application state
blockchain orchestration

Blockchain
----------
canonical on-chain ownership
token transactions
immutable blockchain state
```

A strong phrase is:

> “The blockchain was a system of record for blockchain-native state, but it was not the optimal read model for every user-facing screen.”

That explains why an application database/cache may still exist.

---

#### Q3. “How did you deal with eventual consistency between blockchain state and application state?”

**Interviewer:** “How did you deal with eventual consistency between blockchain state and application state? Suppose a transaction was submitted but not yet finalized—what did the user see?”

**Answer**

Treat chain interaction as a **state machine**, not a synchronous database call.

```text
REQUESTED
    │
    ▼
SUBMITTED
    │
    ▼
PENDING_CONFIRMATION
    │
    ├── FAILED
    │
    ▼
CONFIRMED
```

I would answer:

> “The main issue is that successful submission is not the same as final blockchain confirmation. I would persist the transaction identifier and internal operation state, expose a pending state to the client, and reconcile chain state asynchronously. The UI could optimistically show ‘processing,’ but I would not show final ownership until the confirmation criteria were met.”

Example schema:

```text
blockchain_operations
---------------------
operation_id
user_id
transaction_hash
operation_type
status
created_at
confirmed_at
error_code
```

If the API process dies after submission:

```text
NestJS ── submit ──> Blockchain
  X
process dies

Reconciler
   │
   ├── finds SUBMITTED operation
   ├── checks transaction_hash
   └── moves to CONFIRMED / FAILED
```

That is much safer than blindly retrying and potentially issuing a second chain transaction.

---

#### Q4. “How did you keep Vue and React Native TV from duplicating domain logic?”

**Interviewer:** “How did you prevent the Vue web app and React Native TV application from implementing different versions of the same domain logic? What did you share versus intentionally keep platform-specific?”

**Answer**

You want to distinguish **shared domain contracts** from **platform-specific presentation**.

```text
                   Shared packages
                 ┌──────────────────┐
                 │ API types        │
                 │ schemas          │
                 │ domain enums     │
                 │ validation       │
                 │ DTOs             │
                 └────────┬─────────┘
                          │
             ┌────────────┴───────────┐
             ▼                        ▼
          Vue Web               React Native TV
          browser UX            remote-control UX
```

Good answer:

> “I would share API contracts, domain types, state definitions and reusable business rules where they were genuinely platform-independent, but I would not force web UI components into TV. TV has completely different focus navigation, remote-input and playback UX requirements.”

For example:

```ts
type EntitlementStatus = 'LOCKED' | 'AVAILABLE' | 'OWNED' | 'PENDING';
```

Both apps can share that model while implementing different views.

---

#### Q5. “Tell me about an architecture decision another senior engineer disagreed with.”

**Interviewer:** “Tell me about one architecture decision you personally made here that another senior engineer disagreed with. What alternatives did you evaluate, and why did your design win?”

**Answer**

This must come from a real disagreement. Do **not invent one**.

Use this format:

> “The decision was X. The competing design was Y. I compared them using scalability, implementation complexity, failure isolation, developer velocity and migration risk. We prototyped or measured Z. I ultimately recommended X because ____. The important part was that I documented the tradeoff and changed my position where the other design had better evidence.”

Lead interviewers care more about:

```text
disagreement
   ↓
technical criteria
   ↓
evidence
   ↓
decision
   ↓
follow-up measurement
```

than whether you “won.”

---

**Likely pressure follow-up:**

#### Follow-up: “You keep saying we. What did YOU own?”

**Interviewer:** “You keep saying ‘we.’ What specifically did you architect or implement?”

Be prepared to name an actual service, API, state machine, data model, component or infrastructure decision.

**Answer**

Say something like:

> “The broader product was obviously a team effort. My personal ownership was at the architecture and implementation boundaries I can defend in detail. For example, I personally worked on [VERIFY: specific NestJS service/API], [VERIFY: specific Vue/TV flow], and [VERIFY: blockchain/CMS integration]. I can walk through the code-level design of those pieces separately from work done by the rest of the team.”

Always separate:

```text
Team outcome
vs.
My design
vs.
My implementation
vs.
My review/leadership
```

---

### 2. Gala Film creator-to-fan media, ownership and rewards

> **Résumé bullet:** 2. “Led Gala Film application delivery for creator-to-fan media flows, digital ownership, NFT collectibles, and reward-driven viewer experiences.”

#### Q1. “Design the Gala Film platform.”

**Interviewer:** “Design the Gala Film platform for me. How does a creator upload content, how is that content processed, and how does a viewer ultimately stream it?”

**Answer**

A solid media architecture:

```text
Creator
   │
   │ upload metadata/content
   ▼
CMS / Upload API
   │
   ├───────────────► Sanity CMS
   │
   ▼
Object Storage
   │
   ▼
Media Processing Pipeline
   │
   ├── transcode
   ├── thumbnails
   ├── metadata
   └── moderation/classification
   │
   ▼
Media Origin
   │
   ▼
CDN
   │
   ▼
Viewer

Viewer App
   │
   ▼
Playback API
   │
   ├── authenticate
   ├── entitlement check
   └── signed playback authorization
```

Separate **control plane** and **media plane**:

```text
Control plane
-------------
metadata
entitlement
user state
ownership
rewards

Media plane
-----------
large video objects
streaming
CDN
transcoding
```

The API should not stream gigabytes through NestJS.

---

#### Q2. “Where do video, metadata and ownership live?”

**Interviewer:** “Where would you store the actual video versus metadata versus ownership information? Why would you choose object storage, MongoDB, blockchain, or another store for each?”

**Answer**

Answer:

> “I would use specialized stores. Large immutable video blobs belong in object storage/CDN. Editorial metadata belongs in a CMS or application database. Blockchain-native ownership belongs on-chain, while a query-optimized application projection can make entitlement checks fast.”

```text
Video             → object storage/CDN
Film metadata     → Sanity/application store
User app state    → MongoDB
Blockchain asset  → GalaChain
Fast entitlement  → backend projection/cache [if used]
```

Why not MongoDB for video?

> “Databases are optimized for structured records and queries, not cost-effective delivery of multi-gigabyte media assets.”

---

#### Q3. “How do you efficiently determine NFT entitlement?”

**Interviewer:** “How did you represent digital ownership? If a user owned an NFT that unlocked a film or reward, how did the application efficiently determine entitlement without querying the blockchain for every page request?”

**Answer**

Avoid:

```text
every playback request
       ↓
live blockchain query
```

because chain calls can be slow and unreliable.

Instead:

```text
Blockchain events
      │
      ▼
Ownership indexer
      │
      ▼
Query-optimized ownership projection
      │
      ▼
Entitlement Service
      │
      ▼
Playback decision
```

An entitlement cache might be:

```text
(user_id, asset_id) → OWNED / NOT_OWNED
```

Security principle:

> “The cache can accelerate the decision, but its provenance must ultimately trace back to authoritative ownership state.”

If Gala actually queried through a specific GalaChain service rather than indexing, describe the real approach.

---

#### Q4. “How do you prevent reward abuse?”

**Interviewer:** “Design the reward flow. A user watches content and earns a reward. How do you prevent someone from replaying requests or opening 100 browser sessions and claiming the same reward repeatedly?”

**Answer**

The core requirement is:

```text
one eligible activity
→ at most one reward
```

Use an eligibility ID/idempotency key:

```text
reward_key =
user_id + content_id + reward_window
```

Then enforce uniqueness:

```sql
UNIQUE(reward_key)
```

Architecture:

```text
Playback telemetry
      │
      ▼
Eligibility Service
      │
      ├── auth user
      ├── validate watch criteria
      ├── anti-abuse checks
      │
      ▼
Reward Event
      │
      ▼
Queue
      │
      ▼
Reward Worker
      │
      ├── atomic idempotency check
      └── blockchain reward
```

Also discuss:

- authenticated user identity;
- server-generated playback/session IDs;
- minimum watch duration;
- impossible event sequencing;
- device/session limits if applicable;
- rate limits;
- anomaly/fraud detection.

Do not trust:

```text
POST /reward
{
  "watchedMovie": true
}
```

from the client.

---

#### Q5. “Media says watched, blockchain unavailable. How do you eventually issue exactly one reward?”

**Interviewer:** “What happens when the media system says the viewer finished the movie but the blockchain/reward system is temporarily unavailable? How would you guarantee the reward eventually gets issued without issuing it twice?”

That last question invites:

```text
Viewer event
    ↓
Reward eligibility
    ↓
Durable event/queue
    ↓
Reward worker
    ↓
Blockchain
```

Expect them to ask about idempotency keys, durable queues, retries, DLQs, and reconciliation.

**Answer**

Use durable asynchronous processing:

```text
Eligibility established
       │
       ▼
DB transaction
  reward = PENDING
       │
       ▼
Durable queue
       │
       ▼
Reward worker
       │
       ├── blockchain available? no
       │       ↓
       │    retry/backoff
       │
       └── yes
              ↓
          submit reward
              ↓
          record tx hash
              ↓
          CONFIRMED
```

You generally deliver **effectively-once**, not magical global exactly-once semantics.

Important components:

```text
idempotency key
persistent operation row
queue
exponential backoff
DLQ
reconciler
transaction/hash tracking
```

If the blockchain submission response times out:

> “I don't immediately submit another reward. I reconcile whether the first operation succeeded.”

---

### 3. Gala NestJS/AWS/GCP/MongoDB at 10,000+ concurrency

> **Résumé bullet:** 3. “Architected Node.js/NestJS services on AWS/GCP with MongoDB, scaling media, collectibles, user-state, and blockchain workflows to 10,000+ concurrent users.”

This is one of the bullets I would expect them to attack hardest.

#### Q1. “What changed between before and after scaling?”

**Interviewer:** “What specifically changed between the architecture before scaling and the architecture that handled 10,000+ concurrent users? Draw both.”

**Answer**

Your resume supports the 10,000+ concurrent claim, but not every intermediate architecture detail. _Oscar Gonzalez - Lead Engineer …_

Use an evidence-driven answer:

```text
BEFORE

Users
 ↓
few application instances
 ↓
backend
 ↓
DB / external dependencies


AFTER

Users
 ↓
CDN / edge
 ↓
Load Balancer
 ↓
Stateless NestJS instances
 ↓
┌──────────┬─────────────┐
▼          ▼             ▼
Cache    MongoDB       Async workers
          │
          ▼
     replicas/shards [VERIFY]
```

Talk through the actual changes you remember, not generic ones.

The lead-level answer should cover:

- horizontal stateless scaling;
- DB query/index optimization;
- connection pooling;
- caching if actually used;
- moving expensive work off synchronous request paths;
- CDN for media/static content;
- rate limiting;
- load testing;
- autoscaling;
- observability.

---

#### Q2. “What was the bottleneck at 350, 1k, 5k, 10k?”

**Interviewer:** “What was the bottleneck at 350, 1,000, 5,000, and 10,000 concurrent users? Was it Node CPU, database connections, Mongo queries, external APIs, memory, network, or something else?”

**Answer**

Do not invent exact progression.

Instead say:

> “I wouldn't claim that every concurrency level corresponded to a unique bottleneck unless I had measurements. We diagnosed bottlenecks through load testing and production telemetry rather than guessing.”

Then explain the methodology:

```text
Increase load
   ↓
measure:
CPU
memory
event-loop lag
DB latency
connection usage
p95/p99
external API latency
5xx
   ↓
identify first saturation point
   ↓
fix
   ↓
repeat
```

Possible examples:

- CPU saturated → horizontal scale;
- Mongo query latency → index/query change;
- connection pool saturated → pool sizing;
- external API bottleneck → caching/queue/circuit breaker;
- serialization/memory → optimize payloads.

---

#### Q3. “How were NestJS services deployed? Stateless?”

**Interviewer:** “How were the NestJS services deployed? Were they stateless? How did you horizontally scale them, and how did the load balancer determine which instance received a request?”

**Answer**

If this matches your deployment:

> “The goal for the request-serving NestJS layer was statelessness: authenticated identity and durable domain state lived outside the process, so instances could be added or removed behind the load balancer.”

```text
Load Balancer
      │
 ┌────┼─────┐
 ▼    ▼     ▼
API1 API2  API3
 │    │     │
 └────┼─────┘
      ▼
shared durable state
```

State that should **not** live only in instance memory:

```text
user session
order state
ownership state
job status
```

Ephemeral local state is fine for:

```text
in-process caches
request scope
connection pools
```

provided loss is harmless.

**[VERIFY]** your actual AWS runtime—ECS, Kubernetes, EC2, Lambda, etc.—before naming it.

---

#### Q4. “How was MongoDB modeled and indexed?”

**Interviewer:** “How was MongoDB modeled and indexed? Give me an actual high-volume query and tell me what index supported it. How would you detect an inefficient collection scan?”

**Answer**

Give one real query if you remember one.

The general answer pattern:

> “I started from the read/write access pattern, not from document aesthetics.”

Example:

```js
db.collectibles
  .find({
    userId: '...',
    status: 'OWNED',
  })
  .sort({
    createdAt: -1,
  });
```

Possible index:

```text
{ userId: 1, status: 1, createdAt: -1 }
```

Then explain:

> “The leftmost fields support equality predicates and the trailing field supports the requested sort.”

You identify bad queries through:

```text
explain()
docs examined
keys examined
execution time
slow query logs
APM
```

Do not claim that particular index existed unless true.

---

#### Q5. “How did you verify 10,000 concurrent?”

**Interviewer:** “How did you verify the claim of 10,000 concurrent users? Was this production traffic or load testing? What were p50/p95/p99 latency, throughput, CPU, error rate, and DB saturation?”

**Answer**

This is critical.

A strong answer:

> “Concurrency is not the same thing as requests per second. I would explain exactly what the 10,000 figure represented—simultaneously connected or active users—and distinguish that from throughput.”

Load-test model:

```text
Ramp:
500
1k
2.5k
5k
10k

Hold period

Measure:
p50
p95
p99
error %
CPU/memory
DB latency
DB connections
dependency latency
```

Also test:

```text
steady load
burst
spike at launch
soak/endurance
```

If 10,000 came from actual production traffic rather than load testing, say that accurately.

---

**Then expect:**

#### Follow-up: “Why MongoDB instead of PostgreSQL?”

**Interviewer:** “Why MongoDB rather than PostgreSQL?”

**Answer**

Use workload characteristics.

Mongo strengths:

```text
document-oriented data
flexible nested schemas
rapidly evolving metadata
horizontal scale patterns
```

Postgres strengths:

```text
transactions
joins
relational integrity
SQL analytics
complex constraints
```

Answer:

> “I don't think of Mongo versus Postgres as a religion. I choose based on access patterns and consistency requirements. For highly relational financial/order state I generally prefer relational storage; for application-oriented document state with flexible nested structures, Mongo can be a better fit.”

---

#### “Why AWS and GCP?”

**Interviewer:** “Why AWS and GCP?”

**Answer**

Your resume explicitly says AWS/GCP and GCP Vision. _Oscar Gonzalez - Lead Engineer …_

A defensible explanation is:

> “The architecture was multi-cloud because different product capabilities existed in different providers—not because multi-cloud itself was a goal. For example, application infrastructure could run in AWS while GCP was used for services such as Vision. I would avoid duplicating equivalent core infrastructure across providers unless there were a concrete reliability or business reason.”

Cross-cloud concerns:

```text
IAM
network egress
latency
secret management
monitoring
failure boundaries
cost
```

---

#### “What state prevented NestJS from being completely stateless?”

**Interviewer:** “What state prevented your NestJS service from being completely stateless?”

**Answer**

Answer:

> “A NestJS process can be stateless at the service-instance level even though the overall system is stateful. Durable state lives in MongoDB, blockchain state, caches or other stores. The instance still has ephemeral process state such as connection pools and in-flight requests, but no business-critical state should disappear if the instance is terminated.”

---

#### “How did you handle DB connection pooling?”

**Interviewer:** “How did you handle database connection pooling?”

**Answer**

General architecture:

```text
10 API instances
   │
each pool max = N
   │
   ▼
MongoDB cluster
```

The risk:

```text
autoscale to 100 instances
× pool 100
= 10,000 DB connections
```

So pool size must be designed together with autoscaling limits.

Monitor:

```text
active connections
connection wait time
query latency
CPU
replication lag
```

---

### 4. Vision API + vector search + Sanity

> **Résumé bullet:** 4. “Integrated GCP Vision API, vector search, and Sanity CMS to automate film content ops, static inputs, thumbnail prep, image selection, and release metadata.”

**Be ready to draw:**

```text
Sanity CMS
    ↓ webhook
Processing worker
    ↓
GCP Vision
    ↓
metadata/features
    ↓
Embedding
    ↓
Vector store
    ↓
Similarity/ranking
    ↓
candidate image
    ↓
Sanity writeback/review
```

They may specifically challenge whether Vision and embedding search had separate purposes.

#### Q1. “Walk me through the pipeline.”

**Interviewer:** “Walk me through this pipeline from a Sanity content change to the final automated image selection. What triggered what?”

**Answer**

Based on your resume and prior description:

```text
Sanity content/media
       │
       ▼
Processing trigger
       │
       ▼
Worker
       │
       ├── retrieve candidate images
       │
       ▼
GCP Vision
       │
       ├── labels / visual metadata
       │
       ▼
Normalized metadata
       │
       ▼
Embedding / vectorization
       │
       ▼
Vector search
       │
       ▼
Rank candidate thumbnails
       │
       ▼
Sanity writeback / human review
```

Explain:

> “Vision and vector retrieval solved different parts of the problem. Vision extracted semantic information from visual assets. Vector search let us compare candidate assets against content context semantically rather than relying on exact filenames or tags.”

---

#### Q2. “What exactly did you send to Vision?”

**Interviewer:** “What exactly did you send to GCP Vision? What labels or signals came back, and how were those results persisted?”

**Answer**

Your resume only establishes GCP Vision integration, not the exact endpoint or feature set. So answer only what you actually remember.

If you used:

- label detection;
- object detection;
- OCR;
- safe-search analysis;

name the actual ones.

A safe answer:

> “We passed the media assets or their accessible representation to Vision and normalized the returned visual metadata into our processing pipeline. I don't want to invent the exact Vision feature if I don't remember it; the architectural role was automated enrichment of image metadata before ranking/selecting candidates.”

That is better than bluffing.

---

#### Q3. “Where did vector search enter?”

**Interviewer:** “Where did vector search enter the design? What exactly was embedded—the image, Vision labels, film metadata, text descriptions, or some combination?”

**Answer**

Answer:

> “Vector search was for semantic retrieval/ranking. The system converted the relevant textual/visual context into an embedding representation and searched an indexed corpus of candidate assets. Rather than ‘does this image have an exact tag?’ the question became ‘which assets are semantically closest to the content context?’”

```text
Film context
   ↓
embedding
   ↓
vector query
   ↓
candidate image embeddings
   ↓
top-K
   ↓
reranking/business rules
```

---

#### Q4. “Which model and vector DB?”

**Interviewer:** “What embedding model and vector store did you use? If you don't remember the exact provider, explain the retrieval architecture and what similarity metric you needed.”

**Answer**

**[VERIFY]**.

Do not fabricate.

Say:

> “I remember the architecture and my responsibilities clearly, but I want to distinguish that from vendor-specific details I don't remember. The implementation used [actual provider/store]. Architecturally, we required an embedding model, persisted vectors with asset IDs/metadata, approximate nearest-neighbor retrieval, and a top-K ranking stage.”

If you remember exact vendor later, replace it.

---

#### Q5. “How did you prevent a wrong thumbnail from automatically publishing?”

**Interviewer:** “How did you prevent an automated system from selecting a visually similar but semantically wrong thumbnail and publishing it directly to production?”

**Answer**

Use guardrails:

```text
retrieval
  ↓
score threshold
  ↓
business rules
  ↓
candidate set
  ↓
human review OR safe auto-publish class
```

Strong answer:

> “I would not make semantic similarity equivalent to correctness. The vector score is a candidate-generation signal. I would layer deterministic rules, confidence thresholds, asset eligibility, content status and—where the impact warranted it—human review before publication.”

Also maintain auditability:

```text
selected asset
model/version
score
source context
timestamp
override/user
```

---

### 5. Token / ICO launch flows

> **Résumé bullet:** 5. “Owned production-critical token/ICO launch flows across user experience, backend services, release operations, and blockchain-integrated application paths.”

**High-value concepts:**

- idempotency
- transaction state machines
- rate limiting
- queues
- reconciliation
- block confirmations
- circuit breakers
- feature flags
- observability

#### Q1. “Design an ICO/token launch for a traffic spike.”

**Interviewer:** “Design an ICO/token launch capable of handling a massive traffic spike at the exact launch time. How would you protect the backend?”

**Answer**

```text
Users
  │
  ▼
CDN / WAF
  │
  ▼
Rate limiter / waiting room
  │
  ▼
API Gateway
  │
  ▼
Stateless purchase APIs
  │
  ├── eligibility
  ├── limits
  ├── idempotency
  │
  ▼
Transactional operation store
  │
  ▼
Queue / worker
  │
  ▼
Blockchain
```

Critical principles:

- protect the write path;
- make purchase intent idempotent;
- persist state before asynchronous work;
- separate browsing from purchase;
- use atomic allocation for finite token inventory;
- reconcile blockchain outcomes.

---

#### Q2. “How do you prevent over-purchasing or duplicates?”

**Interviewer:** “How did you prevent users from purchasing more tokens than allowed or submitting the same purchase twice?”

**Answer**

Use:

```text
per-user limits
atomic DB condition
unique idempotency key
```

For example:

```sql
UPDATE allocation
SET purchased = purchased + :amount
WHERE user_id = :user
  AND purchased + :amount <= max_allowed;
```

or transactionally lock the relevant allocation.

Then:

```text
Idempotency-Key: launch123:user456:request789
```

Retry returns same result instead of another purchase.

---

#### Q3. “DB or blockchain as source of truth?”

**Interviewer:** “Where was the source of truth for the token purchase—your database or blockchain—and how did you reconcile disagreements?”

**Answer**

Answer:

> “For actual on-chain ownership, blockchain is authoritative. But application state still needs to track the lifecycle of the user's operation. I would separate ‘canonical chain ownership’ from ‘application workflow state.’”

```text
Application:
PENDING / SUBMITTED / CONFIRMED / FAILED

Blockchain:
canonical finalized ownership/transaction
```

Reconciliation bridges them.

---

#### Q4. “Blockchain succeeded but backend timed out.”

**Interviewer:** “Suppose the blockchain transaction succeeds but your backend times out before recording success. What happens next?”

**Answer**

Never immediately reissue.

```text
operation_id
transaction hash if available
request fingerprint
```

Reconciler:

```text
unknown outcome
    ↓
query chain
    │
    ├── found → CONFIRMED
    └── absent after safe criteria → retry/fail
```

This is the classic **ambiguous timeout problem**.

---

#### Q5. “How did you deploy something this high risk?”

**Interviewer:** “What was your deployment/release strategy for something this high risk? Did you use feature flags, staged rollout, pre-warming, rollback procedures, dashboards, or runbooks?”

**Answer**

A Lead answer should include:

```text
pre-production load test
feature flags
staging rehearsal
deployment freeze window
canary / progressive rollout where applicable
rollback
dashboards
alerting
runbook
on-call ownership
post-launch reconciliation
```

For blockchain contract behavior, rollback may be fundamentally different because on-chain effects may be irreversible.

That should be acknowledged.

---

## Frequence + Madhive — Lead Senior SE

_Security flows for this company: Part III › 9. Security by company › Frequence/Madhive — multi-tenant SaaS security; definitions in Part III › 7. Security catalog._

Your resume contains five bullets here: platform/acquisition maturity, technical direction across 30+ engineers/QAs, Angular framework/widgets, AI-assisted regression testing with measured outcomes, and configurable workflow validation.

Your resume has five separate Frequence/Madhive claims covering acquisition-oriented engineering maturity, leadership across 30+ engineers/QAs, Angular framework architecture, AI-assisted testing with quantified results, and high-variation workflow automation. _Oscar Gonzalez - Lead Engineer …_

### 6. Platform execution / engineering maturity

> **Résumé bullet:** 6. “Contributed to platform execution and engineering maturity that supported Frequence’s acquisition by Madhive across omnichannel workflow and local CTV infrastructure.”

The interviewer is probing whether “supported acquisition” is substantive or decorative language.

#### Q1. “What did engineering maturity concretely mean?”

**Interviewer:** “What did ‘platform execution and engineering maturity’ concretely mean? What architectural problems existed when you joined, and what did you change?”

**Answer**

Answer in concrete categories:

```text
Before                       Improved
------                       --------
inconsistent UI         →    shared design system
manual regression       →    automated E2E
weak PR conventions     →    standardized reviews
coupled widgets         →    configurable framework
ad hoc quality          →    CI gates / observability
```

Interview answer:

> “I would define maturity by measurable engineering properties: predictable releases, reusable architecture, automated regression coverage, consistent review standards, observability and a framework that multiple teams could extend without repeatedly rebuilding the same patterns.”

---

#### Q2. “Draw omnichannel architecture.”

**Interviewer:** “Draw the core omnichannel architecture. How would CTV, radio, display, and other products share workflow infrastructure without becoming one giant conditional codebase?”

**Answer**

Your known widget examples are valuable:

```text
                         Strategy / Campaign
                                │
                                ▼
                         Workflow Engine
                                │
             ┌──────────────────┼──────────────────┐
             ▼                  ▼                  ▼
         Planning           Activation         Reporting
             │
      Config-driven UI
             │
    ┌────────┼────────────┐
    ▼        ▼            ▼
Geography Audience   Product Selection
widget    widget         widget
                      │
               CTV / Radio / etc.
```

A backend could expose normalized strategy configuration:

```text
Product configuration
       ↓
workflow definition
       ↓
widget configuration
       ↓
frontend renders
```

The central architectural idea:

> “Product variation belonged in configuration and extension points rather than hundreds of hard-coded `if product === ...` branches.”

---

#### Q3. “What makes AdTech workflow systems difficult to scale?”

**Interviewer:** “What technical characteristics make an AdTech workflow system difficult to scale—data volume, configuration variation, integrations, latency, reporting, or something else?”

**Answer**

Several dimensions:

**Configuration scale**

```text
customer × product × workflow-state × feature flags
```

**Data scale**

- campaigns;
- targeting;
- impressions;
- reporting.

**Integration scale**

- publishers;
- CTV providers;
- radio;
- third parties.

**Organizational scale**

- many engineers altering shared workflow infrastructure.

Lead answer:

> “At Frequence, ‘scale’ was not only requests per second. Configuration complexity and safe extensibility were major scaling problems.”

---

#### Q4. “What did you personally contribute?”

**Interviewer:** “What technical work did you personally do that made the platform more reliable or maintainable enough to support enterprise growth?”

**Answer**

Use concrete examples you can defend:

> “My strongest personal contributions were around the shared frontend framework, widget architecture, test automation, design-system/PR standards and engineering direction. For example, I worked with configurable geography, audience and product-selection workflows and helped create automation around product-specific workflow paths.”

Then specify actual code/module names if remembered.

---

#### Q5. “What would an acquisition technical diligence team examine?”

**Interviewer:** “If Madhive engineers performed technical diligence on the platform, which architectural areas would have concerned them most, and what evidence could you give them that those risks were controlled?”

**Answer**

Likely:

```text
architecture maintainability
security
test coverage
deployment process
observability
technical debt
single points of failure
scaling characteristics
data ownership
dependency/licensing risk
bus factor
documentation
```

Answer:

> “I wouldn't claim my work caused the acquisition, but the areas I contributed to—repeatable testing, shared framework architecture, documented engineering standards and product infrastructure—are exactly the kinds of technical-risk areas that matter during scaling and diligence.”

That framing is accurate and defensible.

---

### 7. Technical direction across 30+ engineers/QAs

> **Résumé bullet:** 7. “Provided technical direction for 30+ engineers/QAs across frontend architecture, testing strategy, design systems, PR standards, offshore coordination, and product breakdown.”

This is a Lead-role credibility bullet.

#### Q1. “How can you influence 30+ engineers?”

**Interviewer:** “Thirty-plus engineers is too many to directly manage technically. What operating model did you use to influence that many people?”

**Answer**

Not through reviewing every line.

```text
Lead
 │
 ├── architecture patterns
 ├── RFCs/standards
 ├── team leads
 ├── shared libraries
 ├── CI enforcement
 └── recurring technical forums
```

Say:

> “The goal was to make the right architecture the easiest architecture to follow. I used shared patterns, examples, code review standards and delegated ownership rather than requiring every implementation decision to come through me.”

---

#### Q2. “How were architecture decisions proposed and enforced?”

**Interviewer:** “How did architecture decisions get proposed, reviewed, documented, and enforced? Did you use RFCs, ADRs, architecture reviews, linters, shared libraries, or CI gates?”

**Answer**

A mature flow:

```text
Problem
 ↓
RFC / design proposal
 ↓
alternatives + tradeoffs
 ↓
review
 ↓
decision / ADR
 ↓
implementation
 ↓
automated enforcement where possible
```

Examples:

- ESLint;
- TypeScript compiler;
- shared APIs;
- CI tests;
- package boundaries;
- Storybook;
- PR templates.

Lead principle:

> “Policy enforced only through human memory does not scale.”

---

#### Q3. “What PR standard changed quality?”

**Interviewer:** “Tell me about a PR standard you introduced that materially changed engineering quality. How did you keep it from becoming process bureaucracy?”

**Answer**

Use a real standard.

Possible structure:

> “A PR needed to explain the user/system behavior being changed, testing evidence, risk area and any architectural implications—not just contain code. For critical changes, we required regression coverage.”

If you had specific PR templates/checklists, use them.

Avoid claiming specific gates you didn't use.

---

#### Q4. “What belongs in a shared design system?”

**Interviewer:** “How did you decide what belonged in the shared design system versus the individual product/application?”

**Answer**

Shared when:

```text
reused across products
stable semantics
brand/UX consistency important
```

Examples:

```text
Button
Modal
Form controls
Typography
Tables
Layout primitives
```

Product-specific:

```text
campaign planner
targeting workflow
complex domain widget
```

unless those domain widgets themselves become platform abstractions.

A strong phrase:

> “Reuse should occur at the correct abstraction level; premature generalization is just another form of coupling.”

---

#### Q5. “Break down a large product request.”

**Interviewer:** “Take a large product request and show me how you would break it into frontend, backend, QA, infrastructure, and rollout work that could be distributed across multiple teams.”

**Answer**

Example:

```text
Feature:
Add a new targeting capability
```

Breakdown:

```text
Domain/API contract
   │
   ├── backend data model
   ├── validation
   ├── API
   │
   ├── frontend widget
   ├── workflow configuration
   │
   ├── unit/integration tests
   ├── E2E workflow
   │
   ├── telemetry
   └── rollout / feature flag
```

Then establish dependencies and parallelizable tracks.

---

**Likely follow-ups:**

#### Follow-up: “How did you handle disagreement?”

**Interviewer:** “How did you handle disagreement between teams?”

**Answer**

> “I tried to convert disagreement into explicit competing constraints. If two engineers disagree, I ask what each design optimizes for—latency, extensibility, delivery time, isolation, operational cost—and then use evidence or a small prototype where necessary.”

---

#### “How did you prevent yourself becoming the bottleneck?”

**Interviewer:** “How did you prevent yourself from becoming the architecture bottleneck?”

**Answer**

> “I standardized repeatable decisions and reserved direct involvement for high-blast-radius architectural decisions.”

```text
Repeatable decision
→ documented pattern

High-risk new decision
→ architecture review
```

---

#### “How did offshore teams get sufficient context?”

**Interviewer:** “How did offshore teams receive sufficient context to make independent decisions?”

**Answer**

Strong practices:

- written acceptance criteria;
- architectural diagrams;
- API contracts;
- Storybook;
- async technical docs;
- clear ownership;
- recorded demos;
- overlap windows for ambiguity;
- avoid ticket-only communication.

---

### 8. Angular widget framework

> **Résumé bullet:** 8. “Helped lead Frequence’s core Angular framework, building extensible widgets and configurable UI systems for AdTech planning, activation, and reporting workflows.”

This is another bullet they can drill into for a long time.

For your examples, be prepared to talk specifically about:

```text
Geography widget
→ geofence / locations

Audience widget
→ demographic / segment

Product-selection widget
→ CTV / Radio / etc.
```

The interviewer may ask for:

```text
configuration → widget registry → state model → validation → API payload
```

#### Q1. “What was a widget?”

**Interviewer:** “What was a ‘widget’ in this system? Take one real widget—geography, audience, or product selection—and show me its interface and lifecycle.”

**Answer**

Use your real examples.

> “A widget was an extensible domain UI unit used inside configurable workflow states. Geography might represent geofence/location configuration, Audience represented demographic/segment selection, and Product Selection controlled products such as CTV or Radio.”

Conceptually:

```ts
interface WorkflowWidget {
  id: string;
  initialize(config): void;
  validate(): ValidationResult;
  serialize(): Payload;
}
```

Exact interface **[VERIFY]**; use it conceptually unless you remember actual code.

---

#### Q2. “How did the system decide which widgets appeared?”

**Interviewer:** “How did the framework decide which widgets appeared for a particular product or workflow state? Was that configuration-driven or hard-coded?”

**Answer**

Best architecture:

```text
Strategy type
     │
     ▼
Workflow configuration
     │
     ▼
Current workflow status
     │
     ▼
Widget registry
     │
     ▼
Geography + Audience + Product...
```

This avoids:

```ts
if (client === A && product === CTV && status === X) ...
```

everywhere.

If your production architecture was configuration-driven, emphasize this strongly.

---

#### Q3. “How did widgets communicate?”

**Interviewer:** “How did widgets communicate without becoming tightly coupled? Shared state? RxJS? Service layer? Event bus? Inputs/outputs?”

**Answer**

Prefer controlled contracts:

```text
Widget
   ↓
shared workflow state/service
   ↓
observable state
   ↓
other widgets
```

In Angular/RxJS this may involve:

- services;
- observables;
- state containers;
- typed events;
- inputs/outputs.

Avoid hidden direct component coupling.

---

#### Q4. “How did you version framework changes?”

**Interviewer:** “How did you version the framework so dozens of workflows could evolve without breaking existing campaigns?”

**Answer**

Strategies:

```text
backward-compatible API contracts
feature flags
configuration versions
schema migrations
deprecation windows
shared component semantic versioning
```

For saved workflow data:

```text
schema_version: 3
```

Deserializer can migrate older payloads.

---

#### Q5. “How would you migrate it to React?”

**Interviewer:** “If you needed to migrate this architecture from Angular to React today, which parts of the architecture would survive unchanged and which would need to be rewritten?”

**Answer**

Preserve domain architecture:

```text
configuration schema
workflow state model
API contracts
validation logic
domain types
```

Rewrite:

```text
Angular components
Angular DI
RxJS-specific UI plumbing
Angular directives
```

React might use:

```text
component registry
hooks
context/store
schema-driven rendering
```

The key insight:

> “A good domain architecture should outlive the frontend framework.”

---

### 9. Playwright/Jest/Claude/Datadog testing

> **Résumé bullet:** 9. “Built AI-assisted regression/E2E automation with Playwright, Jest, Claude multimodal testing, and Datadog, reducing production bugs by 50% and manual QA by 60%.”

This is probably one of your most attackable quantified bullets.

#### Q1. “Walk me through an actual test.”

**Interviewer:** “Take one actual Playwright test. What was the business workflow, fixture/setup, actions, assertions, and cleanup?”

**Answer**

Use your strategy-bundle example.

```text
Fixture:
create strategy bundle = CTV

Expected workflow:
Status A → widgets X/Y
Status B → widgets X/Z
Status C → widgets...
```

Then:

```text
Arrange
→ create/configure strategy

Act
→ navigate workflow
→ change status / inputs

Assert
→ expected widgets
→ API payload
→ persisted state
→ final status
```

A strong interview response includes **one bug actually caught**, if you remember one.

---

#### Q2. “Where was Claude multimodal used?”

**Interviewer:** “Where exactly was Claude multimodal involved? Was the model determining correctness, comparing screenshots, generating tests, triaging failures, or something else?”

**Answer**

Be exact. If it evaluated screenshots/visual output, say so. If not, don't imply it.

General distinction:

```text
Playwright
= deterministic browser automation

Jest
= deterministic assertions/unit logic

Claude multimodal
= semantic/visual reasoning where deterministic selectors are insufficient
```

Potential multimodal role:

```text
screenshot
   ↓
multimodal evaluator
   ↓
semantic visual assessment
```

**[VERIFY exact usage].**

---

#### Q3. “Why AI instead of normal assertions?”

**Interviewer:** “Why use Claude for something deterministic test assertions could handle? What did AI contribute that normal Playwright could not?”

**Answer**

Correct answer:

> “I would never replace a deterministic assertion with an LLM when a deterministic check is reliable. AI was useful only where correctness was semantic or visual and difficult to encode as a stable selector/value assertion.”

For example:

```text
"button exists"
→ Playwright

"page layout visually reflects intended configuration"
→ potentially multimodal
```

---

#### Q4. “How did tests run in CI?”

**Interviewer:** “How did the tests run in CI? What blocked deployment versus generated a non-blocking warning?”

**Answer**

**[VERIFY CI provider].**

Lead-level pipeline:

```text
PR
 ↓
install/build
 ↓
unit tests
 ↓
integration tests
 ↓
deploy ephemeral/test environment
 ↓
Playwright suites
 ↓
artifacts:
 screenshots
 videos
 traces
 logs
 ↓
block merge/release for critical failures
```

Datadog can correlate application telemetry with failing workflows.

---

#### Q5. “Explain 50% bug reduction and 60% manual QA reduction.”

**Interviewer:** “Explain the 50% production-bug reduction and 60% manual-QA reduction. What baseline and time window did you use, and how do you know the automation caused it?”

**Answer**

This one must be factual.

Prepare:

```text
baseline period
after period
bug classification
manual QA hours/cycles
same denominator
```

Good answer:

> “I would define the metrics before presenting them. Production bug reduction was based on [VERIFY exact tracking source/time period]. Manual QA reduction was based on [VERIFY QA execution time / number of manually executed scenarios]. The important point is that I don't claim those percentages from intuition; they came from comparing the prior process to the automated process.”

If you can't substantiate the exact measurement, consider softening the resume later.

---

**Also expect:**

#### “How did you handle flaky tests?”

**Interviewer:** “How did you deal with flaky tests?”

**Answer**

Four buckets:

```text
test bug
application race
environment instability
actual product defect
```

Use:

- deterministic fixture setup;
- API-driven setup instead of UI setup;
- no arbitrary sleeps;
- wait on explicit conditions;
- isolate data;
- capture traces/screenshots;
- quarantine only temporarily;
- track flake rate.

Never normalize:

```text
retry 5 times until green
```

as a permanent solution.

---

#### “How did you stop LLM nondeterminism from creating false failures?”

**Interviewer:** “How did you prevent LLM nondeterminism from creating false failures?”

**Answer**

Use LLM result as:

```text
signal
not authority
```

unless confidence/repeatability is sufficient.

Possible design:

```text
deterministic assertions
      +
LLM visual evaluation
      ↓
structured result schema
      ↓
confidence
      ↓
human review or retry
```

Pin model/version where possible and store evaluation artifacts.

---

#### “What did Datadog contribute?”

**Interviewer:** “What did Datadog contribute?”

**Answer**

Datadog provides **runtime evidence** beyond the test result:

```text
failed browser step
       ↓
trace ID
       ↓
API trace
       ↓
DB query
       ↓
error/log
```

Useful signals:

- p95/p99;
- error rate;
- API traces;
- logs;
- frontend telemetry;
- release correlation.

---

### 10. High-variation workflow validation

> **Résumé bullet:** 10. “Automated browser validation across high-variation customer workflows, improving release confidence for configurable, production-critical business paths.”

A strong diagram to be ready for:

```text
Strategy configuration
       ↓
workflow state
       ↓
expected widgets/actions
       ↓
Playwright scenario
       ↓
API + UI assertions
```

#### Q1. “What made workflows high variation?”

**Interviewer:** “What made these workflows ‘high variation’? Give me a concrete example of two configurations that resulted in substantially different UI behavior.”

**Answer**

Use your actual product examples:

```text
CTV strategy
Spectrum TV strategy
Radio strategy
```

Each could have different:

```text
statuses
widgets
required inputs
validation
transitions
```

So one application might represent many mini-UX workflows.

---

#### Q2. “How do you avoid combinatorial explosion?”

**Interviewer:** “If you had hundreds of combinations of statuses, products, widgets, and customer configurations, how did you avoid a combinatorial explosion in E2E tests?”

**Answer**

Do not test every Cartesian product.

Use:

```text
equivalence classes
risk-based testing
pairwise combinations
critical-path coverage
boundary cases
```

For example:

```text
products × status × audience × geography × permissions
```

could explode into millions.

Instead model **meaningful behavioral partitions**.

---

#### Q3. “How select representative configurations?”

**Interviewer:** “How did you generate or select representative test configurations?”

**Answer**

Criteria:

```text
highest traffic
highest revenue/risk
historically buggy
unique code paths
boundary conditions
representative configuration families
```

You can maintain a test matrix.

---

#### Q4. “How structure fixtures?”

**Interviewer:** “How did you structure Playwright fixtures so the tests weren't hard-coded to one customer's environment?”

**Answer**

Avoid:

```text
hard-coded customer 123
hard-coded IDs
```

Use fixture factories:

```ts
createStrategy({
  product: 'CTV',
  customerConfig: ...,
  workflowStatus: ...
})
```

Then tests reason from declared configuration.

---

#### Q5. “CTV vs Spectrum TV vs Radio?”

**Interviewer:** “Suppose the same workflow behaves differently for CTV, Spectrum TV, and Radio. How would you model that test suite?”

**Answer**

Use a common test harness with product-specific expectations:

```text
StrategyDefinition
   │
   ├── product
   ├── statuses
   ├── widgetsByStatus
   └── validations
          │
          ▼
Generic workflow runner
```

This avoids maintaining three completely independent test architectures.

---

## TicketSocket & IceCreamSocial — Lead Full Stack SE

_Security flows for this company: Part III › 9. Security by company › TicketSocket — white-label SSO, tenant identity and merchant payment processing; definitions in Part III › 7. Security catalog._

Your resume has five bullets here: AngularJS migration, configurable dashboards, PostgreSQL optimization/event processing, 350→10,000+ concurrency with JWT-based service allocation, and testing/API-documentation improvements.

Your resume contains five distinct claims: AngularJS→React/TypeScript, configurable dashboards/white-label workflows, PostgreSQL/event-processing optimization, AWS scaling from 350 to 10,000+, and large-codebase testing/API documentation. Oscar Gonzalez - Lead Engineer …

### 11. AngularJS → React + TypeScript

> **Résumé bullet:** 11. “Migrated AngularJS to React + TypeScript, improving architecture, testability, design-system reuse, and product/design collaboration via Storybook.”

#### Q1. “How do you migrate without freezing development?”

**Interviewer:** “You cannot freeze a production ticketing platform while rewriting it. How did you migrate AngularJS to React incrementally?”

**Answer**

Use **strangler migration**.

```text
Existing AngularJS App
       │
       ├── legacy route A
       ├── legacy route B
       │
       ├── NEW React route C
       └── NEW React route D
```

Migrate incrementally:

```text
shared shell
 ↓
route/component boundary
 ↓
new development in React
 ↓
replace legacy surfaces gradually
```

Do not big-bang rewrite unless compelling reason.

---

#### Q2. “How did AngularJS and React coexist?”

**Interviewer:** “How did AngularJS and React coexist during migration? Did you use route-level migration, component wrappers, microfrontends, or another strangler pattern?”

**Answer**

Potential approaches:

```text
route-level isolation
React mounted inside AngularJS shell
AngularJS embedded around React
shared API layer
```

Use your actual implementation **[VERIFY]**.

Strong answer:

> “The important architectural decision was to choose clear migration boundaries so the two frameworks didn't continuously reach into each other's component internals.”

---

#### Q3. “How did you handle shared state?”

**Interviewer:** “How did you handle shared state while old and new frameworks coexisted?”

**Answer**

Ideal transitional design:

```text
AngularJS ──┐
            ▼
       framework-neutral state/API
            ▲
React ──────┘
```

Avoid state being owned by one framework if the other needs it.

Options:

- URL;
- backend;
- shared JS module;
- event interface;
- temporary state adapter.

---

#### Q4. “What did TypeScript materially improve?”

**Interviewer:** “What did TypeScript catch or make possible that materially improved the architecture?”

**Answer**

Examples:

```text
API payload contracts
shared domain models
component props
nullable-state handling
refactoring safety
IDE navigation
```

Strong answer:

> “TypeScript's biggest value in a migration wasn't catching syntax errors; it was making cross-module contracts explicit so we could refactor legacy assumptions safely.”

---

#### Q5. “How did Storybook help?”

**Interviewer:** “How was Storybook integrated into the workflow between engineering and design, and how did you ensure Storybook components stayed equivalent to production components?”

**Answer**

```text
Design ↔ Storybook ↔ Engineering
```

Benefits:

- isolated states;
- shared component vocabulary;
- visual review;
- edge cases;
- documentation;
- reusable design-system components.

Could integrate screenshot/visual regression if actually done.

---

**Expect:**

#### Follow-up: “Why React?”

**Interviewer:** “Why React?”

**Answer**

Frame around project context, not fashion:

- ecosystem;
- team familiarity;
- reusable component model;
- TypeScript;
- incremental migration feasibility.

---

#### Follow-up: “Why not modern Angular?”

**Interviewer:** “Why not simply upgrade AngularJS to modern Angular?”

**Answer**

Answer:

> “That was a valid alternative. The decision should consider migration path, team skills, desired component ecosystem and product direction. Modern Angular is not inherently incapable. The key was selecting an architecture that reduced legacy coupling and allowed incremental delivery.”

---

#### Follow-up: “How did you measure improvement?”

**Interviewer:** “How did you measure that architecture/testability actually improved?”

**Answer**

Potential evidence:

```text
test coverage
defect rate
component reuse
lead time
PR size
time to deliver screens
Storybook adoption
```

Only claim measured values you can substantiate.

---

### 12. Configurable dashboards and white-label workflows

> **Résumé bullet:** 12. “Built configurable dashboards for events, inventory, influencer campaigns, ticketing operations, and white-label partner workflows.”

This naturally opens discussion of:

- multi-tenancy
- RBAC
- tenant_id
- configuration metadata
- cached read models
- real-time vs analytical workloads

#### Q1. “Design the configuration system.”

**Interviewer:** “Design the configuration system behind those dashboards. What was hard-coded and what was metadata-driven?”

**Answer**

```text
Tenant / Merchant
      │
      ▼
Tenant Configuration
      │
      ├── brand
      ├── enabled modules
      ├── permissions
      ├── payment provider
      └── feature flags
             │
             ▼
       Dashboard Composer
             │
      ┌──────┼─────────┐
      ▼      ▼         ▼
   Events Inventory Influencers
```

Avoid cloning code per client.

---

#### Q2. “How determine branding, permissions and widgets?”

**Interviewer:** “How did tenant/merchant configuration determine branding, permissions, widgets, and available business operations?”

**Answer**

Example:

```text
tenant_id
   ↓
configuration service/cache
   ↓
{
  theme,
  enabled_features,
  role_permissions,
  modules
}
```

Server must still enforce permissions; frontend configuration is not security.

---

#### Q3. “How isolate tenant data?”

**Interviewer:** “How did you isolate data for multiple white-label customers so merchant A could never access merchant B's events or sales?”

**Answer**

Every request carries authenticated tenant context:

```text
JWT
{
  sub,
  tenant_id,
  roles
}
```

Backend:

```sql
WHERE tenant_id = :authenticatedTenant
```

Never:

```text
tenant_id supplied by client
```

as the trusted authorization source.

At scale, additional isolation may include:

- tenant-aware DB indexes;
- partitioning;
- separate databases for high-compliance tenants.

---

#### Q4. “How handle roles?”

**Interviewer:** “How did you handle authorization for users with different roles—merchant admin, cashier, event manager, support, end customer?”

**Answer**

RBAC example:

```text
Customer
→ own tickets/orders

Cashier
→ box-office purchase

Event manager
→ event/inventory operations

Merchant admin
→ configuration/reporting

Platform support
→ explicitly scoped support operations
```

Domain authorization must happen backend-side.

---

#### Q5. “Real-time inventory vs historical reporting: same API?”

**Interviewer:** “If one dashboard needed inventory in real time while another needed large historical reports, would you use the same API/data path? Why or why not?”

**Answer**

Generally no.

```text
Transactional inventory path
→ strongly consistent / low latency

Historical analytics
→ read replica / warehouse / preaggregation
```

Don't let a 5-year report query compete with seat-reservation writes.

---

### 13. PostgreSQL, stored procedures, triggers, webhooks, transactions

> **Résumé bullet:** 13. “Optimized PostgreSQL data flows with indexing, stored procedures, triggers, webhooks, and transactional event processing.”

I would expect a strong backend interviewer to spend 10–15 minutes here.

Expect concepts like:

- unique constraints
- indexes
- transactions
- optimistic concurrency
- source version
- idempotency
- outbox pattern
- webhook signature verification
- DLQ/reconciliation

#### Q1. “Give me a real query/index improvement.”

**Interviewer:** “Give me a real slow PostgreSQL query you improved. What was the original query plan, what index did you introduce, and why did its column order matter?”

**Answer**

Use a real TicketSocket query if remembered.

Example structure:

```sql
SELECT ...
FROM orders
WHERE event_id = ?
  AND status = ?
ORDER BY created_at DESC
LIMIT 100;
```

Potential index:

```sql
(event_id, status, created_at DESC)
```

Explain:

> “I would confirm improvement with `EXPLAIN ANALYZE`, comparing scan type, rows examined, sort behavior and execution time before and after.”

Do not present this exact query as historical unless true.

---

#### Q2. “Why stored procedures/triggers?”

**Interviewer:** “What logic belonged in stored procedures/triggers instead of application code? Why?”

**Answer**

Good candidates:

```text
must happen atomically with DB change
data-integrity logic
legacy cross-application consistency
highly data-local operation
```

Bad candidates:

```text
complex external API orchestration
logic developers cannot discover
long-running network calls
```

---

#### Q3. “Downsides of triggers?”

**Interviewer:** “What were the downsides of using triggers? How did you make side effects discoverable and testable?”

**Answer**

- hidden side effects;
- debugging complexity;
- surprising writes;
- difficult migrations;
- harder unit testing;
- cascading behavior.

Mitigation:

```text
documented triggers
narrow responsibility
integration tests
DB migration versioning
monitoring
```

---

#### Q4. “How avoid DB update + event publication mismatch?”

**Interviewer:** “Explain your transactional event processing. How did you make sure the database update and event publication could not get out of sync?”

**Answer**

Use **transactional outbox**:

```text
BEGIN

UPDATE order

INSERT outbox_event

COMMIT
```

Then:

```text
Outbox Publisher
      ↓
Broker
```

This avoids:

```text
DB succeeds
event publish fails
```

dual-write inconsistency.

If TicketSocket used a different mechanism, answer with the actual one.

---

#### Q5. “Duplicate/out-of-order Square webhook?”

**Interviewer:**
“Square sends a duplicate or out-of-order webhook for an order that moved through in_process → completed → refund_requested → refunded. How do you ensure an older event cannot overwrite the newer state?”

**Answer**

Canonical state machine:

```text
IN_PROCESS
    ↓
COMPLETED
    ↓
REFUND_REQUESTED
    ↓
REFUNDED
```

Store:

```text
provider_event_id
provider_object_id
provider_version / occurred_at
current_state
```

Consumer logic:

```text
signature valid?
   ↓
event already processed?
 yes → no-op
 no
   ↓
is this event newer/legal?
   ↓
transactional update
```

Never let:

```text
old COMPLETED
```

overwrite:

```text
REFUNDED
```

---

### 14. AWS ticketing scaling 350 → 10,000+

> **Résumé bullet:** 14. “Re-architected AWS ticketing services, scaling from 350 to 10,000+ concurrent users with JWT-based service allocation.”

This may be the single bullet I would prepare most aggressively.

Be ready for this exact whiteboard:

```text
Users
 ↓
CDN / WAF
 ↓
Waiting room
 ↓
Rate limiter
 ↓
Load balancer/API
 ↓
Stateless ticketing services
 ↓
Reservation service
 ↓
Strongly consistent inventory
```

And then:

```text
AVAILABLE
   ↓ atomic
HELD
   ↓ payment success
SOLD
```

#### Q1. “Draw before and after.”

**Interviewer:** “Draw the architecture that supported 350 concurrent users, then draw what you changed to handle 10,000+. What exactly was the original bottleneck?”

**Answer**

Conceptual:

```text
BEFORE

Users
 ↓
App Server(s)
 ↓
PostgreSQL
```

Scaled design:

```text
                         Users
                           │
                           ▼
                     CDN / WAF
                           │
                           ▼
                  Load Balancer / Edge
                           │
                           ▼
                Stateless Application Tier
                 ┌────────┼─────────┐
                 ▼        ▼         ▼
                API1     API2      APIN
                           │
             ┌─────────────┼──────────────┐
             ▼             ▼              ▼
           Redis       PostgreSQL     Async Queue
                         │               │
                         ▼               ▼
                   replicas/etc       workers
```

And for hot seated events:

```text
Waiting room
    ↓
Admission control
    ↓
Reservation API
    ↓
atomic seat store
```

Exact AWS components **[VERIFY]**.

---

#### Q2. “What does JWT-based service allocation mean?”

**Interviewer:** “What does ‘JWT-based service allocation’ mean? Walk me through the JWT claims, who issued the token, who verified it, and how it affected routing or tenant allocation.”

**Answer**

This wording is unusual enough that you should prepare it carefully.

If what you mean is white-label/tenant/service routing, explain:

```text
Auth0 / issuer
      │
      ▼
JWT claims
{
 user,
 tenant/client,
 scopes
}
      │
      ▼
Gateway/backend
      │
      ├── authenticate
      ├── authorize tenant
      └── route/use correct service configuration
```

JWT signature:

```text
issuer private key signs
services validate with public key/JWKS
```

Security checks:

```text
signature
iss
aud
exp
scope/role
tenant association
```

Do not say JWT itself magically load-balances servers.

If “service allocation” meant something else historically, clarify it before interview.

---

#### Q3. “How prevent double-selling a seat?”

**Interviewer:** “For seated events, how did your architecture guarantee two customers couldn't purchase the same seat under extreme concurrency?”

**Answer**

This is a critical answer:

```text
AVAILABLE
    │ atomic
    ▼
HELD
    │ payment succeeds
    ▼
SOLD
```

Atomic SQL example:

```sql
UPDATE seats
SET status = 'HELD',
    hold_id = :hold,
    expires_at = :expiry
WHERE event_id = :event
  AND seat_id = :seat
  AND status = 'AVAILABLE';
```

Then:

```text
rowsAffected = 1 → winner
rowsAffected = 0 → unavailable
```

Do not use cache state alone to guarantee ownership.

---

#### Q4. “One million users arrive at once.”

**Interviewer:** “A popular event goes on sale and one million users arrive within seconds. Which layers absorb the burst before it reaches PostgreSQL?”

**Answer**

```text
1,000,000 users
      ↓
CDN/WAF/bot controls
      ↓
Virtual waiting room
      ↓
controlled admission
      ↓
rate limiter
      ↓
cached seat browsing
      ↓
reservation service
      ↓
strongly consistent inventory
```

This transforms demand into a safe write rate.

---

#### Q5. “How validate 10,000 concurrent?”

**Interviewer:** “How did you validate that the architecture supported 10,000 concurrent users? What load-test shape did you use and what metric became the limiting factor?”

**Answer**

Describe:

- load generator;
- realistic user journeys;
- ramp/spike/soak;
- p95/p99;
- error rate;
- DB CPU/connections;
- application CPU;
- queue lag;
- external payment latency.

A lead says:

> “I didn't consider a test successful simply because the service stayed up; it needed to meet latency and error SLOs under load.”

---

They may also ask why Redis is useful but why Redis alone should not be the source of truth for seat ownership.

#### Follow-up: “Why Redis?”

**Answer**

Good uses:

```text
seat-map cache
rate limits
session/admission state
short-lived holds [depending design]
hot event metadata
```

#### Follow-up: “Why not Redis alone as seat source of truth?”

**Answer**

Because the safety invariant is:

```text
seat can be sold only once
```

and you want durable transactional semantics.

Redis failure/eviction/failover should not permit duplicate ownership.

A robust design uses the transactional database or another strongly consistent authoritative store for final allocation.

---

### 15. Testing to 70% + Redocly/Swagger

> **Résumé bullet:** 15. “Raised test coverage from near-zero to 70% across a 90,000+ line codebase and created Redocly/Swagger API docs for partner onboarding.”

#### Q1. “How do you get 90k lines from ~0 to 70%?”

**Interviewer:** “How did you move a 90,000-line legacy system from almost no tests to 70% without stopping feature development?”

**Answer**

Don't attempt all modules equally.

```text
1. identify critical paths
2. add test seams
3. regression tests around bugs
4. new code must include tests
5. gradually raise threshold
```

Focus first on:

- payments;
- orders;
- ticket inventory;
- authentication;
- integrations.

---

#### Q2. “Which tests first?”

**Interviewer:** “Which tests gave the highest return first: unit, integration, API, database, or E2E?”

**Answer**

Usually:

```text
Unit
→ cheap core business logic

Integration
→ DB/API boundaries

E2E
→ highest-risk customer workflows
```

For a legacy system, integration tests can provide more initial value than trying to unit-test every deeply coupled class.

---

#### Q3. “Global threshold or changed code?”

**Interviewer:** “Did you enforce a coverage threshold globally or only on changed code? Why?”

**Answer**

A good migration approach:

> “I prefer ratcheting. Don't allow the codebase to get worse while gradually improving the baseline.”

For example:

```text
existing global coverage = X
new/changed code = higher threshold
```

Then ratchet global threshold upward.

---

#### Q4. “How test legacy code without DI?”

**Interviewer:** “How did you test legacy code that wasn't originally designed for dependency injection or isolation?”

**Answer**

Techniques:

- characterization tests;
- wrap external dependencies;
- extract pure functions;
- introduce interfaces gradually;
- integration test at stable boundaries;
- avoid giant rewrite solely for tests.

---

#### Q5. “How did Swagger/OpenAPI do more than documentation?”

**Interviewer:** “How did OpenAPI/Swagger become more than static documentation? Did you use it for request validation, generated clients, contract testing, partner sandboxes, or CI validation?”

**Answer**

Possibilities:

```text
API contract
   ├── interactive docs
   ├── partner onboarding
   ├── generated clients
   ├── validation
   ├── contract tests
   └── change review
```

Only claim the uses you actually implemented.

---

**And expect:**

#### Follow-up: “Why 70% instead of 100%?”

**Interviewer:** “Why 70%? Why not 100%?”

The right discussion is risk coverage, not chasing a number.

**Answer**

> “Coverage is a risk signal, not the goal. 100% can incentivize low-value tests. I cared more that business-critical branches and integration boundaries were exercised than that getters and trivial plumbing increased a percentage.”

---

## Visa — Full Stack Engineer

The Visa section has exactly two bullets: Angular/D3 infrastructure-risk dashboards and a real-time Angular/Node vendor portal.

Your resume contains two Visa claims: Angular/D3 infrastructure-risk visualization and a real-time Angular/Node vendor portal. _Oscar Gonzalez - Lead Engineer …_

### 16. Angular/D3 risk dashboard

> **Résumé bullet:** 16. “Built Angular/D3.js risk dashboards with data science teams to surface infrastructure exposure across Visa’s network, reducing incidents by 30%+.”

#### Q1. “What was the data pipeline?”

**Interviewer:** “What was the data pipeline feeding the dashboard? Where did the raw infrastructure-risk data originate, how was it transformed, and how did it reach Angular/D3?”

**Answer**

A typical structure:

```text
Infrastructure data
      │
      ▼
Data science / processing
      │
      ▼
Backend API / read model
      │
      ▼
Angular application
      │
      ▼
D3 visualizations
```

Do not say the browser processed raw Visa network telemetry unless that was true.

---

#### Q2. “Raw operational data or aggregated read model?”

**Interviewer:** “Was the dashboard querying raw operational data directly, or did you create an aggregated/read-optimized model? Why?”

**Answer**

For dashboard performance, prefer:

```text
operational/raw data
      ↓
processing
      ↓
dashboard-oriented aggregate
      ↓
frontend
```

because dashboards usually need:

```text
fast predictable reads
precomputed risk metrics
stable schema
```

rather than large raw scans.

---

#### Q3. “Tens of thousands of D3 nodes?”

**Interviewer:** “How did you visualize a large infrastructure topology without overwhelming the browser? What happened if there were tens of thousands of nodes?”

**Answer**

Techniques:

```text
aggregation
clustering
level-of-detail
virtualization
Canvas/WebGL instead of SVG at extreme sizes
filtering
incremental rendering
```

D3 doesn't require SVG; it can drive other rendering approaches.

---

#### Q4. “Where was risk calculated?”

**Interviewer:** “How did you determine what constituted ‘risk’? Was that computed by data-science models, backend services, or the frontend?”

**Answer**

The clean separation is:

```text
Data science/backend
→ computes risk

Frontend
→ visualizes risk
```

Do not embed authoritative risk models in browser JavaScript.

If some transformation happened client-side, distinguish visualization transforms from risk scoring.

---

#### Q5. “How did dashboard reduce incidents by 30%?”

**Interviewer:** “Explain the 30% incident reduction. What metric counted as an incident and how did you establish that the dashboard contributed?”

**Answer**

You need your actual metric.

Prepare:

```text
incident definition
baseline period
post-launch period
same infrastructure population?
confounding changes?
```

Good Lead framing:

> “I would avoid claiming pure causality if other improvements were happening simultaneously. The dashboard contributed by surfacing exposure earlier; the measured incident reduction during the relevant period was 30%+.”

---

**Potential follow-up:**

#### Follow-up: “Would 15-minute stale risk data be acceptable?”

**Interviewer:** “If the risk data was stale by 15 minutes, would that be acceptable? How would that affect your architecture?”

**Answer**

Answer depends on use case.

> “I would derive freshness from the operational decision. If this is strategic risk posture, 15 minutes may be fine. If it's active incident response, it may be unacceptable.”

Architecture is driven by SLO:

```text
15-minute acceptable
→ batch/aggregate

seconds required
→ streaming/events
```

---

### 17. Real-time vendor portal

> **Résumé bullet:** 17. “Developed a real-time Angular/Node vendor portal, cutting third-party tool approval cycles by 80%+.”

I would expect questions around:

- workflow state machine
- RBAC
- audit logs
- notifications
- real-time updates
- transactional consistency

#### Q1. “What does real-time mean?”

**Interviewer:** “What does ‘real-time’ mean here technically? WebSockets? SSE? Polling? Event-driven backend updates?”

**Answer**

Be precise.

If it was polling, say polling.

If WebSockets, say WebSockets.

Architecture options:

```text
Browser
  │
WebSocket / SSE
  │
Node
```

Real-time can mean:

```text
state changes appear without reload
```

but interviewer will ask _how_.

**[VERIFY exact mechanism].**

---

#### Q2. “Draw vendor approval workflow.”

**Interviewer:** “Draw the workflow for a vendor submitting a tool through review, approvals, rejection, remediation, and final authorization.”

**Answer**

```text
SUBMITTED
    ↓
SECURITY_REVIEW
    │
    ├── REJECTED / CHANGES_REQUIRED
    │
    ▼
PRIVACY_REVIEW
    ↓
PROCUREMENT
    ↓
APPROVED
```

Potential parallel approvals:

```text
              ┌── Security ──┐
Submitted ────┼── Privacy ───┼── Final Decision
              └── Procurement┘
```

Persist workflow state centrally.

---

#### Q3. “How model independent departmental approvals?”

**Interviewer:** “How would you model a multi-step approval workflow where different departments can approve or reject independently?”

**Answer**

Schema:

```text
request
approval_step
approver/role
status
timestamp
comment
```

Workflow engine determines:

```text
ALL_REQUIRED
ANY_REQUIRED
SEQUENTIAL
PARALLEL
```

Avoid encoding every flow as frontend conditionals.

---

#### Q4. “How maintain audit history?”

**Interviewer:** “How would you maintain an auditable history so Visa could prove who changed or approved each state?”

**Answer**

Use append-only audit records:

```text
request_id
actor_id
action
old_state
new_state
timestamp
metadata
```

Never overwrite history when status changes.

Security:

- RBAC;
- immutable/audited privileged actions;
- timestamps;
- authenticated actor IDs.

---

#### Q5. “How measure 80% reduction?”

**Interviewer:** “Explain how you measured the 80% reduction. Which manual or asynchronous step disappeared because of the portal?”

**Answer**

Again, actual measurement:

```text
Before:
submission → approval = X days

After:
submission → approval = Y days

(X-Y)/X
```

Explain what changed:

- centralized status;
- automatic notifications;
- reduced email/manual handoffs;
- fewer duplicate data-entry steps.

---

## Enfav LLC and the personal projects — the current project: the quality-loop engine and agentic memory

This section replaces the earlier personal-project framing with the system you are building now: one shared quality-loop engine (an AI drafts, other AIs critique and evaluate, deterministic code decides) and the memory system around it (digest pipelines that admit facts with provenance, a Postgres + Qdrant store, and recall that is scoped and measured). It is written at whiteboard altitude and every claim is tied to where it lives in the repository, so you can open the code before the interview. Figures carry their dates. Anything only you can confirm is marked **[VERIFY]**.

The résumé the company holds describes this work in these bullets.

> **Résumé bullet (Enfav LLC — Chief Software Engineer · Self-employed, Jul 2026 – Present):** Founded an AI-focused engineering company; own technical strategy, architecture, product delivery, solution design, and business operations for commercial and public-sector AI automation, custom software, systems integration, and data-processing solutions.

> **Résumé bullet (Enfav LLC):** Architected multi-agent workflow engines integrating LLMs, tool calling, API orchestration, contextual memory, and multi-step reasoning to automate technical and business processes.

> **Résumé bullet (Enfav LLC):** Designed modular applications and backend services with TypeScript, Node.js, React, Next.js, PostgreSQL, and AWS, emphasizing reliability and extensibility.

> **Résumé bullet (Enfav LLC):** Built RAG systems with vector embeddings, semantic and hybrid search, reranking, and contextual grounding; developed graph-based architecture tooling with AI critics and iterative evaluation.

> **Résumé bullet (Enfav LLC):** Integrated GitHub, Jira, Playwright, and MCP into code analysis, automated testing, and developer workflows; manage federal registration and procurement opportunity identification.

> **Résumé bullet (Personal project — Agentic Engine, AI Workflow Software Engineer, June 2025 – current):** Workflow engine compiling goals into DAGs using LLM critics/evals, strict JSON schemas, graph search, MCP, RAG, TypeScript, Node, Python.

> **Résumé bullet (Personal project — System Design Graph, Architecture & AI Evaluation, May 2026 – Present):** Built graph-based system design tooling with intelligent architecture components and LLM critic/evaluation pipelines, enabling iterative design feedback and analysis of scalability and architectural tradeoffs.

> **Résumé bullet (Personal project — Browser-Session Automation, Playwright & Agentic Workflows, January 2026 – Present):** Developed Playwright-based browser automation integrated with agentic workflows to execute multi-step interactions and validate application behavior across browser sessions.

**Interviewer's framing.** A Lead interviewer will treat "multi-agent", "contextual memory", "RAG", "critics", "iterative evaluation" and "graph search" as invitations to draw the system, name what is code versus model, explain the invariants, and show the measurements. The four areas below answer in that order: the loop, memory, the platform around them, and the two product surfaces built on the same engine. The Agentic Engine bullet still carries the earlier DAG / graph-search wording; the original question set for that wording follows this section as a reference block, so you can bridge from "it started as a goal-to-DAG compiler" to "it became a quality loop with critics, evaluators, a deterministic controller and memory".

### 19. The quality loop: one shared AI core (producer → critics → evaluators → controller → trace)

`packages/quality-loop` is the one engine every quality judgement in the applications runs on: a producer drafts an artifact, critics hunt for defects, evaluators grade a checklist, and plain code decides. The commit-time code reviewer calls the model on its own, and two helpers inside the package — the router's brief classifier and the recall probe deriver — are single schema-locked calls that feed a run rather than being judged by one. A Lead interviewer probes it because this is where "multi-agent", "critics", "iterative evaluation" and "contextual memory" either become mechanisms or stay as words: what is model and what is code, how nondeterminism is contained, how a decision is audited and replayed, and what was measured before anything was changed.

#### Q1. “Draw the quality loop end to end.”

**Interviewer:** “Draw the quality loop end to end. A request arrives — what happens until a decision comes out, and which parts are code versus model?”

**Answer**

**Say it in 60 seconds.**

> “My models only ever hand me evidence — enumerated findings and per-criterion results — never a number. Every figure comes from a policy I declared and every decision from a synchronous controller over a ledger of ids and counts. A request opens a row and gets a 202; the loop runs detached, publishes its standing after every iteration, and closes with a dump and one transaction. I run sixteen pipelines on this one core, and the core branches on none of them.”

**If they dig deeper.**

A run is one pipeline on one goal. It arrives as `POST /runs {pipeline, goal, output?, criteria?, maxIterations?, acceptAt?, adopt?, recall?, openedBy?}` on the loop service (`:3003`). Before any row exists the request is admitted, or refused with a `400`: a supplied rubric must fit the pipeline, `recall` is allowed only when the pipeline's producer declares it consumes memories, `acceptAt` may be raised above the pipeline's bar but never lowered, and an adopted iteration must come from a finished run of the same pipeline and version judged by the same rubric. Then the row is inserted as `running` with a heartbeat, the service answers `202 {runId, status}`, and the loop runs detached while callers poll `GET /runs/:id`. It is a pull seam: the engine publishes nothing on a bus.

```text
POST /runs ──► admit (400s) ──► row 'running' + heartbeat ──► 202
                                   │   callers poll GET /runs/:id
                                   ▼
        derive criteria ── MODEL, once per run ──► c1..cN
        (or adopt a supplied rubric verbatim ── CODE)
                                   │   the contract is frozen
  ┌── iteration k ─────────────────▼──────────────────────────────
  │  produce ── MODEL         or provided / adopted ── CODE
  │     ▼
  │  validators ── CODE       schema=block · bounds=warn · own
  │     ▼                     block → no lens runs; cut → the
  │                           named positions refused, all judged
  │  wave 1 ── MODEL          critics × samples + evaluators that
  │                           consume nothing; one call per sample
  │  normaliser ── CODE       confirm what ≥ minHits samples of
  │                           ONE lens agreed on
  │  wave 2 ── MODEL          evaluators consuming CONFIRMED findings
  │     ▼
  │  normaliser ── CODE       ledger: ids, enums, counts; prose unread
  │  refound ── CODE          only if the pipeline declares it
  │  controller.decide(ledger, policy) ── CODE, synchronous
  │     ▼
  │  accept · revise · retry · escalate · reject   (+ trace.steps)
  └───────────────────────────────┬──────────────────────────────
                                  │ crown the best (strictly higher)
                                  │ onIteration(standing) → Postgres
           revise / retry ◄───────┤
                                  ▼ stop: accepted · rejected ·
                                    escalated · plateau ·
                                    max-iterations · produce-lost
        dump folder written once · row closed in one transaction
```

Inside `runPipeline` the definition is validated again, then materialised into stages: the engine's own `schema` (block) and `bounds` (warn) validators go first, then the pipeline's; every model-facing stage gets its own recording client, one per lens sample, so the record can say which lens, which sample, which call. Criteria are derived once per run — the pipeline's fixed criteria first, then what the model found, numbered `c1..cN` by the engine — or a supplied rubric is adopted verbatim and the deriver is never called. The contract never changes between iterations, which is what makes iterations comparable.

Each iteration then runs five named steps — produce (or adopt), validate, judge, normalise, decide. Produce: the producer writes the artifact (iteration 1 may instead take a provided artifact as handed in, or copy an adopted iteration of an earlier run verbatim — no model stage runs — and re-decide its recorded ledger under this run's policy, so a raised `acceptAt` can change its decision). Validate: exact checks over the artifact and the goal's fenced index; a `block` keeps the artifact from every lens; a `cut` refuses the positions it names and nothing before them — the lenses still judge the whole artifact, and a host that executes positions in order runs up to the fault; a `warn` informs. Judge, in waves: every critic and every evaluator declaring `consumes: []` reads the artifact alone in wave 1; an evaluator declaring `consumes: ['findings']` runs in wave 2 and is shown only what the normaliser confirmed, never a raw report. Normalise: reports become a ledger of ids, enums and counts — findings grouped structurally and confirmed only when one lens saw the defect in `minHits` of its own samples, criteria settled by a worse-leaning median; each confirmed finding also carries its critic's bounded rationale, a sentence or two for readers of the trace and the next producer's notes, which no controller reads. Decide: `controller.decide(ledger, policy)`, synchronous, prices the ledger, consults gates in a fixed order and returns one of accept, revise, retry, escalate or reject with a trace of every step; inside this step, between the normaliser and the controller, a refound pass corrects the ledger from facts in the goal where the pipeline declares one (browser-step today). Remediation notes are then attached in the lenses' own words for the next producer.

The driver crowns a best only on a strictly higher overall, publishes the standing through `onIteration` (the host queues a Postgres progress write and never makes the loop wait), and either goes round again in the mode decided or stops for a reason it owns: `accepted`, `rejected`, `escalated`, `plateau`, `max-iterations`, `produce-lost`. At the end the host writes the dump folder once and closes the row in one transaction.

| Stage                   | Code or model                                            | What it does                                                                                            |
| ----------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| derive criteria         | model, one call per run                                  | goal → `{kind, statement}` list; the engine assigns `c1..cN`                                            |
| producer                | model, one call per produce (up to 3 attempts inside it) | the artifact; sees goal, criteria if declared, remediations on revise, pitfalls on retry, never a score |
| validators              | code                                                     | `block`, `cut` or `warn`; read the artifact and the goal's index, never prose                           |
| critics                 | model, `samples` calls each                              | defects as enums: type, severity, confidence, fixability, location ids, criterion ids                   |
| evaluators              | model, `samples` calls each                              | exactly one result per criterion of their kinds: pass, partial, fail, not_applicable                    |
| normaliser              | code                                                     | reports → ledger: agreement, medians, reconciliation                                                    |
| controller              | code, synchronous                                        | scores, four facts, gates, decision, trace                                                              |
| recorder, janitor, dump | code (host)                                              | row, heartbeat, progress, dump, liveness                                                                |

Where it lives: `packages/quality-loop/src/core/loop/run-pipeline.ts`, `packages/quality-loop/src/core/loop/iteration.ts`, `packages/quality-loop/src/core/loop/waves.ts`, `packages/quality-loop/src/core/loop/materialize.ts`, `packages/quality-loop/src/core/evidence/normalize.ts`, `packages/quality-loop/src/core/controllers/`, `packages/quality-loop/src/modules/runs/runs.service.ts`, `packages/quality-loop/src/modules/runs/run-admission.ts`, `packages/quality-loop/src/modules/runs/run-request.ts`, `packages/quality-loop/src/modules/runs/run-recorder.ts`, `packages/contracts/src/lib/quality-loop/vocab.ts`; `docs/quality-loop/reference.md`, `docs/quality-loop/lifecycle-and-hooks.md`

Code facts in this area are of the working tree at HEAD `9cd3c978` (2026-10-31) unless a figure says otherwise; every measurement carries its own date and source, and anything only you can confirm is marked **[VERIFY]**.

---

#### Q2. “Why separate critics, evaluators and a controller?”

**Interviewer:** “Why separate critics, evaluators and a controller? What breaks if one LLM judge does all three?”

**Answer**

**Say it in 60 seconds.**

> “Critics diagnose, evaluators measure, validators verify, the controller decides, memory learns. A single judge gives me a number I cannot count agreement over, cannot locate, cannot replay and cannot keep independent of what it was shown. With three roles the coupling is a declaration, and I measured it both ways: under agreement-based vetoes an evaluator shown confirmed defects judged better; under corroboration-based vetoes an evaluator shown one critic's claim became its echo.”

**If they dig deeper.**

Three questions need three instruments. A critic answers "what is wrong": each finding is a declared type, severity, confidence and fixability, the artifact locations it sits at and the criteria it weakens — every structural field an enum locked to ids that exist, so the engine can group, count and locate it — plus a bounded rationale that readers see and no controller reads. An evaluator answers "how well does each criterion hold": exactly one result per criterion of its kinds, in a list of exactly that size, so a short reply is refused rather than read as a verdict on half the checklist. The controller answers "what next" from the ledger and the policy alone.

```text
wave 1   critics × samples  +  evaluators declaring consumes: []
            │
            ▼  normaliser (code): confirm by agreement → CONFIRMED
wave 2   evaluators declaring consumes: ['findings'], shown only
         the confirmed findings, never a raw report
            │
            ▼  normaliser (code) → ledger of ids, enums, counts
               → controller (code) decides
```

Fold the three into one judge that says "7/10, revise" and the loop loses what it is built on: nothing structural to count agreement over, so one odd answer sinks a result; no location, so a browser plan cannot be cut at action 3 while actions 1–2 run; no stable identity, so you cannot tell whether a defect persisted; and a verdict that moves with the wording, neither replayable nor holdable to a threshold. The evaluator does write an advisory verdict, but it stays on its report and never reaches the ledger; a build gate fails if a controller reads it.

The split also makes the coupling between judges a declaration, and both directions were measured. Under agreement-based vetoes (agentic-design: `minHits: 2`, four critics at two samples, three evaluators consuming findings), showing evaluators the confirmed findings sharpened them: criteria named by a confirmed finding went from 69/69 pass to 16/74 pass, unnamed criteria stayed 10/10 → 6/6, and every confirmed finding was reconciled to a criterion shortfall, 0/27 → 29/29 (`n = 4` scored runs against their cycle-1 twins; `docs/pipelines/pipeline-steps.md`, undated, last committed 2026-10-16). Under corroboration-based vetoes (browser-step, one sample per lens) the opposite held: shown the critic's finding first, the evaluator failed a stop criterion in 24–41% of runs, only where the critic had raised one and with every such stop absent from the page; judging apart it failed none in 92 runs (2026-10-08, session `2026-10-08T07-39-33`, 23 recorded goals, gpt-4o-mini; `docs/quality-loop/lens-debate.md` §2). One model's hallucination had counted as two witnesses; the fix was one declaration, `consumes: []`, plus a boot check (`checkCorroboration`) that refuses an evaluator of a gating kind consuming findings in any pipeline declaring `corroboration: 'cited'` — the fourteen pipelines under `none` may still show evaluators confirmed findings.

Addition (2026-11-10): since canvas pipeline 2.4.0, system-design-canvas also declares `corroboration: 'cited'` and `penalties.contradicted` at `confidenceWeights.low` (0.33), its evaluators reading apart from the critics at three samples each; the counts above now read 13 of 16 under `none`.

Where it lives: `packages/quality-loop/src/core/stages/llm-critic.ts`, `packages/quality-loop/src/core/stages/llm-evaluator.ts`, `packages/quality-loop/src/core/stages/schemas.ts`, `packages/quality-loop/src/core/loop/waves.ts`, `packages/quality-loop/src/core/validate-pipeline.ts` (`checkCorroboration`), `tooling/quality-loop-guarantees.spec.ts`; `docs/quality-loop/lens-debate.md`, `docs/pipelines/pipeline-steps.md`

---

#### Q3. “How is a pipeline defined?”

**Interviewer:** “How is a pipeline defined? What is data and what is code, and how do you add a new domain without touching the engine?”

**Answer**

**Say it in 60 seconds.**

> “A pipeline is a folder of data — a definition that names its vocabularies, prices them in a policy and points at personas kept as markdown — plus the one piece of code it must bring, an output shape that locates and renders the artifact. I add a domain with a folder and one registry line; the engine reads what the definition declares and never asks who is calling. Boot validates every declaration, so a kind nobody judges or weights that do not sum to one fail before a run exists.”

**If they dig deeper.**

A pipeline is a `PipelineDefinition<T>`, almost entirely data: its identity (`id`, `version`, `goalSource` — a `brief` a person typed or a goal `composed` by a program), a `task` (criterion kinds and finding types as open `Record<string, meaning>`, `maxCriteria`, fixed criteria that head every rubric, the parts a revision carries, the output shape), the stages (`deriveCriteria`; a `producer` declaring what it `consumes` of criteria, memories and setbacks; `validators`; `critics` and `evaluators`, each with a persona, `samples` and the types or kinds it owns), a `controller` by reference, a `policy` and an optional `refoundEvidence` pass. Personas are markdown beside the definition, imported as text. The policy holds every number: dimension weights summing to 1, each kind and type mapped to one dimension with its weight or gate flag and what it withholds, result values, confidence weights, penalties, blocking severities, evidence rules (`minHits`, `minAssessedShare`, `corroboration`), thresholds and loop limits.

```text
packages/quality-loop/src/pipelines/<id>/
  definition.ts    the PipelineDefinition: vocabularies, policy,
                   lenses and controller by reference      (data)
  lenses/*.md      one persona per stage, imported ?raw    (data)
  output.ts        OutputShape: zod schema, locate(), render(),
                   optional normalize()                   (code)
  validators.ts    exact block | cut | warn checks       (code, opt.)
  input.ts         a codec for a composed goal           (opt.)
  controller.ts    only with a rule of its own           (1 of 16)
  refound.ts       only browser-step                     (1 of 16)
pipelines/index.ts 16 entries, erased to PipelineDefinition<unknown>
```

The code is what the tree marks as such: an output shape whose `locate()` assigns the positional ids (`component.3`, `action.2`) every judge cites and whose `render()` is the text every judge reads; exact validators over the artifact and the goal's fenced JSON index, never prose; and, only with a decision rule of its own, a controller composed from the library's gates (`system-design-canvas` composes `REVISE_ONLY`, which never decides retry because a retry would replace the author's canvas).

Adding a domain is a folder plus one line in the registry, which erases the type parameter and hands out `PipelineDefinition<unknown>`; `core/`, the orchestration runner, the CLI, the dump and every HTTP module but memory's import nothing from a pipeline folder and branch on no id. The orchestrators do: their definitions and step adapters import their declared pipelines' id constants, goal codecs and from-run builders, and the reader adapters (`read-digest`, `read-pack`, form-memory's `FORM_DEFINITIONS`, `read-knowledge-digest`, `read-register-digest`, `read-document-digest`) import the definitions to apply declared withholding — `CLAUDE.md` states the rule more strictly than they obey it. The engine reads declarations — an evaluator's `consumes` picks its wave, a validator's `gate` decides admission, `findingTypes` narrows a critic's schema, `goalSource` decides whether the router may route to it — so a new brief-taking pipeline (three today: system-design, agentic-design, memory-architecture; thirteen take a composed goal) is a route on the next boot, because routes are computed from the registry.

`validatePipeline` keeps the declaration honest at boot and at the start of every run: every cross-reference must resolve and every declared coupling must be judgeable — each criterion kind is judged by exactly one evaluator, and under `cited` corroboration no evaluator of a gating kind reads the critics first. `validatePolicy` holds the numbers: weights sum to 1, exactly the task's kinds and types priced, `0 ≤ rejectBelow < acceptAt ≤ 100`, `maxIterations`, `plateauAfter` and `concurrency` at least 1, `lostProduces` a whole number from 0. A build gate forbids the core any clock, randomness, filesystem or environment of its own.

Where it lives: `packages/quality-loop/src/core/pipeline.ts`, `packages/quality-loop/src/core/validate-pipeline.ts`, `packages/quality-loop/src/core/policy.ts`, `packages/quality-loop/src/pipelines/index.ts`, `packages/quality-loop/src/types/raw.d.ts`, `packages/quality-loop/src/pipelines/system-design-canvas/controller.ts`, `packages/quality-loop/src/orchestrators/memory/digest/read-digest.ts`, `packages/quality-loop/src/orchestrators/memory/recall/read-pack.ts`, `packages/quality-loop/src/orchestrators/form-memory/steps.ts`, `packages/contracts/src/lib/quality-loop/pipeline.ts`, `tooling/quality-loop-guarantees.spec.ts`; `docs/quality-loop/reference.md`

---

#### Q4. “How does the controller decide?”

**Interviewer:** “How does the controller decide accept / revise / retry / reject? Walk me through gates, dimensions, weights, thresholds and floors — and why it is synchronous and deterministic.”

**Answer**

**Say it in 60 seconds.**

> “Models give me enums; the policy prices them; the controller consults gates in a declared order and the first to settle wins. A veto sits before the threshold, so a 77 can be refused. Reject exists for an unfixable blocker only; the floor retries. The decide call is synchronous by type, so I can replay every recorded ledger under a candidate controller for free and read a floor off the lowest dimension the standard one accepted.”

**If they dig deeper.**

The controller's input is the evidence ledger and the policy, nothing else. The ledger carries `artifactPresent`, the validators' reports, one entry per criterion (`id`, `kind`, settled `result`, `hits`, `confidence`, evidence ids) and the confirmed findings (`key`, `type`, `severity`, `confidence`, `fixability`, location ids, cited criterion ids, `hits`, which lenses, and `reconciledTo` — the first short criterion it names). Its structural fields are ids, enums and counts; each confirmed finding also carries the critic's rationale, annotated for readers of the trace and for the next producer's notes. No controller reads it, the goal or a render: a build gate greps the controller files for those words.

```text
ledger (ids · enums · counts) + policy
        │
        ▼  context: priced once, the same under every controller
  scores   per dimension: base from its criteria
           (pass 1 · partial 0.5 · fail 0 · unassessed 0;
            not_applicable left out; 100 if it has only findings)
           minus its unreconciled findings, worst first:
           severity {critical 40, high 25, medium 12, low 5}
           × confidence {high 1, medium 0.67, low 0.33}
           × 0.7^position, the total capped at 60; clamp 0..100
           overall = weighted mean of the assessed dimensions
  facts    artifactPresent · validatorsPassed · evidenceSufficient
           (assessed share ≥ 0.75) · policyAllowed (no agreed
           blocking finding, no agreed failed gating criterion)
  fixes    remediations the producer can act on, worst first
        │
        ▼  gates in declared order — the first to settle decides
  1 artifact          none ────────────────────────────► escalate
  2 validators        a block/cut problem ─────────────► retry
  3 evidence          too few criteria judged ─────────► escalate
  4 policy-allowed    an unfixable blocker ────────────► reject
                      a requires_user blocker ─────────► escalate
                      only requires_retry, no failed
                        gating criterion ──────────────► retry
                      otherwise ───────────────────────► revise
  (4b dimension-floor any dimension < 50 → as the route would;
                      declared by memory-recall alone)
  5 accept-threshold  overall ≥ acceptAt ──────────────► accept
  6 reject-floor      overall < rejectBelow ───────────► retry
  route               no remediation ─────────────────► escalate
                      every remediation 'retry' ──────► retry
                      else ───────────────────────────► revise
```

Pricing comes first and is a total function of the ledger, traced whether or not a gate fires. Each declared dimension earns a base from the criteria whose kinds map to it: `100 × Σ(kind weight × result value) / Σ weight`, with pass 1, partial 0.5, fail 0, an unassessed criterion 0 and a `not_applicable` one left out. A dimension with no criteria but findings starts at 100; one with neither is null and drops out of the divisor. Then its findings are charged, worst first — only findings not reconciled to a short criterion, so one shortfall is charged once — at severity points times a confidence weight, each later finding multiplied by 0.7 again, the total scaled so it never exceeds 60 for one dimension; the score is clamped to 0..100 and rounded to a tenth. Under `cited` corroboration a finding the evaluator contradicted (every criterion it cites judged pass or not applicable) is charged at `penalties.contradicted` — browser-step and tool-step set that to 0.33. The overall is the weighted mean over the assessed dimensions. These are `STANDARD_SCORING` defaults every pipeline spreads and may override (source constants at HEAD `9cd3c978`).

Addition (2026-11-10): since canvas pipeline 2.4.0, system-design-canvas also declares `corroboration: 'cited'` and `penalties.contradicted` at `confidenceWeights.low` (0.33), its evaluators reading apart from the critics at three samples each; the counts above now read 13 of 16 under `none`.

Four facts are computed the same way under every controller. `validatorsPassed`: no `block` or `cut` report with a problem above `info`. `evidenceSufficient`: criteria exist and at least `minAssessedShare` (0.75 everywhere today) were assessed. `policyAllowed`: no blocking finding and no failed gating criterion — where "blocking" means a gated type or a severity in `blockingSeverities`, agreed by at least `minHits` samples, and under `cited` corroboration citing a gating criterion the evaluator itself failed. Under `cited` corroboration a finding citing nothing is priced and never a veto; under the default `none` (14 of the 16 pipelines) an agreed finding of a gated type or blocking severity blocks whether or not it cites a criterion.

Addition (2026-11-10): since canvas pipeline 2.4.0, system-design-canvas also declares `corroboration: 'cited'` and `penalties.contradicted` at `confidenceWeights.low` (0.33), its evaluators reading apart from the critics at three samples each; the counts above now read 13 of 16 under `none`.

Then the gates, in the order the controller declares, the first to settle winning and every later one recorded as `skipped`; the route always settles what no gate did. `STANDARD` is artifact → validators → evidence → policy-allowed → accept-threshold → reject-floor → route by remediations. Two consequences are worth saying aloud. No score can rescue a veto, because the policy gate sits before the threshold: the study notes' worked browser-step example scores 77.2 against a 70 bar and is still refused, because a failed safety criterion and a gated finding citing it stand. And `reject` comes from exactly one place, an `unfixable` blocker — the reject floor settles `retry`, not reject, because below the floor editing is not worth it and a fresh attempt is. `escalate` is not a human queue; it stops the loop with `stopReason: escalated` and hands the run back to whatever started it.

Thresholds are per pipeline: system-design accepts at 80 and floors at 35; browser-step, tool-step, field-answer and answer-suggestions at 70/30; the other eleven at 75/30. A request may raise `acceptAt`, never lower it. Two more controllers exist. `DIMENSION_FLOOR` (declared by memory-recall alone) inserts a floor of 50 under every assessed dimension before the accept threshold, because a weighted overall can clear the bar while one dimension is failing — the motivating run was a recall accepted at 80.6 with coverage at 59.1 (the comment in `core/controllers/dimension-floor.ts` and `docs/pipelines/memory-runs.md` §13 were committed together on 2026-09-08, commit 1fab902e, so the run is of 2026-09-08 or earlier; the doc itself does not date it). `REVISE_ONLY` (system-design-canvas) wraps the standard gates so every `retry` reads `revise`.

Why synchronous and deterministic: `Controller.decide(ledger, policy): QualityControlDecision` returns no promise, so nothing can await a model, a clock or I/O inside a decision — the doctrine is held by the type, not by review. Gates are pure readings of a read-only context, and rounding is fixed, so a decision re-decided from the recorded ledger compares byte-equal. That is what makes `main.js replay` possible: recorded iterations re-decided under every library controller with no model call.

Where it lives: `packages/quality-loop/src/core/controllers/context.ts` (`buildContext`), `packages/quality-loop/src/core/controllers/compose.ts`, `packages/quality-loop/src/core/evidence/annotate.ts`, `packages/quality-loop/src/core/controllers/gates.ts`, `packages/quality-loop/src/core/controllers/dimension-floor.ts`, `packages/quality-loop/src/core/controllers/index.ts`, `packages/quality-loop/src/core/policy.ts`, `packages/quality-loop/src/core/ports.ts`, `packages/quality-loop/src/core/arithmetic.ts` (`round1`, `round4`), `packages/quality-loop/src/pipelines/system-design-canvas/controller.ts`, `tooling/quality-loop-guarantees.spec.ts`; `docs/quality-loop/study-notes.md`, `docs/pipelines/memory-runs.md` (§13)

---

#### Q5. “How do you keep bad LLM output from corrupting a run?”

**Interviewer:** “LLM output is nondeterministic. How do you keep structurally or semantically bad output from corrupting a run?”

**Answer**

**Say it in 60 seconds.**

> “A model can neither hand me a number nor cite an id that does not exist: every schema is built per request over this run's ids. Every string and list has a declared target and ceiling, and an overrun is kept and recorded, never thrown away. Retries live inside one call, and a lost sample lowers that lens's bar instead of silencing it. A defect counts only when one lens saw it in minHits of its own samples; under cited corroboration a veto also needs the evaluator, judging apart, to fail a criterion it cites.”

**If they dig deeper.**

In layers: deterministic checks before any judgement, and a rule that a size limit never discards work.

Structure. Every schema a model answers is built per request over the ids that exist for this artifact and this contract — the ids a lens may cite are an enumeration of this run's ids, so it cannot cite what is not there — and no model-facing schema carries a number (a build gate fails on one under the stages folder). An evaluator's result list is asked for at exactly the criteria count and refused below it. The output schema must be strict — no open object, no optional property — or the pipeline refuses to boot: that gate was added when a strict JSON-schema endpoint refused an `.optional()` key on every producer call and twelve browser steps planned nothing, and it found eleven such keys in the canvas pipeline (session note `browser-navigation-forensics`, 2026-10-07/08).

```text
stage request: persona + role rules + OUTPUT_RULE
               + a zod schema built over THIS run's ids (enums only)
      │
      ▼  InFlightGate: ≤ 8 calls in flight per process, first come
         first served, never rejects; queue time is not charged
attempt 1..3 (a timeout: 2) under max(180 s, 30 s + maxTokens / 25)
      │
      ▼  parseLenient (the salvage ladder)
   text over its target  → kept whole, recorded as an overrun
   text past 3 × target  → cut at a word, marked ' […]'
   list over its ceiling → trimmed by whole items
   unknown key           → stripped
   structural fault      → REFUSED, every fault named in the next ask
      │
      ├─ ok ──► report / artifact / criteria (overruns on the record)
      └─ out of attempts ──► null → diagnostic 'llm-failed':
           a lost lens sample (its lens is held to the samples left;
           it scores but can never block) · a lost produce (the
           iteration escalates on the record and the loop asks again)
           · a lost derivation (no criteria → evidence gate escalates)
```

Size. Every string and list a model writes carries one declared bound: a target it is shown and a ceiling accepted silently (a quarter over, or at least 40 characters or 2 items); the ladder in the diagram applies past the ceiling, and only a structural fault refuses. Targets are sized by `pnpm measure:bounds` from the dumps into fixtures the specs hold bounds to (the shared lens fixture covers 2,033 runs, 2026-09-06 → 2026-10-13). The rule the bounds contract states — "a size limit never discards work" (`packages/contracts/src/lib/bounds/bound.ts`; `docs/pipeline-best-practices/quality-loop.md` QL-58) — landed on 2026-10-02 (73504a6c); that it followed the owner's "never throw work away" directive after whole 30k-token coach revisions were lost to strings 3–19% over bound is from session note `never-throw-work-away`, outside the repository (before and after counts: the 2026-10-02 → 10-03 row in Q7).

The seam. Retries live inside the one call, so a sample stays one outcome: failure is classified from the SDK's closed vocabularies rather than by matching provider prose, every fault is named in the next ask, and backoff happens only when the provider is strained; the gate in the diagram reports queue time apart, so a busy process does not manufacture timeouts. Behind it is the 2026-10-01 row in Q7: with no retry anywhere, 118 findings in 14 runs had been discarded `below-min-hits` only because a sample was lost — a silent grading bug on every `minHits: 2` pipeline.

Semantics. A defect counts only when one lens saw it in `minHits` of its own samples, and identity is type plus overlapping location ids, never wording (the identity row in Q7). Two of the six pipelines judged at `minHits: 1`, browser-step and tool-step, declare `corroboration: 'cited'`, so there a veto also needs the evaluator, reading apart, to fail a criterion the finding cites; the other four — system-design, which runs two of its five lenses at two samples but still confirms on one hit, design-prompt, field-answer and answer-suggestions — confirm on a single hit, so one sample's gated finding can block.

Where it lives: `packages/quality-loop/src/core/stages/schemas.ts`, `packages/quality-loop/src/core/stages/prompting.ts`, `packages/quality-loop/src/core/stages/schema-validator.ts`, `packages/contracts/src/lib/bounds/bound.ts`, `packages/contracts/src/lib/bounds/parse-lenient.ts`, `packages/llm/src/llm-failure.ts`, `packages/llm/src/in-flight-gate.ts`, `packages/llm/src/call-time-limit.ts`, `packages/llm/src/claude-agent-client.ts`, `packages/quality-loop/src/core/evidence/normalize.ts`, `packages/quality-loop/src/core/evidence/identity.ts`, `packages/quality-loop/src/core/validate-pipeline.ts`, `packages/quality-loop/src/pipelines/system-design/definition.ts`, `packages/quality-loop/src/core/stages/measured.json`, `tooling/bounds/measure.ts`

---

#### Q6. “What is a run record, and how do you replay?”

**Interviewer:** “What is a run record, and how do you replay or compare controller strategies on recorded evidence?”

**Answer**

**Say it in 60 seconds.**

> “A run record is a Postgres row kept alive by a heartbeat plus a dump written once at close: every prompt, every raw sample, the ledger and the decision with its gate trace. Because the controller is a pure function of ledger and policy, I re-decide every recorded iteration under a candidate controller with no model call; over three pipelines' complete runs the standard and floor controllers disagreed once, a recall pack accepted at 75.5 with coverage 40.9, and that is how I read a floor off evidence instead of guessing one.”

**If they dig deeper.**

A run record is the run as the host holds it: the wire DTO (pipeline, status, request summary, who opened it, the recall it got), the git context, every attributed model exchange, and the trace — a standing while the run goes on (iterations so far, the crowned best, the last decision on an artifact, the engine's lessons), settled with a stop reason once it ends. Each iteration carries exactly what the tree below lists for it, from its number and mode to the remediation notes the next attempt was handed.

The engine exposes two synchronous host callbacks, `sink` (every exchange, attributed to its stage and sample) and `onIteration` (the standing after each iteration). The recorder turns them into a Postgres row alive while the process says so — a heartbeat at a third of the stale window (60 s of the default 180 s), summaries and snapshots queued on one serial chain the loop never awaits — and a `close()` that stops the ticker, writes the dump, drains the chain and closes the row in one transaction as `closed`, `reclaimed` (the janitor had failed it as `Interrupted`) or `refused` (already terminal). The janitor fails only rows whose heartbeat went stale, so a run is either fully recorded or still running, and a row the janitor wrongly failed is reclaimed by its owner's late `close()`, never by the janitor; a running row's standing is rebuilt by the same code the loop uses.

```text
static/runs/<runId>/
  manifest.json       status, decision, stop reason, best overall
  run.md              the run in prose, from the record
  01-goal.md          the goal verbatim, fenced index included
  02-contract.json    the rubric c1..cN the run was judged by
  03-pipeline.json    the pipeline summary, controller steps too
  recall.json         what the producer was handed (recalling runs)
  04-iterations/NN/
    iteration.json                    number, mode, locations, duration
    artifact.json · artifact.md       what the judges read
    validation.json                   the validators' problems
    critics.json · evaluators.json    every raw sample as answered
    ledger.json                       what the normaliser confirmed
    decision.json                     gates, blockers, scores, steps
    remediations.json                 what the next attempt was told
  05-llm/NN.<scope>.<k>.{system.txt,user.txt,response.json,meta.json}
  06-lessons.json     persisted · resolved · improved · regressed
```

The dump is written once, at close, and is the audit trail; per-iteration persistence is the Postgres snapshot. The engine never reads a dump back (a build gate), so yesterday's answer cannot feed today's grade.

Replay is what the deterministic controller buys. `main.js replay --pipeline <id> [--limit n]` boots only database and pipelines, loads the newest complete runs and re-decides every recorded iteration's ledger under each library controller (`standard`, `dimension-floor`) plus the pipeline's own, printing every disagreement with each controller's reason and the lowest each dimension sat among the first controller's accepts — the number a floor is read off; it never re-runs a lens. On 2026-09-22 it re-decided 54 recorded rounds: the rules in use reproduced every decision and a stricter candidate agreed on all 54 (`docs/features-summary.md`). Over every complete run on the dev database — agentic-design 40 runs / 40 iterations, memory-recall 78 / 97, experience-digest 79 / 137 — the two controllers disagreed once, a recall pack accepted at 75.5 with coverage 40.9, which the floor holds for a revise (`docs/pipelines/memory-runs.md` §13; the table is undated in the doc — its current figures were committed 2026-09-09 PDT, 2026-09-10 UTC, in df4e7164, after the live recall of 2026-09-10 that §13 says was replayed into it). A replay uses the pipeline's current policy.

Where it lives: `packages/quality-loop/src/core/contracts/run-record.ts`, `packages/contracts/src/lib/quality-loop/decision.ts` (`IterationTrace`), `packages/quality-loop/src/core/loop/progress.ts` (`progressOf`), `packages/quality-loop/src/modules/runs/run-recorder.ts`, `packages/quality-loop/src/modules/runs/persistence/`, `packages/quality-loop/src/modules/runs/dump-trace-store.ts`, `packages/quality-loop/src/dump/build-run-dump.ts`, `packages/quality-loop/src/modules/janitor/`, `packages/quality-loop/src/cli/replay.ts`, `packages/quality-loop/src/modules/app/replay.module.ts`, `packages/quality-loop-ui/src/features/inspector/` (the run inspector, `/inspect` on `:4201`: the same record as a per-step timeline, exercised with 41 browser checks on 2026-10-01 per `docs/features-summary.md`); `docs/quality-loop/lifecycle-and-hooks.md`, `docs/quality-loop/lens-debate.md` (§4)

---

#### Q7. “What did you measure, and what did you change because of a measurement?”

**Interviewer:** “What did you measure, and what did you change because of a measurement?”

**Answer**

**Say it in 60 seconds.**

> “I never tune a judge by feel. When the browser session died on a blank page, three ‘the model is weak’ hypotheses were put forward and measurement killed all three: one sample of one critic was vetoing a correct navigate, so I made a veto need a cited criterion the evaluator itself failed, and let a cut refuse the actions it names and nothing before them while the lenses still judge the whole plan. The next day's audit found the evaluator echoing the critic it had been shown; the fix was one declaration, consumes: [], plus a boot check that forbids the shape in any pipeline that declares cited corroboration. And a 2.22% call-failure rate looked like a slow path until I counted 118 findings thrown away because a sample was lost — a grading bug.”

**If they dig deeper.**

Session notes cited in this area are files under `~/.claude/projects/-Users-oscargonzalez-Dev-interview-prep-system-design-prep/memory/<name>.md`, outside the repository, and `docs/features-summary.md` is untracked at HEAD, so a clone of the repository holds neither.

The rule the repository is built to is that a failing run is evidence about the engine, never a licence to special-case its input, and that a change you cannot demonstrate on a run you did not write is not a fix. The engine recorded 3,139 runs between 6 Sep and 18 Oct 2026, 1,940 ending in accept and 2,024 of them browser steps (`docs/features-summary.md`, as of 2026-10-28); your count since then is yours to refresh **[VERIFY]**. Each change below rests on a dated measurement.

| Date                   | Measured                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Changed                                                                                                                                                                                                                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-09-07             | system-design `soundness` has no criterion kind, so it starts at 100 and only falls: it hit the 60-point cap in 4 of 4 runs on a byte-identical goal and `compliance` was 100 in all 4, so 23 points of every overall were constant (session note `quality-loop-dead-dimensions`, verified 2026-09-07, for the 4 of 4 and the 23 points; `docs/pipelines/memory-runs.md` §1 for soundness pinned at 40 in every run; `docs/features-summary.md` for the 20% weight) | still open at HEAD for system-design; the canvas pipeline's spec asserts every declared dimension is earnable                                                                                                                                                                                       |
| 2026-09-07 → 09-09     | the lesson store froze at 6 points: a digest scoring 92.6 then 94.0 was held `revise` by one blocker on its summary and whole-run admission discarded all 8 memories; per-item admission then over-excluded (admitted share ~59% → ~42%) because findings chained through shared aliases                                                                                                                                                                            | admission = accept, or the artifact, validators and evidence gates with overall ≥ acceptAt, `policyAllowed` deliberately not required; a finding withholds only the items it names; locations became places (session note `quality-loop-memory-frozen`)                                             |
| undated (code comment) | exact ref-set identity discarded ~60% of every panel's findings over 200 dumped iterations, 88–100% on the one pipeline whose artifact exposes the most locations to cite (`core/evidence/identity.ts` comment, undated)                                                                                                                                                                                                                                            | `sameDefect` = same type and an overlapping location (`core/evidence/identity.ts`)                                                                                                                                                                                                                  |
| 2026-09-22             | agentic-design panels: a run agrees with itself within ~4 points when every sample is present (calibration range 3.7; second opinions 4.2 and 0.6), yet one lost critic sample moved a verdict 13.5 and erased a gated blocker — a false accept at 76                                                                                                                                                                                                               | no engine change; recorded as the variance baseline — the panels exist to measure variance before a score is trusted (session note `quality-loop-memory-frozen`, citing `docs/pipelines/orchestrators.md` §6); the 2026-10-01 retry and gate rest on that day's own measurement                     |
| 2026-09-22/23          | 15 memory orchestrations over the agentic prompts: target mean 63.5 with recalled lessons in the goal vs 63.6 baseline; injected count uncorrelated with score (r = 0.1)                                                                                                                                                                                                                                                                                            | goal-injection recall judged inert at that store size; the owner chose coach-only recall into the producer (`docs/pipelines/memory-runs.md` §14 for the measurement, §15 for the decision, undated there; the date 2026-10-01 is from session note `coach-recall-decision`, outside the repository) |
| 2026-10-01             | 324 runs / 4,136 calls: 2.22% of calls failed; 32 of 1,292 multi-sample lenses dropped to one sample; 118 findings in 14 runs discarded `below-min-hits` for a lost sample; the model busy ~100% of wall clock at concurrency 1.84×                                                                                                                                                                                                                                 | retry inside the call (3 attempts), the in-flight gate (8), a lost sample lowers that lens's threshold instead of silencing it, the sample became the scheduling unit (session note `llm-seam-retry-and-gate`)                                                                                      |
| 2026-10-02 → 10-03     | 4 of 8 coach revise iterations produced no artifact and 0 of 8 retries recovered; 361 replies had been clipped mid-word; after the change 20/20 produced, 16/16 recovered, 0 of 316 calls lost                                                                                                                                                                                                                                                                      | declared bounds with target and ceiling, the lenient parse, faults named on retry (`docs/features-summary.md`: 20 of 20, 4 of 8; session note `never-throw-work-away`: the 361 clipped replies before commit `9376df1`, 0 of 8 retries; session note `recall-controls-result`: 16/16, 0 of 316)     |
| 2026-10-03             | 5 paired coach runs, recall on vs off: +0.5 points, sd 7.4, about ±9 at 95%; 0 of 80 offered candidates were document points                                                                                                                                                                                                                                                                                                                                        | no claim that recall helps; about 30 pairs needed to see a 4-point effect (session note `recall-controls-result`)                                                                                                                                                                                   |
| 2026-10-07             | a 20-step session failed 20/20 on `about:blank`: one sample of one critic vetoed a correct navigate; 36 of one critic's 55 findings were the other critic's types; grounding had never been derived in 165 rubrics                                                                                                                                                                                                                                                  | `corroboration: 'cited'` with a contradicted discount, the `cut` validator gate, per-critic `findingTypes`, fixed criteria, a stall rail (session note `browser-step-veto-forensics`; `core/pipeline.ts` comments)                                                                                  |
| 2026-10-08             | evaluator in wave 2 echoed the critic: failed a stop in 24–41% of runs, 0 in 92 beside the critics; before → after on 23 recorded goals: first action ran 52% → 93%, plans refused whole 48% → 7%, vetoed for an absent stop 17% → 0, 25 s → 20 s per run (gpt-4o-mini)                                                                                                                                                                                             | `consumes: []` on browser-step's evaluator and a boot check (`checkCorroboration`) that refuses the shape in any pipeline declaring `corroboration: 'cited'` (`docs/quality-loop/lens-debate.md` §2, §6)                                                                                            |
| 2026-10-08             | an evaluator bounded only from above answered 10 of 18 criteria in 6 of 23 step runs                                                                                                                                                                                                                                                                                                                                                                                | the evaluation schema asks for exactly the criteria count (`core/pipeline.ts` comment)                                                                                                                                                                                                              |
| undated                | narrowing a mission to help one site raised false refusals from 3/8 to 6/8                                                                                                                                                                                                                                                                                                                                                                                          | reverted; the date and the mission are yours to name **[VERIFY]** (`CLAUDE.md`, TOP RULE 2)                                                                                                                                                                                                         |
| 2026-10-18             | 9 of 1,840 accepted runs crowned an iteration the controller had not accepted; no verdict would change today                                                                                                                                                                                                                                                                                                                                                        | a one-line fix is proposed and waits on your decision (session note `quality-loop-admission-crown-gap` for the 1,840; `docs/features-summary.md` for the 9 and that no verdict changes)                                                                                                             |

Two measurements that led to no change matter as much: the same input has scored about 9 points apart on byte-identical prompts (8.8 in the coach-recall audit of 2026-10-02, session notes `never-throw-work-away` and `recall-controls-result`; about 9 in `docs/features-summary.md`, as of 2026-10-28), so no single score is trusted without a panel; and the 2026-10-08 browser-step figures were taken on gpt-4o-mini through an openai-compatible config, while the configured provider today is the Claude Code subscription — 975 of the 3,139 runs, on 6–9 Oct 2026, used OpenAI or a local model.

Where it lives: `docs/quality-loop/lens-debate.md`, `docs/pipelines/pipeline-steps.md`, `docs/pipelines/memory-runs.md`, `docs/pipelines/orchestrators.md`, `docs/features-summary.md`, `packages/quality-loop/src/core/pipeline.ts`, `packages/quality-loop/src/core/controllers/context.ts`, `packages/quality-loop/src/core/evidence/identity.ts`, `packages/quality-loop/src/core/validate-pipeline.ts`, `packages/quality-loop/src/pipelines/system-design-canvas/definition.spec.ts`, `packages/llm/src/llm-failure.ts`, `CLAUDE.md`

---

#### Follow-up: “What are the loop limits, and what happens when they are hit?”

**Interviewer:** “What are the loop limits, and what happens when they are hit?”

**Answer**

**Say it in 60 seconds.**

> “The limits belong to the driver, not the controller: the controller sees one ledger and decides what the artifact deserves, and the loop owns how many times it may ask and when to stop. Each pipeline declares them on its policy — maxIterations, plateauAfter, concurrency and lostProduces — so a browser step gets one iteration because a fresh observation beats a blind revise, a digest gets two and a design gets three. A terminal decision stops the loop at once; otherwise it stops at plateau or at max-iterations with the best iteration still crowned and nothing discarded. A produce that answers nothing is still decided on the record, never takes the crown and never counts toward the plateau; I ask again with the refusals named and stop produce-lost only once more produces are lost than the policy allows. Around the loop sit limits of other kinds — a 64,000-byte goal budget, maxTokens doubling as the call's time limit, eight calls in flight per process, and a janitor that fails a run whose heartbeat has gone stale.”

**If they dig deeper.**

The limits are the driver's, not the controller's: the controller sees one ledger and decides what the artifact deserves; `runLoop` owns how many times it may ask and when to stop. They are declared on each pipeline's `policy.loop`: `maxIterations`, `plateauAfter`, `concurrency` (how many lens samples run at once within a wave) and `lostProduces`. At HEAD: one iteration for browser-step, tool-step, field-answer, answer-suggestions and interview-turn (a fresh observation beats a blind revise; the operator waits on a form); two for the four digest pipelines, memory-recall, design-prompt and introduction-note; three for system-design, agentic-design, system-design-canvas and memory-architecture. `plateauAfter` is 1 or 2, concurrency 2 or 3, `lostProduces` 1 everywhere. A request may set `maxIterations` up to the HTTP cap of 10 (the studio coach uses 3 by default) and may raise `acceptAt`, never lower it.

What happens at each limit. A terminal decision (accept, reject, escalate) stops the loop at once with that stop reason. Otherwise, after `plateauAfter` consecutive iterations that did not beat the best, the run stops `plateau`; on the last iteration it stops `max-iterations`; both keep the best iteration crowned and the last artifact's decision as the run's `finalDecision`, and nothing is discarded — the studio imports every strictly better coach iteration as it lands, and a readout on the record says whether the best cleared the bar it was held to. A produce that answers nothing is still decided (no artifact → escalate, on the record), does not take the crown and does not count toward the plateau; the loop asks again in the same mode from the best with the schema's refusals named, and stops `produce-lost` only once it has lost more produces than `lostProduces` or has no iteration left.

Around the loop sit limits of other kinds. The goal budget is 64,000 bytes (`GOAL_BUDGET_BYTES`): the codecs of composed goals hold what they render to it, `POST /criteria`, the route report and the retrieval report refuse an over-budget goal at the edge, and every prompt reaches the goal through one function that strips the fenced index and caps the text at it, so no judge reads the engine's bookkeeping; `POST /runs` itself accepts any non-empty goal. Every stage declares `maxTokens`, which is also the call's time limit (at least 180 s). The process gate allows 8 calls in flight. A running row whose heartbeat is older than `QUALITY_LOOP_RUN_STALE_AFTER_MS` (default 180,000 ms) is failed by the janitor as `Interrupted`, and a late close reclaims it. Hosts add their own rails outside the loop — a browser session counts tasks, minutes and consecutive failures — but those never reach the engine.

Where it lives: `packages/quality-loop/src/core/loop/run-pipeline.ts`, `packages/quality-loop/src/core/loop/briefing.ts`, `packages/quality-loop/src/core/loop/progress.ts`, `packages/quality-loop/src/pipelines/*/definition.ts` (`policy.loop`), `packages/contracts/src/lib/quality-loop/runs.ts`, `packages/contracts/src/lib/quality-loop/goal-index.ts`, `packages/quality-loop/src/modules/http/goal-request.ts`, `packages/quality-loop/src/modules/runs/run-request.ts`, `packages/quality-loop/src/core/stages/prompting.ts` (`goalSection`), `packages/contracts/src/lib/introduction-note.ts`, `packages/contracts/src/lib/interview.ts`, `packages/contracts/src/lib/agentic-system/register-digest.ts`, `packages/quality-loop/src/modules/janitor/stale-after.ts`; `docs/quality-loop/orchestrators.md` (§2, "When it stops")

---

#### Follow-up: “How do lessons get stored, and who reads them?”

**Interviewer:** “How do lessons get stored, and who reads them?”

**Answer**

**Say it in 60 seconds.**

> “Two things are called a lesson. The engine's is deterministic: after each iteration I compare consecutive judged ledgers and record persisted or resolved per finding and improved or regressed per criterion; it sits on the trace and feeds back to no producer. The memory tier's lesson is model-proposed and judged before it is stored: a finished coach run is reduced to engine facts, a producer proposes at most eight memories, three critics and one evaluator judge them, and the survivors become one chunk each in Qdrant, replacing the source run's earlier chunks. Only a producer that declares it consumes memories can be handed them — the studio recalls for coach runs only, so a grade rests on the prompt alone — and the curated recall briefs that producer under one heading the deriver, critics and evaluators never see. Whether recall helps is not established: plus 0.5 with a margin of about 9 over five pairs.”

**If they dig deeper.**

Two things are called a lesson. The engine's `Lesson` is deterministic: after each iteration the loop compares consecutive judged ledgers and records `persisted` or `resolved` per finding key and `improved` or `regressed` per criterion; it sits on the trace and in `06-lessons.json` and feeds back to no producer. The memory tier's lesson is a model-proposed `{insight, appliesWhen}` distilled from a finished run and judged before it is stored.

```text
coach run settles ──► POST /orchestrations/memory/from-run {runId}
  digest  run → engine facts (criteria, findings, transitions)
          → experience-digest run (3 critics ×2, 1 evaluator ×2)
          → admission + per-item withholding → endorsed memories
  store   one chunk per memory · vectors {condition, lesson}
          → Qdrant, replacing the source run's chunks
                                            │
next coach run (recall: true) ◄─────────────┘
  probes → one search → reciprocal-rank fusion → 16 candidates
  → memory-recall run (the curator) → ≤ 8 kept, unfaulted
  → the producer's prompt only, under
    "# Lessons from earlier runs (advisory)"
    the deriver, critics and evaluators never see them
```

Storing. When the studio sees a coach run complete it posts the run once to the `memory` orchestrator's `from-run` entry; a grade is never digested. The digest step reduces the run to engine facts — criteria with results and transitions, confirmed findings folded by key, the best artifact — and runs `experience-digest` over it: a producer proposes at most 8 memories citing engine aliases, three critics and one evaluator judge them at two samples each with `minHits: 2`, and `STANDARD` decides at 75. The reader applies the admission rule every memory consumer shares (the 2026-09-07 → 09-09 row in Q7: accepted, or the artifact, validators and evidence gates held with overall at or above the bar, `policyAllowed` deliberately not required), then withholds each memory a confirmed finding names by that type's declared `withholds` (`every-ref` for a false or misleading memory, `none` for one merely weak or duplicate). The survivors become one chunk each with two named vectors, the condition it applies under and the lesson, written to Qdrant under the source run's id and replacing that run's earlier chunks.

Reading. Only a producer that declares it consumes `memories` can be handed them; `recall` on any other pipeline is refused before a row exists, and the studio sends `recall: true` for coach runs only, so an author's grade rests on the prompt alone. The recall builds probes from the goal and the adopted iteration's defects, searches both vectors, fuses by reciprocal rank to 16 candidates, has `memory-recall` curate them (at most 8 kept, each with what it serves and a caveat), drops any a confirmed finding faulted, and briefs the producer under one heading whose single call site a build gate pins to the producer stage. That was the owner's decision — coach-only recall from the curated pipeline — recorded undated in `docs/pipelines/memory-runs.md` §15 (the date 2026-10-01 is from session note `coach-recall-decision`, outside the repository), because lessons appended to the goal every lens reads could turn a remembered demand into a criterion the brief never asked for, and had measured inert (63.5 vs 63.6 over 15 orchestrations, 2026-09-22/23). The memory orchestrator's own recall step still injects into the goal under `## Remembered evidence (advisory)` and strips it before digesting, so remembered evidence is never re-digested.

Whether recall helps is not established (+0.5 ± 9 over 5 pairs, 2026-10-03), and one gap is open: admission trusts the run's `accept` while readers draw the crowned iteration, which on 2026-10-18 was unaccepted in 9 of 1,840 accepted runs with no verdict changed (session note `quality-loop-admission-crown-gap` for the 1,840; `docs/features-summary.md` for the 9).

Where it lives: `packages/quality-loop/src/core/evidence/lessons.ts` (`deriveLessons`), `packages/quality-loop/src/orchestrators/memory/`, `packages/quality-loop/src/pipelines/experience-digest/`, `packages/quality-loop/src/pipelines/memory-recall/`, `packages/quality-loop/src/core/outputs/run-outputs.ts`, `packages/quality-loop/src/core/outputs/withheld.ts`, `packages/quality-loop/src/modules/memory/`, `packages/quality-loop/src/modules/memory/query-probes/llm-query-probes.ts`, `packages/quality-loop/src/core/stages/prompting.ts`, `packages/quality-loop/src/core/stages/llm-producer.ts`, `packages/studio-api/src/modules/sessions/run-kinds.ts`, `tooling/quality-loop-guarantees.spec.ts`; `docs/quality-loop/memory-digest-and-recall.md`, `docs/pipelines/memory-runs.md`

---

#### Follow-up: “What is an orchestrator versus a pipeline?”

**Interviewer:** “What is an orchestrator versus a pipeline?”

**Answer**

**Say it in 60 seconds.**

> “A pipeline answers one question about one artifact; an orchestrator answers a question that needs several quality runs — does this run go better if it remembers, which judge does this brief belong to, would I get this number again — and it is data over registered pipelines. A definition declares its steps, each with what it needs, the pipelines it may run and an adapter that turns earlier outputs into a run input and reads the child back; one generic runner executes any of them and names no step. Nine are registered, and the record is flushed whole on every transition, so a process that dies leaves a row that explains itself. The panel pair is the sharpest illustration: calibration runs the same pipeline on the same brief N times and reconciles under alignment produced, second-opinion holds one artifact fixed and reconciles under alignment provided, and the difference is one declared word. Reconcile reports spreads, tallies and contested findings but never judges, because a threshold there would be policy, and policy lives on a pipeline.”

**If they dig deeper.**

A pipeline answers one question about one artifact. An orchestrator answers a question that needs several quality runs — does this run go better if it remembers, which judge does this brief belong to, would I get this number again, do the judges agree — and it is data over registered pipelines. An `OrchestratorDefinition` declares `takesTarget`, the port bundle it runs over by name, a closed list of step reasons, optional `normalize` and `refuse` hooks, the context it observes at open, the shape of each step's report, and the steps: each with an `id`, the `needs` it consumes, the pipeline(s) it may run (a name, a list, or a chooser read from the request and earlier outputs), an optional `provided` stand-in, and a `run` adapter that turns earlier outputs into a run input and reads the child back. One generic runner executes any of them and names no step. `validateOrchestrator` fails boot on structure; a declared pipeline missing from the registry skips the step `pipeline-unavailable` at run time. A step can only run a pipeline it declared, a reason outside the runner's seven plus its own is `errored`, and every step reads a child through one outputs module, so nothing re-derives the best iteration.

```text
orchestration run — one row; every declared step 'pending' at open
  └─ step { id, needs, pipeline (name|list|chooser), provided?, run }
       └─ quality run(s) the step opens — each its own row and dump
            └─ iterations

memory          recall → target → digest → store
knowledge       target → known → digest → store
calibration     panel (N whole runs) → reconcile (alignment produced)
second-opinion  first → panel (one artifact, N judgements) → reconcile
router          classify (model, ids locked to brief pipelines) → judge
```

Nine are registered: `memory`, `calibration`, `second-opinion`, `router`, `form-memory`, `document-memory`, `knowledge`, `memory-design`, `register-memory`. The record is flushed whole on every transition, so a process that dies leaves a row that explains itself; starts are HTTP only (`POST /orchestrations/:orchestrator` answers 202; `/from-run` hands a finished run to any step that declares a stand-in).

The panel pair is the sharpest illustration of "data, not code". `calibration` runs the same pipeline on the same brief N times (default 3, at most 5, two at a time) and reconciles under alignment `produced`: producer and judges both vary, so finding keys are never compared. `second-opinion` holds one artifact fixed, skips the producer and runs fresh panels under alignment `provided`, so keys can be compared. The difference is one declared word in the reconcile step, and `reconcile` reports spreads, tallies and contested findings but never judges: a threshold there would be policy, and policy lives on a pipeline. The rows show why both exist: a two-sample calibration of system-design moved 0.7 overall but 12.4 on `soundness`, and a second opinion over one artifact landed within 4.3 with the same decision and 37 findings seen by some panels and not others (`docs/quality-loop/orchestrators.md` §6–§8; rows undated in the doc, file last committed 2026-10-18). The `router` computes its routes at open as every registered pipeline with `goalSource: 'brief'`, locks the classifier's answer to those ids and lets the runner's declared-pipeline check dispatch; a composed-goal pipeline is never a route or a target.

Where it lives: `packages/quality-loop/src/orchestrators/runner/definition.ts`, `packages/quality-loop/src/orchestrators/runner/run-orchestration.ts`, `packages/quality-loop/src/orchestrators/index.ts`, `packages/quality-loop/src/orchestrators/common.ts`, `packages/quality-loop/src/orchestrators/panel/steps.ts`, `packages/quality-loop/src/core/outputs/` (`outputsOf`, `admission`, `withheldItems`), `packages/quality-loop/src/core/outputs/reconcile.ts`, `packages/quality-loop/src/modules/orchestration/`, `packages/quality-loop/src/modules/router/classifier/llm-brief-classifier.ts`; `docs/quality-loop/orchestrators.md`

---

### 20. Memory: digest and recall

Memory is the part of the engine that lets one run learn from another and lets an agent carry facts across sessions: finished runs and documents are digested into judged, cited memories, stored as vectors with provenance, and recalled into the one reader allowed to see them. A Lead interviewer probes it because the résumé claims RAG with contextual grounding and "contextual memory", and the cheap version of both is a vector store with a prompt stapled on. The questions below test whether writes are disciplined, reads are scoped, wrong facts can be retracted, and whether any of it was measured rather than assumed.

#### Q1. “Design the memory system”

**Interviewer:** “Design the memory system. What goes in, how is it digested, where is it stored, and how does it come back out?”

**Answer**

**Say it in 60 seconds.**

> Memory in my engine is a judged write path and a scoped read path over two stores. Everything that enters is proposed by a model but admitted by code: a digest is itself a quality-loop run, and a memory is stored only if no confirmed finding of a withholding type names it. Every point carries provenance back to the run and iteration it was learned from, so I can retract by run, re-embed a lesson run without asking a model again, and explain any recalled line. Reads are built from the goal and the run's own open defects, fused across two vectors, curated by a pipeline, and shown to one reader only. The job assistant's memory runs on a separate runtime where Postgres is the truth and the vector index is a projection. And I measured whether any of it helps rather than assuming it does.

**If they dig deeper.**

Start with the one rule everything else follows from: nothing enters the store unless a judged run endorsed it, every stored item says exactly where it came from, and the code that reads the verdict and the store is deterministic. Models propose; the engine admits, embeds, files and recalls.

**What goes in.** Three sources, two lanes.

- Finished quality-loop runs: the run's own trace (findings with their refs, criteria and whether they held, iteration transitions) rendered as a record with a fenced JSON Index that no model sees. This is the experience lane.
- Documents: the résumé, the standing-answers notes and the Studio's experience export, chunked by `memory-ingest`; a chunk's identity is the sha256 of its rendered goal, so an unchanged chunk is never posted twice.
- Operator answers given during a browser session. On the shipped `memory` brain these skip the digest: an operator's answer is written as the subject's own fact with no model in the path, keyed by the hash of the question, with the channel it came by as provenance. The operator is whoever answers the session, the owner or not, so a wrong answer is retracted as data rather than trusted as truth (the earlier `loop` brain digested answers through the document lane instead).

**How it is digested.** A digest is an ordinary quality-loop run of a digest pipeline (`experience-digest`, `document-digest`, `knowledge-digest`, `register-digest`). The producer proposes memories, each a `condition` (when this applies), a `lesson` or fact (what holds), a declared kind, and the aliases it cites from the Index. Critics fault memories by location, one finding at the one memory it faults; evaluators measure criteria derived from the record's own signals; the controller decides. The orchestrator then reads the verdict as data. Admission is per item: a confirmed finding of a type that declares `withholds: every-ref` removes the memories it names and nothing else. An experience or knowledge digest that fell short of the bar stores nothing; a document digest judged below the bar is still drawn on when the engine's own gates held (artifact present, validators passed), with every memory a withholding finding names still withheld, because a true fact transcribed from a document is not lost to a score on its writing.

**Where it is stored.** Two tiers, one principle: what is searched by meaning lives in Qdrant, what must survive lives in Postgres. In the quality-loop tier each admitted memory becomes one Qdrant point with two named vectors (condition and lesson, embedded separately because they are different registers) and a payload that carries the memory's text and its two indexed key texts, plus provenance: source run, pipeline, the judged iteration and its decision, lineage (the judged run, what it adopted, the goal hash), digest run id, embedding model, content hash, kind, scope and unit key, and evidence facets. Postgres holds the truth the points derive from: the run traces, the orchestration ledger that records what each step did and why, an embedding cache keyed by model and sha256 of the text, and the `memory_support` rows that make reinforcement idempotent. In the agentic-memory tier the record itself is the Postgres truth, versioned and never deleted, and the Qdrant point is a rebuildable projection.

**How it comes back out.** Recall builds a search from the bare goal: its head, focus lines from the run's own open findings and criteria, and a few model-derived probe conditions. Each text is embedded and searched against both vectors; the lists are fused by reciprocal rank and deduplicated by content hash, screened for novelty against the run's own lineage when the recall starts from a judged iteration, and handed to a curator pipeline (`memory-recall`) that keeps at most eight, says what each one serves, and names what was missing. What survives reaches exactly one reader, the coach's producer, as an advisory section; judges never see it. The form path recalls with no model at all: a payload filter by kind and unit key hands evidence to the `field-answer` pipeline.

```text
JUDGED LANE  (a digest is one quality-loop run)

run trace ─┐
           ├─> producer ──> validators ──> critics ──> evaluators
document ──┘   proposes      schema and     fault one    measure the
chunk          memories      index checks   memory each  derived rubric
                                                 │            │
                     revise <──── controller (deterministic) <┘
                                                 │ accept | fell short
                                                 v
               orchestrator reads the verdict as data
               admission per memory: each type's declared withholds
               document lane also draws on fell-short, gates held
               embed condition + lesson   (Postgres cache by sha256)
               replace (source run, owned kinds) ──> Qdrant points

DETERMINISTIC LANE  (no model)

operator answer ──> fact keyed by sha256(question) ──> space record
                (Postgres truth) ──> point projected by write or sweep
```

Where it lives: `packages/quality-loop/src/orchestrators/memory/` (`steps.ts`, `digest/endorsed.ts`, `store/`, `recall/`), `packages/quality-loop/src/orchestrators/document-memory/steps.ts`, `packages/quality-loop/src/pipelines/experience-digest/`, `packages/quality-loop/src/pipelines/memory-recall/`, `packages/quality-loop/src/modules/memory/` (`qdrant/`, `persistence/`, `query-probes/`), `packages/memory-ingest/src/core/`, `packages/agentic-memory/src/`, `packages/browser-session/src/adapters/memory-loop/` (`teach.ts`)

---

#### Q2. “Why digest through the quality loop?”

**Interviewer:** “Why digest through the quality loop instead of embedding raw text? What do a digest pipeline's producer, critics and evaluators do, and what gets withheld?”

**Answer**

**Say it in 60 seconds.**

> I digest through the loop because raw text stores words and a digest stores checked claims: each memory separates its condition from its lesson, declares a kind and cites the engine's own Index, so a critic can fault it by location. What gets withheld is declared per finding type, never decided by a model: a confirmed finding of a withholding type removes exactly the memories it names. The test I apply is whether the defect makes the item false or merely weaker, which is why vagueness and duplicates are priced but never withheld. The one time a check voided a whole artifact was a 400-character statement bound sized on the wrong pipelines, so I made the bound a per-pipeline declaration under a contract ceiling and recorded a missing rubric as what it is, not as a verdict.

**If they dig deeper.**

Embedding raw text stores what a source says in its own words, and recall then returns passages nobody has checked for truth, transfer or duplication. A digest through the loop stores claims shaped for the reader and already checked: each memory separates the condition it applies under from the lesson or fact, declares a kind, and cites aliases from an Index the engine wrote, so a critic checks a claim against the record by location rather than by impression. Engine, controller and verdict reader are shared; the four pipelines differ only in declared data (kinds, finding types, withholds, personas) and in validators of their own, inside their folders.

| Pipeline            | Reads                                                     | Yields                                                                      | Gated finding types                                                               |
| ------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `experience-digest` | a finished run's record                                   | condition-plus-lesson memories with a kind and cited aliases                | `misattributed_evidence`, `run_specific`                                          |
| `document-digest`   | a document chunk under a declared scope (subject or unit) | facts, stories and claim boundaries                                         | `invented_fact`, `misread_section`, `misscoped_fact`                              |
| `knowledge-digest`  | a finished run's record                                   | `fact`, `pattern`, `anti_pattern` and `procedure` items plus finding chunks | `misattributed_evidence`, `ungrounded_fact`, `run_specific`                       |
| `register-digest`   | a text for a memory space                                 | memories filed into the space's declared registers                          | `ungrounded_memory`, `misread_section`, `stored_instruction`, `forbidden_content` |

In every one the producer proposes, each critic faults one memory per finding, by location, and the evaluators measure criteria a deriver writes for that run. The knowledge digest adds a kinds validator that checks, through the Index, that a `procedure` rests on a finding recorded resolved, a `pattern` on a criterion that held or a finding that resolved, and an `anti_pattern` on a confirmed finding; a `fact` needs only cited evidence, which the references validator already requires.

What gets withheld is declared per finding type: `every-ref` drops every memory the confirmed finding names, `every-ref-when-requires-user` drops them only when the judge marked the fix `requires_user`, and `none` prices the fault and lets the memory stand. Gate and withholds are independent axes (`unsupported_effect` in `experience-digest` is ungated yet withholds), and the test is whether the defect makes the item false (misattribution, invention, a misread section, run-specificity) or merely weaker (vagueness, compound wording). Duplicates withhold `none` everywhere, because a confirmed duplicate set is a component of overlapping claims and may hold a bystander: 3 of 8 `duplicate_memory` findings named an innocent third memory, 18 of 75 in a wider sample (2026-10-03, `docs/quality-loop/memory-digest-and-recall.md` §8). A fell-short experience or knowledge digest stores nothing; a document digest below the bar is still drawn on when its artifact was present and its validators passed; `no-rubric` and `no-artifact` are recorded as what they are, never as a verdict on the memories.

The cap lesson. A derived criterion statement is bounded at 400 characters by default, a default sized on the pre-canvas pipelines; one canvas-sourced record pushed the model to 751 characters on three attempts and lost the whole run, because the strict reply is all or nothing: the overlong statements discarded the rubric, every lens skipped for want of one, and eight valid memories were thrown away as `not-accepted` (`docs/quality-loop/memory-digest-and-recall.md` §2.5, §3.2). The default stayed 400; the fix added an extension point. A pipeline declares its own statement bound under a 1,200-character ceiling the contract declares and boot refuses a bound above it; the two digests that read a run's record declare 1,200, the two that read a text declare 600, and a statement past a bound's ceiling is kept and recorded rather than discarding the rubric. Admission now reports `no-rubric` apart from `fell-short`. A declared bound is a contract with the model, measured per pipeline, and one that can void a whole artifact is the most expensive kind of check.

**[VERIFY]** The sweep behind the cap lesson (96 pre-canvas digest runs, 1,142 statements, longest 288; one canvas record at 735, 573 and 751 across three attempts; two overlong statements discarding all thirteen) is recorded in the session measurement note digest-criteria-statement-cap (2026-10-02), not in a repository doc; the repository doc records 751, the raise from 400 to 1,200 and the eight lost memories.

Where it lives: `packages/quality-loop/src/pipelines/experience-digest/`, `packages/quality-loop/src/pipelines/document-digest/`, `packages/quality-loop/src/pipelines/knowledge-digest/` (`definition.ts`, `validators.ts`), `packages/quality-loop/src/pipelines/register-digest/`, `packages/quality-loop/src/core/outputs/` (`run-outputs.ts`, `withheld.ts`), `packages/quality-loop/src/orchestrators/memory/digest/`, `packages/quality-loop/src/orchestrators/document-memory/steps.ts`, `packages/quality-loop/src/core/stages/schemas.ts`, `packages/quality-loop/src/core/contracts/task.ts`, `packages/quality-loop/src/core/validate-pipeline.ts`, `packages/contracts/src/lib/quality-loop/evidence.ts`

---

#### Q3. “Postgres plus Qdrant: what lives where?”

**Interviewer:** “Storage: Postgres plus Qdrant — what lives where? Chunks, kinds, named vectors, provenance, tenancy and spaces.”

**Answer**

**Say it in 60 seconds.**

> Postgres is my truth and Qdrant is what I search: a lesson point is rebuilt from its digest trace with no model call and an agentic record is re-projected by the sweep, while document and knowledge points today need a re-ingest or re-digest, so losing the vector store costs embeddings for two tiers and one model pass for the third, a gap I know and have not closed. Kinds are a closed, declared list composed from each pipeline's own kinds, and every writer names the kinds it owns and replaces only those. In the loop tier, one owner's isolation is by payload, scope and unit key, enforced in the search filter; in the agentic tier tenancy is by construction, with the tenant as the first policy scope key, visibility by jsonb containment in Postgres, and a Qdrant filter built from the policy's keys rather than the request's. The store is small and I say so: hundreds to a thousand points, nothing measured at millions.

**If they dig deeper.**

The split follows what each store is good at and what must survive the other's loss. Postgres holds everything needed to rebuild: run traces, ledgers, the embedding cache, support rows and, in the agentic tier, the records themselves. Qdrant holds only what is searched by meaning, with a payload rich enough to filter on and to explain a hit.

| Concern                | Postgres                                                                                                                        | Qdrant                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Evidence of a memory   | `quality_run` traces; `orchestration_run` ledger with reason and counts                                                         | nothing; every point names its run                                                         |
| One memory (loop tier) | no row; the digest run is the unit                                                                                              | one point, id a uuid of sha256(runId, ref), chunked under the iteration its evidence cites |
| Vectors                | none                                                                                                                            | two named cosine vectors, `condition` and `lesson`; 1536 dims, text-embedding-3-small      |
| Provenance and facets  | the digest run and the source run, in full                                                                                      | the payload below; 15 keyword indexes ensured at every boot                                |
| Scope and unit         | agentic tier: `partition` column and jsonb `scope`                                                                              | loop tier: payload `scope` and `unitKey`; agentic tier mirrors its keys                    |
| Embedding cache        | `memory_embedding`, unique on (model, contentHash)                                                                              | the vectors on the points                                                                  |
| Reinforcement          | `memory_support` rows, unique on (point, source run)                                                                            | a payload count recomputed from the rows                                                   |
| Record (agentic tier)  | `memory_record`: versioned, closed by compare-and-set, never deleted; one current record per (space, register, scope, identity) | projection only: id, one vector, filter payload; rebuilt by the sweep                      |
| Collection             | none                                                                                                                            | `quality-memory__v2__<model>__<dims>`, `agentic-memory__v1__<model>__<dims>`               |

```text
loop-tier point payload (collection.ts, toPayload)
  source:     runId, pipeline, kind, ref, iteration, decision, when
  texts:      text, keys{condition, lesson}, storedAt
  provenance: digestRunId, model, contentHash, evidence[kind, ref],
              lineage{judged, adoptedFrom, goalHash}
  scoping:    scope (subject | unit), unitKey
  facets:     dimension, polarity, transition, grounding, topics,
              criterionKinds, findingTypes, severity, support
```

Kinds. Chunk kinds are a declared, closed list: `CHUNK_KINDS` is a zod enum composed from each pipeline's own kind list (`section`, `finding`, `criterion`, `lesson`, the three document kinds and the four knowledge kinds), and the payload schema rejects anything outside it. A new kind is one entry in a pipeline's declared list and the schema widens by composition: declared data, but not an open string. Each writer declares the kinds it owns and replaces only those: the memory orchestrator `lesson`; the knowledge orchestrator its four kinds and `finding` under the same source run; a document digest the default `lesson` kind plus its three document kinds (`profile_fact`, `profile_story`, `claim_boundary`) under its own digest run, the default being where a memory of a stray kind is filed.

Tenancy. The loop tier is a single-owner store: isolation is by payload (`scope`, `unitKey`), and every search excludes other units' unit-bound memories in the filter. The agentic tier is multi-tenant by construction: a space is compiled from a strategy under a policy whose first scope key is the partition (`tenant`), with `project`, `user` and `unit` narrowing. A record is visible to a request whose scope contains its own (jsonb containment in Postgres); in Qdrant the filter loops over the policy's keys, never the request's, so a user's memory cannot leak tenant-wide. Spaces are addressed by name (`PUT /spaces/by-name/:name`), keep their policy snapshot and report their `scopeKeys`.

Scale. The store is small: 386 loop-tier points on 2026-10-02 (`docs/quality-loop/memory-digest-and-recall.md` §3.4), 1,047 on 2026-10-03 (session measurement note recall-controls-result), 163 memories in the agentic verification tenant by 01:40 UTC on 2026-10-28 (the tracked `docs/agentic-system/job-assistant-verification-2026-10-28.md`; repeated in the working tree's `docs/agentic-system/overview.md`, uncommitted at HEAD `9cd3c978`). Nothing has run at millions of points per tenant, and what I would measure first there is the cardinality of the scope and unit payload indexes, filtered search cost under the partition filter (a collection per tenant is the alternative), the sweep's page of 100 and the embedding cache's hit rate.

```text
Postgres (truth)                     Qdrant (searched, rebuildable)
┌─────────────────────────┐          ┌─────────────────────────────┐
│ quality_run (traces)    │  reindex │ quality-memory__v2__...     │
│ orchestration_run       │ ───────> │  point = condition + lesson │
│ memory_embedding cache  │          │  payload = text, keys,      │
│ memory_support rows     │          │  provenance, kind, scope    │
├─────────────────────────┤          ├─────────────────────────────┤
│ memory_space, _record,  │  project │ agentic-memory__v1__...     │
│ _space_digest ledger    │ ───────> │  point = one vector +       │
│ (CAS close, no deletes) │  (sweep) │  partition, scope, times    │
└─────────────────────────┘          └─────────────────────────────┘
```

**[VERIFY]** The 1,047-point count is from a session measurement note (recall-controls-result, 2026-10-03) and the 163-memory tenant count from the tracked `docs/agentic-system/job-assistant-verification-2026-10-28.md` (repeated in the uncommitted `docs/agentic-system/overview.md`); the repository doc records the 386.

Where it lives: `packages/quality-loop/src/pipelines/memory-recall/input.ts` (`CHUNK_KINDS`), `packages/quality-loop/src/modules/memory/qdrant/collection.ts`, `packages/quality-loop/src/modules/memory/qdrant/qdrant-memory-store.ts`, `packages/quality-loop/src/orchestrators/memory/store/chunks.ts`, `packages/quality-loop/src/orchestrators/document-memory/steps.ts` (`DOCUMENT_MEMORY_OWNED`), `packages/quality-loop/src/modules/memory/persistence/`, `packages/db/src/entities/` (`memory-record`, `memory-space`, `memory-space-digest`, `memory-embedding`, `memory-support`), `packages/agentic-memory/src/adapters/`, `packages/agentic-memory/src/lifecycle/sweep.ts`, `packages/agentic-system/config/memory/standard.json`, `packages/qdrant-kit/src/qdrant.ts`

---

#### Q4. “How does recall work, and who sees it?”

**Interviewer:** “Recall: how does a query become retrieved memory, who is allowed to see it, why is there no similarity floor yet, and what did you measure?”

**Answer**

**Say it in 60 seconds.**

> Recall starts from the bare goal and the run's own open defects, never from text a memory already added, so memory cannot compound on itself. I embed several probes, search both named vectors, fuse by reciprocal rank and, when the recall revises a judged answer, screen out what that answer already knows from lineage on the payload. A curator pipeline keeps at most eight and says what each serves; only the coach's producer reads them, so grades stay auditable. There is no similarity floor because I measured the store's geometry but have not yet recorded whether a dropped candidate would have helped, and a floor tuned to the briefs on disk is the fitting the engine forbids. With five pairs the effect on grades is +0.5 against about 9 points of noise, so my honest claim is reliability, scoping and isolation, not a grade lift yet.

**If they dig deeper.**

**From goal to candidates.** A recall starts from the bare goal, never from one that already carries remembered text, so memory cannot compound on itself. The query is several texts, not one: the head of the goal (up to 8,000 bytes), focus lines built from the run's own open defects (at most five findings and three criteria, read by position from the trace), and up to six probe conditions a model derives from the goal in the shape of a stored condition. Each text is embedded through the cache and searched against both named vectors, so a probe can match a lesson's trigger or its content. The lists are fused by reciprocal rank (k = 60), deduplicated by content hash (so twins from different runs take one slot), and cut to 16 candidates. When the recall starts from a judged iteration (a coach revising a graded design), a novelty screen over a pool three times the budget drops what the run already knows: chunks from its own chain of iterations, copies from sibling runs of the same goal, and evidence the run has already judged, all read from lineage on the payload, never from text. A recall over the goal alone is not screened.

**Curation, by a pipeline.** The 16 go to `memory-recall`, a quality-loop run whose producer is a curator: it keeps at most eight, says what each kept chunk serves, and names the gaps the store could not meet. Its own critics and evaluators judge that pack, and the engine's admission rule decides whether the pack is used at all. The pack is read back through the Index by position (`m1`, `m2`, ...), so a kept line is always a real point.

**Who sees it.** One reader. The decision is recorded in `docs/pipelines/memory-runs.md` §15 (dated 2026-10-01 in the session note coach-recall-decision): lessons go to a coach's producer and to nothing else. The briefing is appended as `# Lessons from earlier runs (advisory)` in the producer stage only; the deriver, critics and evaluators judge the bare brief, and a grade (a user's submit) never recalls. The reason is the auditability of grades: a lesson that reached a critic could move a score the author is meant to trust. The orchestrator path that chains recall into a digest cycle injects `## Remembered evidence (advisory)` into the goal within a byte budget, and the digest step strips it before judging. Unit-bound memories are excluded by the store's filter unless the search names their unit, so scoping is not a model's courtesy.

```text
bare goal ──┬─> goal head (8,000 B)        ─┐
            ├─> focus: ≤5 findings and      ├─> embed (cache) ─> search
            │   ≤3 criteria, from the trace │    both named vectors
            └─> ≤6 derived probe conditions ─┘
                              │
                              v
        RRF fusion (k = 60) ─> dedupe by content hash ─> 16
                              │
        novelty screen (only from a judged base; pool x3):
          own chain, sibling copies, judged evidence
                              │
        memory-recall run: curator keeps ≤8, names serves and gaps
                              │  admission (declared bar)
                              v
        coach's producer only: "# Lessons from earlier runs (advisory)"
        judges read the bare brief; a submit never recalls

form path: filter kinds + unitKey ─> evidence (no model)
           ─> field-answer pipeline ─> declared routing per field
```

**Why no floor yet.** The store's own geometry was measured on 386 points (2026-10-02, `docs/quality-loop/memory-digest-and-recall.md` §3.4): random pairs of condition vectors average 0.308 cosine, p95 0.457, p99 0.532, and a chunk's condition sits 0.534 from its own lesson, which is why the two are separate vectors. Good probes hit 0.55 to 0.65; the whole-prompt probe scores inside the noise band (best 0.395). So a floor is derivable: below the random-pair p99 a candidate is indistinguishable from noise. It is not set because the sweep that would set it was run first (`retrieval-report`, which runs probes and search with no pipeline): on one recorded brief a p95 floor would have kept 10 of 16 candidates and a p99 floor 3; on another, none (§8.3). The curator already drops about 60% of what it reads, and rank predicts its verdict (41% of the top four kept as usable against 17% of the bottom four), but nothing yet records whether a dropped candidate would have helped the next iteration. Until a per-chunk usage row exists (retrieved, kept, usable, briefed, defect resolved), a floor would be a number tuned to the briefs on disk, which is the fitting the engine forbids. The agentic runtime's semantic route makes the same choice for the same reason: a declared weighted rank and no universal threshold.

**What I measured.**

- Reliability of the seam (2026-10-03, five paired control runs): 20 of 20 revise iterations produced a design, 16 of 16 refused attempts recovered on the next try, and 0 of 316 model calls were lost (session measurement note recall-controls-result; the 20 of 20 is repeated in the working tree's `docs/features-summary.md`).
- Effect on grades: 15 memory runs averaged 63.5 against 63.6 for ten similar runs just before them (2026-09-23, `docs/pipelines/memory-runs.md` §14); in 5 paired coach runs with and without lessons the difference was +0.5 points, give or take 9, with a paired sd of 7.4 against about 8.8 points of judge noise between identical prompts, so about 30 pairs would be needed to see a 4-point effect and five could only ever have found a noise-sized one (2026-10-03, session measurement note recall-controls-result). The honest reading is "not measurably, yet".
- Run-level effectiveness (`GET /memory/effectiveness`, 2026-10-03): of five coach runs that recalled, two resolved three quarters of the defects their recall searched for, one resolved none of eight, and two were never judged again (session measurement note quality-loop-knowledge-lane).
- Unit-scoped recall (2026-10-14): before unit keys, over 15 questions about the organisation one application was for, answers given in other applications held 29 of the 45 evidence slots (`packages/quality-loop/src/orchestrators/memory/ports.ts`; `docs/study-guides/memory-applications-experience.md` §6). After commit `dcb2fc71`, employer questions at unseen companies recalled the standing answer in 15 of 15, with or without the unit named.
- Isolation on the agentic runtime (2026-10-28, offline replay of 577 fields over 182 recorded pages): 0 items recalled under another unit, 0 from another tenant (`docs/agentic-system/job-assistant-verification-2026-10-28.md`).

**[VERIFY]** The 20 of 20, 16 of 16, 316-call, +0.5 give or take 9, sd 7.4, 8.8-point and 30-pair figures come from the session measurement note recall-controls-result (2026-10-03), the "15 of 15" from form-answering-round (2026-10-14) and the effectiveness readout from quality-loop-knowledge-lane (2026-10-03). `docs/features-summary.md`, which repeats 20 of 20, +0.5 and the 30 pairs, is uncommitted at HEAD `9cd3c978`, so a clone of the repository will not hold it; commit it before the interview or quote the note. Tracked docs hold 63.5 against 63.6 (`docs/pipelines/memory-runs.md` §14), the before figure 29 of 45 (`docs/study-guides/memory-applications-experience.md` §6) and the 2026-10-28 replay (`docs/agentic-system/job-assistant-verification-2026-10-28.md`).

Where it lives: `packages/quality-loop/src/orchestrators/memory/recall/` (`recall-memory.ts`, `query.ts`, `fusion.ts`, `novelty.ts`, `focus.ts`, `read-pack.ts`, `inject.ts`), `packages/quality-loop/src/pipelines/memory-recall/`, `packages/quality-loop/src/modules/memory/query-probes/`, `packages/quality-loop/src/modules/runs/recall/run-recall.ts`, `packages/quality-loop/src/core/stages/prompting.ts`, `packages/quality-loop/src/orchestrators/form-memory/`, `packages/quality-loop/src/modules/memory/reports/`, `packages/agentic-memory/src/recall/`

---

#### Q5. “Admission, duplicates, retraction and unit scoping”

**Interviewer:** “Admission and de-duplication: how do you stop the store from freezing or filling with duplicates, how do you retract a wrong fact, and how do you keep one unit's facts from leaking into another?”

**Answer**

**Say it in 60 seconds.**

> I admit per memory, not per run: I read the digest's verdict as data and drop only the memories a confirmed withholding finding names, because a run-level gate once froze my store at six points. I never merge at write time; a re-write of the same memory is idempotent by point id, a twin from another run collapses at read by content hash, and reinforcement is a judged support row rather than a cosine rule. Every writer I ship declares the kinds it owns and replaces only those, so written is always a subset of owned and no writer can erase a neighbour. I retract by run or by point and fix the source, because a re-ingest would otherwise restate the fact. Unit facts carry a normalised unit key, and my store's filter, never a model, keeps them out of every other unit's search.

**If they dig deeper.**

**Freezing.** The store did freeze once: until 2026-09-07 it held 6 points from one run, because admission was run-level and one gated finding at a digest scoring 92.6 then 94.0 discarded all eight memories, faulted or not. The fix made admission per item: a run is drawn on when accepted, or when `artifactPresent`, `validatorsPassed` and `evidenceSufficient` hold and `overall` meets the bar (`policyAllowed` is not required, since any open blocker sets it false), and only the memories a confirmed withholding finding names are excluded. A second cause, cited aliases listed as locations chaining unrelated findings into one group, dropped admission from about 59% to 42% over 50 digests; the fix stayed in the pipeline folder (one memory per finding; citations are content, not locations) and a digest scoring 95 that had stored 1 of 8 then kept 5 of 8 (`docs/pipelines/memory-runs.md` §12.6). A high score beside `kept: 0` is a read-only store, and the store step's recorded reason says so.

**Duplicates.** A re-write of the same (source run, ref) is idempotent, since the point id is a digest of both; a twin stored by another run is a second point the read side collapses by content hash; nothing merges at write time. Near-twins were measured before any rule was written: at 386 chunks seven lesson pairs passed 0.80 cosine and two 0.90, none at 145 (2026-10-02, `docs/quality-loop/memory-digest-and-recall.md` §3.4). Reinforcement is by judgement, not cosine: a knowledge digest item that confirms a stored item is marked not storable and adds a support row, unique per point and source run. Duplicate findings withhold `none`: a dropped bystander is lost for good, a stored twin costs one of sixteen fused slots.

**Written ⊆ owned.** Two writers share a source run's namespace, the memory orchestrator's lessons and the knowledge orchestrator's items and findings; the document digest writes under its own digest run. All three replace through one step that deletes before it upserts, scoped to (run, owned kinds): a non-empty tuple the writer declares of every kind it may ever write, never what one run wrote, with a memory of a stray kind filed under the first owned kind and counted as retyped. The type holds the invariant.

**Retraction.** `DELETE /memory/:id` retracts every point a digest run stored, the run being the unit of retraction; `DELETE /memory/:id/points/:ref` removes one fact and returns the text that went. A document re-ingest is make-before-break: old digests go only once every chunk of the new plan is stored. The agentic runtime deletes nothing: `invalidate` closes the record with a reason, keeps its history and removes its point (the 2026-10-28 replay found 20 invalidated records never recalled again). A deletion is a point gone, not a rule, so the wrong fact is also corrected at its source, or the next re-ingest restates it.

**Unit scoping.** A document declares the scope of every memory it states, `subject` or `unit`; a unit-bound memory carries a normalised unit key (NFKC, lower-cased, sorted `name=key` lines), and the store's filter, not a model, excludes every unit-bound memory whose key is not the search's; a search naming no unit reads none of them. In the agentic tier the unit is the policy's fourth scope key, the browser adapter stores the sha256 of the unit key, and visibility by containment means a request naming no unit never reads a unit's memory.

**[VERIFY]** The first freeze (6 points, 92.6 and 94.0; note quality-loop-memory-frozen, 2026-09-09), the admission counts since (over ten experience digests, 79 memories proposed, 27 withheld under the every-ref default and 20 under a trial table, the shipped table unmeasured on that sample; note quality-loop-knowledge-lane, 2026-10-03) and the five-variant history of the replace-scope invariant (note chunk-kind-replace-scope-invariant, 2026-10-03) come from session measurement notes, not from a repository doc; `docs/pipelines/memory-runs.md` §12.6 records the second cause and its fix.

Where it lives: `packages/quality-loop/src/core/outputs/run-outputs.ts`, `packages/quality-loop/src/orchestrators/memory/digest/read-digest.ts`, `packages/quality-loop/src/orchestrators/memory/store/chunks.ts` (`OwnedKinds`), `packages/quality-loop/src/orchestrators/memory/ports.ts` (`replaceRunChunks`), `packages/quality-loop/src/modules/memory/qdrant/qdrant-memory-store.ts`, `packages/quality-loop/src/modules/memory/memory.controller.ts`, `packages/quality-loop/src/modules/memory/persistence/mikro-orm-memory-support.ts`, `packages/contracts/src/lib/units/scope.ts`, `packages/contracts/src/lib/units/identity.ts`, `packages/memory-ingest/src/core/ingest.ts`, `packages/memory-ingest/src/core/retract.ts`, `packages/agentic-memory/src/write/write.ts`, `packages/browser-session/src/adapters/memory-loop/binding.ts`

---

#### Q6. “The agentic-memory runtime and the job assistant's migration”

**Interviewer:** “The agentic-memory runtime: spaces by name, kinds, lifecycle, the BrainPort adapter — why a separate runtime from the quality-loop memory module, and how did you migrate the job assistant onto it?”

**Answer**

**Say it in 60 seconds.**

> The loop's memory module remembers the loop's own runs; an agent needs memory as a product, with registers, a lifecycle, tenancy and recall by key and time as well as meaning, so I built that as a separate runtime over ports and used the loop only to judge. A space is a strategy compiled under a policy and bound by name; kinds are declared behaviors, and since the 2026-10-30 migration the database holds no list of them. Postgres is the truth and the vector index a projection a sweep can rebuild. The browser session talks to a six-verb BrainPort, so the job assistant moved by adding an adapter behind it, verifying offline on a throwaway tenant with zero leaks, and flipping one config word. The rollback is that word back, and the old path still exists at HEAD until I delete it.

**If they dig deeper.**

**Why separate.** The loop's memory module remembers the loop's own runs: lessons keyed by run, written by orchestrators, read by a curator, one collection, one owner. An agent needs memory as a product: declared registers of different kinds, a lifecycle (versions, invalidation, expiry, consolidation), tenancy, idempotent writes, and recall by key and by time as well as by meaning. None of that is a judging concern, and putting it in the engine would fit the core to one use case. So `agentic-memory` is a pure core over ports (record store, vector index, embedder, clock) hosted by `agentic-system` at `/spaces`, and the loop only judges: `memory-architecture` designs a strategy, `register-digest` judges a text into memories, the host applies a digest once through a ledger. No model on the loop is shown the space: its id, scope and provenance travel in the goal's fenced index, which the loop strips before any prompt and the host reads back when it applies the digest.

**Spaces by name, kinds as data.** A strategy (registers, interfaces, workflows) compiles under a policy snapshot into a space with a compile report of problems and warnings, bound to a name with `PUT /spaces/by-name/:name` (the job assistant's is `job-assistant`). A register's kind is a declared behavior: candidate schema, identity fields, exact keys, valid-time field, text template, projection, consolidation role. Five kinds today (`working`, `semantic`, `episodic`, `procedural`, `relational`); since the 2026-10-30 migration the database holds no list of them, so a new kind is one declaration, never a migration.

**Lifecycle.** Remember reconciles by identity or content hash into inserted, unchanged or superseded in one transaction and refuses a lost race as `conflict`; update and invalidate close with a reason and keep history; recall runs exact, semantic and temporal routes under one declared ranking formula; consolidate promotes evidence into lessons and playbooks at support 3; a sweep every 60 s expires, unprojects and projects 100 records a page; refusals are a table, one HTTP status per code.

**The BrainPort adapter.** `browser-session` depends on a `BrainPort` with six verbs (bind, derive a rubric, plan a step, answer fields, suggest answers, teach). Two adapters implement it, `loop` (the loop's form and document memory orchestrators) and `memory` (`agentic-memory-client` over HTTP, 15 s timeout, a lost read asked again and a lost write never), chosen by one word in `config/engine.json`. The memory adapter binds the tenant partition and the `unit` key, recalls up to 24 evidence items (10 for a textarea, 3 otherwise) before the loop's judge sees the page, and teaches an operator's answer as a deterministic fact keyed by `asked.<sha256(question)>`.

```text
browser-session ─ BrainPort ─┬─> loop adapter ─> quality-loop runs
                             │   (form-memory, document-memory)
                             └─> memory adapter ─> agentic-memory-client
                                 HTTP, 15 s timeout, writes never resent
                                                │
                                                v
                 agentic-system /spaces ─────> agentic-memory runtime
                   digests ledger (apply once)   Postgres = truth
                           ^                     Qdrant   = projection
                           │
                 quality-loop judges on request:
                 memory-architecture, register-digest
```

**How I migrated the job assistant.** In steps, each measured before the next.

1. Runtime and host landed 2026-10-17; the job assistant's strategy was hand-written, judged once by the loop (56.7, revise; `docs/agentic-system/strategies/job-assistant/README.md`), compiled clean and bound by name on 2026-10-28 UTC (`docs/agentic-system/job-assistant-verification-2026-10-28.md`).
2. The `memory` adapter, a general client and a `space` sink for `memory-ingest` were built behind the port with the shipped brain still `loop`, then verified offline on a throwaway tenant (2026-10-28, the same doc): 96 recorded operator answers taught and all 96 unchanged on a second pass; 577 fields replayed over 182 recorded pages with 0 unit and 0 tenant leaks; 163 fields filled on 36 judged pages against the recorded 109.
3. One commit landed it (`462ff24d`, 2026-10-30 UTC); the brain flipped to `memory` the next day (`7d3f12b7`, 2026-10-31 UTC), and the rollback is the one word back. The last step, deleting the loop's own form and document memory paths, has not landed at HEAD: both orchestrators still exist beside the new adapter.

**[VERIFY]** The runtime's 15 of 15 live checks (2026-10-17) are recorded in the working tree's `docs/agentic-system/overview.md`, uncommitted at HEAD `9cd3c978`, and that page itself says the check scripts are not in the repository; the 163-memory count of the verification tenant is also in the tracked `docs/agentic-system/job-assistant-verification-2026-10-28.md`. The live tenant's seeding and the first sessions on the memory brain are in session notes only (2026-10-30 to 2026-11-01: 132 answers and 567 legacy facts carried over; the 2026-11-01 acceptance run `72969c97` on the memory brain was stopped by the supervising session at step 11, before a guessed availability answer was submitted; nothing in the repository records it). Confirm the current live status before quoting it.

Where it lives: `packages/agentic-memory/src/` (`space/`, `kinds/`, `write/`, `recall/`, `lifecycle/`, `adapters/`), `packages/agentic-system/src/memory/` (`spaces.service.ts`, `digests/digests.service.ts`), `packages/agentic-system/config/memory/standard.json`, `packages/quality-loop/src/core/stages/prompting.ts` (the index strip), `packages/agentic-memory-client/src/http-memory-client.ts`, `packages/browser-session/src/core/ports/brain.ts`, `packages/browser-session/src/adapters/loop-http/`, `packages/browser-session/src/adapters/memory-loop/` (`memory-loop-brain.ts`, `field-recall.ts`, `teach.ts`), `packages/browser-session/config/engine.json`, `packages/browser-session/config/brain/memory.json`, `packages/memory-ingest/src/adapters/space-http/`, `packages/db/src/migrations/Migration20261030090001_memory_record_open_kinds.ts`, `docs/agentic-system/memory-runtime.md`

---

#### Follow-up: “What is the consistency model of the memory store?”

**Interviewer:** “What is the consistency model of the memory store?”

**Answer**

**Say it in 60 seconds.**

> I give two answers because there are two tiers, but one principle holds across both: Postgres is the truth, Qdrant is derived from it, and nothing is served that Postgres would contradict. In the loop tier the unit of write is one digest run: the replace step deletes the run's points of the kinds the writer owns and then upserts, both waited on, so the caller gets read-your-writes; the two calls are not one transaction, so a concurrent reader can see that run's lessons absent for a moment, which I accept for advisory memory because point ids are deterministic and the same write replayed converges. Every store step is recorded in the orchestration ledger as complete with counts, skipped with a reason or failed with the error, so a lost write is visible and never silent. In the agentic tier records are strongly consistent: one Postgres transaction closes the superseded version by compare-and-set and inserts the new one, and a lost race is refused as a conflict; the vector index is eventually consistent, projected at once when it can be and otherwise retried by the sweep. Reads repair: a semantic hit is served only after Postgres confirms the record is still current, unexpired and visible to the request, while exact and temporal recall read Postgres only and are never behind.

**If they dig deeper.**

Two tiers, two answers, one principle: Postgres is the truth, Qdrant is derived, and nothing is served that Postgres would contradict.

Loop tier (lessons and document facts):

- The unit of write is one digest run. The replace step deletes the run's points of the kinds the writer owns, then upserts, both with `wait: true`, so when the step returns its points are visible to the next search: read-your-writes for the caller.
- The two calls are not one transaction. A concurrent reader can see a run's lessons absent between the delete and the upsert. Nothing else is affected, point ids are deterministic, and the same write replayed converges, so the window is acceptable for advisory memory and is the price of having no second copy to reconcile.
- A re-write of the same (source run, ref) is idempotent by point id; a twin stored by another run is a second point that reads collapse by content hash; reinforcement is rows in Postgres with the payload count as a cache; and the orchestration ledger records each `store` step as `complete` with counts, `skipped` with a reason or `failed` with the error, so a lost write is visible, never silent.
- Lesson points of memory-orchestrator runs are rebuildable from the digest trace with no model call (`POST /memory/:id/reindex`); document and knowledge points have no re-index route today and are rebuilt by re-ingest or re-digest, a model call, so Qdrant is a pure cache of Postgres only for the lesson tier.

Agentic tier (spaces):

- Records are strongly consistent: one Postgres transaction commits the compare-and-set close of the superseded version and the insert of the new one; a lost race is re-resolved once against what won, then refused as `conflict`; partial unique indexes keep one current record per (space, register, scope, identity).
- The vector index is eventually consistent: a write projects at once if it can; a failed projection leaves the record unmarked for the sweep (every 60 s) to retry; closed records are unprojected best-effort.
- Reads repair: a semantic hit is served only after Postgres confirms the record is still current, unexpired and visible to the request; a stale point is dropped and counted. Exact and temporal recall read Postgres only, so they are never behind.
- A digest is applied once through a ledger written after its writes; a re-apply would meet records that already say the same and answer `unchanged`, so a crash between the writes and the ledger row cannot double-write.

Where it lives: `packages/quality-loop/src/modules/memory/qdrant/qdrant-memory-store.ts`, `packages/quality-loop/src/orchestrators/memory/store/index-memories.ts`, `packages/quality-loop/src/modules/memory/memory.service.ts` (the reindex route), `packages/agentic-memory/src/write/write.ts`, `packages/agentic-memory/src/write/projection.ts`, `packages/agentic-memory/src/adapters/mikro-orm/mikro-orm-record-store.ts`, `packages/agentic-system/src/memory/digests/`

---

#### Follow-up: “Qdrant is down in the middle of a digest. What happens?”

**Interviewer:** “Qdrant is down in the middle of a digest. What happens?”

**Answer**

**Say it in 60 seconds.**

> My design principle is that the store's absence never costs model work and never blocks the target. The orchestration snapshots the store's availability once at the start: if Qdrant is already down, recall is skipped as store-unavailable and the target runs anyway, the digest still runs when embeddings are enabled, and the store step skips with the same reason, so the digest's trace is in Postgres and nothing is lost; a memory-orchestrator run is re-indexed later from that trace by re-embedding, and a document or knowledge digest is rebuilt by re-ingest or re-digest. If Qdrant dies during the write, the step catches the client error and ends failed with the reason and the error text in the ledger; because replace is delete-then-upsert, the worst case is that this one run's points of the kinds it owns are absent until the re-index, and no other run's points are touched. A document ingest is safe by construction: a chunk is recorded as covered only by a digest that stored, and make-before-break retracts the previous digests only after every chunk of the new plan is stored, so an outage leaves the old facts standing rather than a half-replaced document. In the agentic tier the memories still commit to Postgres, the write answers projected false, the sweep retries every 60 seconds a page at a time, and recall by key and by time keep working while recall by meaning reports index_failed as its reason. What does not happen is a retry storm, a silent success, or a model call repeated to recover a store write.

**If they dig deeper.**

Walk the memory orchestrator's four steps; the design principle is that the store's absence never costs model work and never blocks the target.

- At start, the orchestration snapshots the store's availability once into its context. If Qdrant is already down, recall is skipped as `store-unavailable` and the target runs anyway; recall never blocks the target. The digest still runs if embeddings are enabled, and the store step skips with the same reason and the store's note. The digest run's trace is in Postgres, so nothing is lost: for a memory-orchestrator run, `POST /memory/:id/reindex` later re-embeds the endorsed lessons from that trace; a document or knowledge digest is rebuilt by re-ingest or re-digest.
- If Qdrant dies during the write, the write step catches the client error (a 5 s timeout in `qdrant-kit`) and ends `failed` with reason `store-unavailable` and the error text in the ledger. Because replace is delete-then-upsert, the worst case is that this run's points of the owned kinds are absent until the re-index; no other run's points are touched.
- At the store level the availability check never throws: it reports `ready: false` with reason `unreachable` and marks the collection un-ensured, so the next call re-ensures the collection and its payload indexes; boot logs the warning instead of failing.
- A document ingest is safe by construction: `memory-ingest` records a chunk as covered only by a digest that stored (or legitimately endorsed nothing), and make-before-break retracts the previous digests only after every chunk of the new plan is stored, so an outage leaves the old facts standing rather than a half-replaced document.
- In the agentic tier the digest's memories still commit to Postgres; the projection reports `index_failed`, the write answers `projected: false`, and the sweep retries every 60 s a page at a time, ending a step that makes no progress rather than looping. Recall by key and by time keeps working; recall by meaning reports `index_failed` as its reason.

What does not happen: no retry storm (one timed attempt per write, the sweep paces the rest), no silent success (every step records its reason), and no model call repeated to recover a store write (re-index re-embeds, it never re-digests).

Where it lives: `packages/quality-loop/src/orchestrators/memory/steps.ts`, `packages/quality-loop/src/orchestrators/memory/definition.ts`, `packages/quality-loop/src/orchestrators/memory/store/index-memories.ts`, `packages/quality-loop/src/modules/memory/qdrant/qdrant-memory-store.ts` (`verify`), `packages/quality-loop/src/modules/memory/memory.service.ts` (`onModuleInit`), `packages/qdrant-kit/src/qdrant.ts`, `packages/memory-ingest/src/core/ingest.ts`, `packages/agentic-memory/src/lifecycle/sweep.ts`

---

#### Follow-up: “How do you re-index safely?”

**Interviewer:** “How do you re-index safely?”

**Answer**

**Say it in 60 seconds.**

> I have six rules, each with a reason in the repository's history. First, a re-index is a re-embed and never a re-digest: I rebuild a lesson run's points from its stored digest trace under today's admission rule, because a replay that asked a model again could answer differently, and since replace deletes before it writes, it would destroy what it meant to migrate. Second, I replace only what I own: the delete is scoped to the run and the kinds the writer owns, so a lessons re-index cannot erase the knowledge orchestrator's items under the same run. Third, a model or width change is a new collection, never an in-place rewrite; the name carries the generation, model and dimensions, the old collection stays readable, and in the agentic tier the sweep backfills the new one from Postgres a page at a time. Fourth, payload indexes are ensured on every boot and not only on create, because I found a store that would never have indexed a facet declared after the collection already held the corpus. Fifth, documents re-ingest make-before-break under a manifest and a lock, and sixth, I know what a re-index resurrects: a one-fact retraction is a point deletion, so I correct the source as well, or the next re-ingest restates the fact.

**If they dig deeper.**

Six rules, each with a reason in the repository's history.

1. Re-index is re-embed, never re-digest. `POST /memory/:id/reindex` re-embeds a memory-orchestrator run's lessons from its stored digest trace: it applies today's admission rule, embeds the same texts (the cache makes most of that free) and replaces the run's points, stamping each with lineage as the source run reads today. Document and knowledge digests have no such route; they are rebuilt by re-ingest or re-digest. A replay that asked a model again could answer differently, and since replace deletes before it writes, it would destroy what it meant to migrate.
2. Replace only what you own: the delete is scoped to (run, owned kinds), so a lessons re-index cannot erase the knowledge orchestrator's items under the same run.
3. A model or width change is a new collection, never an in-place rewrite: the name carries the index generation, model and dimensions (`quality-memory__v2__<model>__<dims>`), the old collection stays readable, and the new one is filled per run. In the agentic tier the sweep backfills the new collection from Postgres a page at a time; until it finishes, recall by meaning has a gap and recall by key and time do not.
4. Ensure payload indexes on every boot, not only on create. Found in the code on 2026-10-03 and then verified live: the store created payload indexes only when it created the collection, so a facet declared later would never have been indexed on the collection that already held the corpus (444 chunks at the time) and a filter on it would have run unindexed; indexes are now ensured on every boot (session measurement note quality-loop-knowledge-lane, 2026-10-03).
5. Documents re-ingest make-before-break under a manifest and a lock: unchanged chunks (identity = sha256 of the rendered goal) are skipped, `--force` re-posts and then replaces, and the previous digests are retracted only once the new plan is fully stored.
6. Know what a re-index resurrects. A one-fact retraction is a point deletion; a re-index of a lesson run or a re-ingest of a document's source restates the fact if the source still says it. That is why the 2026-10-14 record rebuild corrected the source files, kept a backup of the points with vectors, and retracted stale taught runs as data rather than patching the digest. In the agentic tier a retraction is state: an invalidated record is closed, survives any re-projection, and is never served.

**[VERIFY]** The 444-chunk collection size behind rule 4 (quality-loop-knowledge-lane, 2026-10-03), the 2026-10-14 backup location (`static/memory-ingest/backup-2026-10-14/`) and the retraction counts (one wrong résumé fact, 54 old points retired, 2 taught runs and 32 single facts; form-answering-round) come from session notes, not from a repository doc.

Where it lives: `packages/quality-loop/src/modules/memory/memory.service.ts`, `packages/quality-loop/src/orchestrators/memory/store/index-memories.ts`, `packages/quality-loop/src/modules/memory/qdrant/collection.ts`, `packages/quality-loop/src/modules/memory/qdrant/qdrant-memory-store.ts`, `packages/memory-ingest/src/core/ingest.ts`, `packages/memory-ingest/src/core/status.ts`, `packages/agentic-memory/src/lifecycle/sweep.ts`, `packages/agentic-memory/src/adapters/qdrant/collection.ts`

---

### 21. Platform, delivery, security and observability

This area is the ground under the loop and the memory: how the 35 packages are cut, which eight services listen on which ports, where the two stores are, what refuses a bad change before it lands, how the model is reached and secrets are kept, and what you can see when a run misbehaves. A Lead interviewer probes it because "emphasizing reliability and extensibility" is a platform claim: they want to hear what a gate enforces versus what habit enforces, and they respect a candidate who says plainly what is not there (no APM, no cloud-hosted service, a GitHub `main` that stopped on 3 Sep 2026). Every figure below is dated; code facts are from the working tree at HEAD `9cd3c978` (2026-10-31), read on 2026-11-02.

#### Q1. “Draw the deployment topology.”

**Interviewer:** “Draw the deployment topology: packages, services and ports, data stores, how it runs locally and in CI.”

**Answer**

**Say it in 60 seconds.**

> “One monorepo, one engine in the middle. Eight Nest services on 3000 and 3003 to 3009, three Next clients on 4200 to 4202, Postgres and Qdrant in compose. The same two containers serve `pnpm stack:up` and `tilt up`, so either launcher shows the same runs. CI rebuilds the stack from service containers on a disposable test database. Nothing is in the cloud yet except the static site, and I would rather say that before you ask.”

**If they dig deeper.**

One pnpm + Nx monorepo of 35 packages (counted 2026-11-02; docs/features-summary.md — a local summary page of 28 Oct 2026 not yet committed, cited below as "features-summary" — says 35 in its header and By-the-numbers table, though its foundation bullet says 33): 18 shared libraries in seven groups — the wire types and vocabularies (`contracts`); the database (`db`: 40 MikroORM entities, 89 hand-written migrations); the LLM, Nest, config, Qdrant and Google kits; the engine's companions (`criteria`, `run-dump`, `tool-session` and the `agentic-memory` runtime); three HTTP clients; two UI libraries; two test-support libraries — eight NestJS services, two CLIs (`browser-session`, `memory-ingest`), three Next.js clients, the Astro marketing site, and three test/catalog projects. The quality loop is the hub: studio-api, govcon, agentic-system, gmail, google-calendar and both CLIs reach it over HTTP; notifications and job-application never call it (they carry events and the applied-to record); no service reads another's tables.

```text
CLIENTS (Next.js dev servers, local processes, never pods)
  studio-ui :4200   quality-loop-ui :4201 (/inspect)   govcon-ui :4202
────────────────────────────────────────────────────────────────────
SERVICES (NestJS; 8 pods under Tilt, or `nx serve` processes)
  studio-api :3000/api ─────────┐
  govcon :3004 ─────────────────┤  quality-loop :3003
  browser-session (CLI, Chrome) ┼► 16 pipelines · 9 orchestrators
  agentic-system :3007 /spaces ─┤  POST /runs → 202 → poll GET /runs/:id
  gmail :3008 · calendar :3009 ─┘  dumps → static/runs (2Gi PVC in k8s)
  notifications :3005  event bus (pull/ack) + 5 Telegram bots
     ▲ publishers: browser-session, govcon, agentic-system, gmail, cal.
     └─► subscriber: job-application :3006 (the applied-to record)
────────────────────────────────────────────────────────────────────
STORES (docker compose, named volumes, shared by both launchers)
  Postgres 16 :5433 — 40 entities, 89 migrations   Qdrant v1.19.1 :6333
```

Locally there is one stack with two launchers. `pnpm stack:up` starts the compose stores (postgres:16-alpine on host port 5433, qdrant/qdrant:v1.19.1 on 127.0.0.1:6333, named volumes), migrates, seeds, and runs studio-api, quality-loop and studio-ui as watch processes. `tilt up` brings the same compose stores up, then runs eight pods from one parametrized Dockerfile (node:24-alpine, built from a bare checkout, never from a host `dist/`), each a ClusterIP Service reached through Tilt's port-forward, with Secrets built from the shell or the gitignored `.env`; the clients stay local dev servers; `tilt down` keeps the stores and the loop's 2Gi dumps volume. Pods find the stores through one ConfigMap (`local-stores`: `DB_HOST` and `QDRANT_URL` on `host.docker.internal`); every other Postgres connection value is a code default declared once in `packages/db/src/connection.ts`, and the Qdrant URL default once in `packages/qdrant-kit/src/qdrant.ts`.

In CI (GitHub Actions) the `verify` job reproduces the stack with service containers (postgres:16-alpine on 5432, qdrant v1.19.1 on 6333) on `DB_NAME=sysdesign_test`, and `images` docker-builds five of the eight services from a bare checkout. Not there: this repository declares nothing on AWS — no SDK, CDK, Terraform or serverless manifest — and no service is deployed to any cloud (docs/issues/platform-and-hygiene.md, PLAT-2, open); the one remote deployment is enfav.com, an assets-only Cloudflare Worker (live since 14 Oct 2026; features-summary, uncommitted). The résumé's AWS line sits in the current Enfav entry (docs/ingestion/Resume_2026_c.pdf, a local file the repository does not track), so name where that AWS work lives — it is not in this repository **[VERIFY]**.

Where it lives: `Tiltfile`, `tilt/`, `docker-compose.yml`, `scripts/stack.sh`, `docker/nest-app.Dockerfile`, `packages/*/k8s/local/deployment.yaml`, `.github/workflows/ci.yml`, `packages/db/src/connection.ts`, `packages/qdrant-kit/src/qdrant.ts`, `packages/notifications/src/config.ts`, `packages/job-application/src/config.ts`, `packages/agentic-system/src/config.ts`, `packages/gmail/src/config.ts`, `packages/google-calendar/src/config.ts`, `packages/quality-loop/src/modules/janitor/stale-after.ts`, `docs/issues/platform-and-hygiene.md`

---

#### Q2. “CI/CD: what gates a change?”

**Interviewer:** “CI/CD: what gates a change?”

**Answer**

**Say it in 60 seconds.**

> “I made everything that can be a mechanical rule a spec that fails the build: file size, inert exports, every bound declared once and sized from measured runs, no clock or environment inside the engine core, tests that can only ever empty a database named as disposable. I let the AI reviewer add findings; the rules and the exit code are code I own.”

**If they dig deeper.**

Two rings. The pre-commit hook (`.githooks/pre-commit`, installed by the `prepare` script setting `core.hooksPath`) runs cheapest first: prettier on fully-staged files, a branding tripwire (`git diff --cached -G` refuses the commit before any token is spent), `nx affected -t lint typecheck`, then a quick AI code review (one readability critic on `claude-haiku-4-5-20251001`, $0.25 cap per call) whose deterministic rules always run — a `high` finding refuses the commit, a budget or timeout stop stands aside. CI's `verify` job repeats the free checks over the whole repository and adds the repo gates (`pnpm test:tooling`, vitest over `tooling/*.spec.ts`), the migration drift check, serial tests on `sysdesign_test`, builds, a Storybook smoke and two Playwright suites; the PR `review` job runs the full profile (three critics on `claude-sonnet-5`, $1.00 cap) and posts one sticky comment; `images` docker-builds five services.

```text
git commit ─► hook: prettier ─► tripwire ─► nx affected lint+typecheck
          ─► review:code --staged (rules + 1 critic; high ⇒ refuse)
push / PR ─► verify: install → migrate → seed → migrate:check → format
          → lint (nx: errors fail) → typecheck (nx) → typecheck tooling
          → lint tooling (--max-warnings=0) → test:tooling (gate specs)
          → nx test --parallel=1 → build + build-storybook
          → storybook smoke → studio-e2e → website-e2e
          ─► images: docker build ×5 apps      ─► review: full profile
```

| Gate                           | What it rejects                                                                                                                                                                                                            | Where                                                                                                                                                                                                            |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Typecheck incl. specs          | a project whose `typecheck` configs miss any `.ts`/`.tsx` under `src` (specs and stories included)                                                                                                                         | `tooling/typecheck-coverage.spec.ts`                                                                                                                                                                             |
| Zero lint warnings             | any ESLint error; a warning in `tooling/` (`--max-warnings=0`); an import against a package's `type:`/`scope:` tags — zero warnings in packages is a convention held at 2026-10-14 (owner's note repo-gates.md), not a cap | `eslint.config.mjs`, `lint:tooling` in `package.json`                                                                                                                                                            |
| 500-line bound                 | a tracked source file over 500 lines (the review warns at 400)                                                                                                                                                             | `tooling/file-size.spec.ts`, `tooling/code-review/rules/file-size.ts`                                                                                                                                            |
| Inert code                     | an exported name whose identifier occurs exactly once in the repository; in five guarded packages, one reached only by specs                                                                                               | `tooling/inert-code.spec.ts`                                                                                                                                                                                     |
| Bound declarations             | a raw `.max()` on a string or list in a schema file; a `bounded.*` wrapped by anything but optional/nullable/nullish/default; an exported `*_BOUND` nothing reads                                                          | `tooling/bound-declarations.spec.ts`                                                                                                                                                                             |
| Measured bounds                | an output cap below 1.2× the most its stage measurably wrote; a field target below the measured p99 or a ceiling not above the measured max                                                                                | `packages/quality-loop/src/core/testing/bounds.ts` (stage caps) and `packages/contracts/src/lib/measured-bounds.ts` (field targets and ceilings), over the `measured.json` fixtures `pnpm measure:bounds` writes |
| Schema drift                   | entities that disagree with the migrated schema                                                                                                                                                                            | `pnpm db:migrate:check` (MikroORM) in `ci.yml`                                                                                                                                                                   |
| Pre-commit review and tripwire | staged content matching the branding pattern; a `high` rule or critic finding                                                                                                                                              | `.githooks/pre-commit`, `tooling/code-review/`                                                                                                                                                                   |
| Deploy gate                    | a website deploy from any ref but `main`, or while the repository variable `WEBSITE_DEPLOYS` is not `on`                                                                                                                   | `.github/workflows/deploy-website.yml`                                                                                                                                                                           |

Delivery: the only deploy is the website's workflow — on `main` only, and only while the repository variable `WEBSITE_DEPLOYS` is `on` — which uploads the verified build with wrangler and then runs the browser suite against production; no service has a deploy workflow (`.github/workflows/` holds `ci.yml` and this one; PLAT-2). Six more `tooling/` specs fail the build the same way; the two worth naming are `quality-loop-guarantees.spec.ts` (no clock, randomness, filesystem or environment read inside `quality-loop/src/core`) and `test-database-guarantees.spec.ts` (only a database named as disposable can ever be emptied).

Migrations are hand-written SQL, one concern per file, applied transactionally all-or-nothing into `mikro_orm_migrations`; `ormOptions` is the one object every DbModule and the migration CLI configure from, so an app and the CLI cannot disagree about a column, and `assertMigrated` refuses a database behind the checkout (the browser session checks it before opening Chrome). Honest caveat: GitHub's `main` stopped at 2026-09-03 (`origin/main` is `7fe55fb3`; HEAD is 737 commits ahead, measured 2026-11-02), so the GitHub workflow has not run on the recent work — locally the hook and `pnpm test:tooling` are what gate it. Branch-protection rules are GitHub settings, not in the repository **[VERIFY]**.

Where it lives: `.github/workflows/ci.yml`, `.github/workflows/deploy-website.yml`, `.githooks/pre-commit`, `tooling/*.spec.ts`, `tooling/code-review/`, `eslint.config.mjs`, `package.json` (scripts), `packages/db/src/migrator.ts`, `packages/db/src/orm.options.ts`

---

#### Q3. “Security: model access, secrets, tenancy, trust.”

**Interviewer:** “Security: how is model access controlled, where do secrets and config live, how is tenant data scoped, and what is never trusted?”

**Answer**

**Say it in 60 seconds.**

> “One door to the model: the Claude Code subscription, checked at boot before any call, with the API-key variables stripped from every spawned process, so there is no API-key route. Config names files and variables, never keys, so what is committed can select a credential but never hold one. Two stores, two tenancy rules: the memory runtime requires a tenant on every request and shows a record only to a scope that contains its own; the loop's store is scoped by kind, pipeline, run and unit. And I trust nothing a model, a request body, a PR title or a terminal operator says until code has validated or classified it.”

**If they dig deeper.**

The loop reaches Claude only through the Claude Code subscription (`config/engine.json` names `claude-subscription`). The boot preflight asks the Agent SDK for its account (no model call, 30 s timeout) and accepts only `apiProvider: 'firstParty'` with no API-key source and either a machine login or a `CLAUDE_CODE_OAUTH_TOKEN` from `claude setup-token`, or exits 1 naming the fix. `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN` and `CLAUDE_CODE_API_KEY_FILE_DESCRIPTOR` are stripped from every spawned CLI — no Anthropic API-key route — and each call is one tool-less, single-turn spawn (`maxTurns: 1`, `tools: []`, `settingSources: []`) whose per-API-call output ceiling is 32,000 tokens (`CLAUDE_CODE_MAX_OUTPUT_TOKENS`); a longer reply resumes in a further API call, is read whole, and the record counts the calls. A second provider, `openai-compatible`, is chosen by name in `engine.json` and checked at boot by its own readiness test (975 runs on 6–9 Oct 2026 used it; features-summary, uncommitted). The subscription-only rule (owner, 30 Sep 2026; note subscription-only.md) governs how Claude is reached, not which providers exist; there is no model-less grading mode.

```text
config/engine.json ─► "llm": claude-subscription (openai-compatible
                      declared too; chosen by name, never by code)
claude login (Keychain)   or   claude setup-token ─► .env (gitignored)
        │                                   │  tilt/dotenv.Tiltfile
        │                                   ▼
        │                      Secret quality-loop-model ─► pod env
        ▼                                   │
 boot: account preflight ◄──────────────────┘  (no model call, 30 s)
   firstParty ∧ no apiKeySource ∧ (login ∨ OAuth token) ? serve : exit 1
 every call: strip the API-key variables · tools: [] · 1 turn
```

Config and secrets. `config/engine.json` names one file per kind; a name can only select a file inside its kind's folder, and a model file may name the variable that holds a key (`apiKeyVar`) but never a key, so the choice is committable and the credential is not. Five services (notifications, job-application, agentic-system, gmail, google-calendar) declare their environment in one `src/config.ts` table that refuses a malformed value by name; studio-api, quality-loop and govcon read a port at the entry point, the loop its stale threshold in `modules/janitor/stale-after.ts`. Secrets travel only as environment — the gitignored `.env`, the five Kubernetes Secrets Tilt builds from the shell or `.env`, repository secrets in CI — and `.env*` never enters the Docker context.

Tenancy: two stores, two rules. The agentic-memory runtime requires every request to name the partition key (`tenant`) and only declared keys; a record is visible to a request whose scope contains its own (Postgres jsonb containment; the Qdrant filter loops over the policy's keys, so an omitted key hides narrower memories), and an employer's facts sit under `unit: sha256(unitKey)`. The loop's own store has no tenant — its axes are kind, pipeline, run and unit key, enforced in the Qdrant filter. Measured 2026-10-28: 0 unit and 0 tenant leaks over 182 replayed form pages (docs/agentic-system/job-assistant-verification-2026-10-28.md).

Never trusted: model output (enums and ids only; the controller decides); the fenced goal index (validators read it, no model sees it); request bodies (a zod pipe answers one 400 whose `issues` list names every fault by path); PR title and body in CI (env, never interpolated; fork PRs run rules only); operator answers typed at the terminal (`untaught: ['terminal']`; only Telegram answers become the owner's facts); and any database a test names unless it is `sysdesign_test` or a lane of it. Known gap: the Gmail and Calendar endpoints have no login and are safe only on the owner's machine (features-summary, 28 Oct 2026, uncommitted).

Where it lives: `packages/llm/src/claude-account.ts`, `packages/llm/src/claude-turn.ts`, `packages/llm/src/create-client.ts`, `packages/llm/src/openai-compatible-client.ts`, `packages/quality-loop/src/boot.ts`, `config/engine.json`, `config/llm/`, `packages/config-kit/src/engine-config.ts`, `packages/llm/src/llm-config.ts`, `tilt/dotenv.Tiltfile`, `packages/agentic-memory/src/space/scope.ts`, `packages/agentic-memory/src/adapters/qdrant/collection.ts`, `packages/quality-loop/src/modules/memory/qdrant/qdrant-memory-store.ts`, `packages/browser-session/config/operator/terminal-and-notifications.json`, `packages/db/src/testing/test-database.ts`

---

#### Q4. “Observability: what did a run do, and is the loop healthy?”

**Interviewer:** “Observability: how do you see what a run did, and what tells you the loop is healthy?”

**Answer**

**Say it in 60 seconds.**

> “A run is a row plus a folder: the row is written as the run goes, on a queue the loop never awaits, and the folder is the complete record, every prompt and reply included. Liveness is a heartbeat, never a status: a ticker beats independently of model calls, and a janitor fails only what has stopped beating. Health reports the loop's own numbers, so a client judges staleness by the server's threshold rather than a copied constant. There is no APM yet: stdout logs, a health endpoint that probes no store, and a dead run can read as running for about six minutes.”

**If they dig deeper.**

What a run did. Every run is a Postgres row plus a dump folder. The `RunRecorder` writes the row as the run goes — every model exchange summarised as it lands, every finished iteration's standing, the recall it was handed — on one write queue the loop never awaits, so a slow database never stalls a model call. At close it writes `static/runs/<runId>/` — the id `makeRunId` mints already ends in `-quality` (a criteria derivation's in `-criteria`): `manifest.json`, `run.md`, `01-goal.md`, `02-contract.json`, `03-pipeline.json`, `04-iterations/NN/*`, every prompt and reply under `05-llm/`, `06-lessons.json`, `recall.json`; each file goes through a temp name and a rename, one `index.jsonl` row is appended last, and a text field is capped at 1,000,000 bytes with the truncation recorded. `GET /runs/:id/dump` serves the folder read-only; the inspector at `:4201/inspect` steps through a run like a debugger (the newest 30 runs and orchestrations; `?openedBy=<sessionId>` narrows to one browser session's runs), tested live on 1 Oct 2026 with 41 browser checks (features-summary, uncommitted); `main.js replay` re-decides recorded ledgers with no model.

```text
POST /runs ─► row {status: running, heartbeat_at} ─► 202 {runId}
  loop ──sink──► exchange summaries    ──onIteration──► progress rows
  ticker: a beat every 60 s (threshold 180 s / 3, never under 1 s)
  janitor: at boot and every 180 s, fail rows beating before now−180 s
           → status failed, error Interrupted (a late close reclaims)
  close: dump folder (temp → rename, index.jsonl last) → row closed
  readers: GET /runs/:id · GET /runs/:id/dump · :4201/inspect · replay
```

What says it is healthy. Liveness is a heartbeat, never a status. A ticker beats every max(1,000 ms, threshold/3) — 60 s at the default `QUALITY_LOOP_RUN_STALE_AFTER_MS` of 180,000 — independently of model calls, so a ten-minute call costs no beats. The janitor sweeps at boot and every threshold and fails only rows older than it (`error: Interrupted`); a row swept wrongly is reclaimed by its owner's late close; every live write is guarded by `status = 'running'`. `GET /health` answers `{status, llm: {model}, heartbeat: {heartbeatEveryMs, staleAfterMs}}`, so a client (`loop-client`'s `awaitRun`, polling every 3 s) judges a stale run by the loop's own numbers rather than a copied constant. Browser sessions mirror the design (15 s beat, 60 s stale; per-step dumps under `static/sessions` with screenshot, plan, fields, advice). Prompts and alerts reach the phone through the notifications bus and five Telegram bots. Memory has reports: `GET /memory/effectiveness`, `GET /memory/gaps`, and two retrieval reports posted with a goal (`POST /memory/retrieval-report`, `POST /memory/form-retrieval-report`); the controller's one writing route is `POST /memory/:id/reindex`.

Honest gaps: `/health` is unconditional and probes neither Postgres nor Qdrant; logs are Nest stdout only; there is no Datadog, New Relic, OpenTelemetry, metrics endpoint or alerting (PLAT-1, open, high); a dead run can read "running" for close to two thresholds, about six minutes by default (docs/quality-loop/lifecycle-and-hooks.md, as of 2026-10-16).

Where it lives: `packages/quality-loop/src/modules/runs/run-recorder.ts`, `packages/quality-loop/src/modules/janitor/stale-after.ts`, `packages/quality-loop/src/modules/janitor/run-janitor.ts`, `packages/quality-loop/src/modules/app/health.controller.ts`, `packages/run-dump/src/write-dump.ts`, `packages/run-dump/src/run-id.ts`, `packages/quality-loop/src/modules/runs/run-dump.controller.ts`, `packages/loop-client/src/await-run.ts`, `packages/quality-loop-ui/src/features/inspector/`, `packages/quality-loop/src/cli/replay.ts`

---

#### Q5. “A production failure and what you changed.”

**Interviewer:** “Tell me about a production failure and what you changed.”

**Answer**

**Say it in 60 seconds.**

> “The failure I would lead with raised no error: a dropped call made a grader look lenient. The fix was not a retry alone but making a lost sample unable to change what a lens can veto, measured before and after. The other three taught me that a long-lived process holds the environment it was born with, and that a laptop is not a server.”

**If they dig deeper.**

Lead with the one that corrupted grades silently: a lost model sample lowered a grade (measured 2026-10-01; owner's note llm-seam-retry-and-gate.md). The normaliser confirms a defect only when one lens sees it in `minHits` of its own samples — `minHits: 2` in most pipelines — and with no retry anywhere, a lens that lost one of two samples confirmed nothing, and nothing said so. Over 324 runs and 4,136 calls: 2.22% of calls failed, 17% of runs held at least one failure, 32 of 1,292 multi-sample lenses dropped to one sample, and 118 findings across 14 runs were discarded `below-min-hits` for no reason but a lost call. What changed: a bounded retry inside the one structured-call function (3 attempts; failures classified from the SDK's closed vocabularies, never from provider prose), so one lens sample stays one outcome; a process-wide in-flight gate (ceiling 8) whose permit is taken before the call's timer starts, so queue time is never a timeout; and a lens short a sample is held to the samples it has left — it still scores, it can never block.

```text
before: lens ×2 samples ─► one call fails ─► 1 sample < minHits 2
        ─► every defect only it saw discarded "below-min-hits"
        ─► grade rises, nobody told        (118 findings / 14 runs)
after:  retry inside the call (3) ─► gate 8 in flight (queue ≠ timeout)
        ─► a lens short a sample scores on what it has, never vetoes
```

Three more, with the rule each left behind:

- A stale token in a long-lived process (2026-10-20, 20:26:42 UTC; owner's note claude-token-switch.md): replacing `CLAUDE_CODE_OAUTH_TOKEN` in `.env` restarted only the loop's watch child, which inherited the old token from its parent, so runs kept billing the previous account. Rule: a token change restarts the whole serve tree; the live token is proved by a sha256 prefix, never printed.
- The Mac idle-slept under an overnight run (2026-10-15 at 14:33 UTC, about 3.3 h lost; again 2026-10-20, 42 min between sessions on AC; owner's note watch-reliability.md): heartbeats stopped, the janitor failed the run at 180 s, Telegram polls timed out at every wake. Rule: AC power plus `caffeinate -i` for the round; read `pmset -g log` before blaming the software.
- Saving `.env` or any package the loop builds from restarts every watched service and fails runs in flight; it killed the owner's own LinkedIn session on 2026-10-10 (owner's note shared-dev-stack-hazards.md); and the 2026-10-02 test run that emptied the practice database left the test-database name guard behind it (features-summary, uncommitted).

Where it lives: `packages/llm/src/llm-failure.ts`, `packages/llm/src/in-flight-gate.ts`, `packages/llm/src/claude-agent-client.ts`, `packages/quality-loop/src/core/evidence/normalize.ts`, `packages/quality-loop/src/core/loop/waves.ts`, `packages/db/src/testing/test-database.ts`, `tooling/test-database-guarantees.spec.ts`

---

#### Follow-up: “How would you scale this to many tenants and concurrent runs?”

**Interviewer:** “How would you scale this to many tenants and concurrent runs?”

**Answer**

**Say it in 60 seconds.**

> “I would start from what already scales: a run is a row owned by a heartbeat, so a second loop replica can share the run tables today, the controller is a pure function of ledger and policy, every consumer pulls, and the memory runtime is already partitioned by declared scope keys. What blocks, in order of pain: the model door is one subscription account, the in-flight gate is per process, the bus wakes pulls in-process, runs and the loop's own memory store carry no tenant, and Telegram allows one poller per bot token. So the next step is N stateless loop replicas behind a shared admission store, LISTEN/NOTIFY to wake pulls across replicas, a tenant on every run row and every memory point, and per-tenant quotas. A Studio grade has taken 2 to 16 minutes and a browser session runs for hours, so none of it is request-response: it is a worker pool pulling runs, with ECS on Fargate and RDS as the smallest step.”

**If they dig deeper.**

Start from what already scales. A run is a row owned by a heartbeat, so two loop replicas can share the run tables today: the janitor fails a row only once its beat is stale and never sweeps another replica's live run (docs/issues/platform-and-hygiene.md, PLAT-2). The controller is a pure function of ledger and policy, every consumer pulls, and the agentic-memory runtime is already partitioned by declared scope keys with containment visibility.

```text
today: 1 loop process ── gate 8 ── 1 subscription account ── 1 Mac
       1 Postgres, 1 Qdrant, bus wake-up in-process, no tenant on runs
next:  N loop replicas (stateless; heartbeat ownership already holds)
       shared admission (Postgres/Redis) replaces the per-process gate
       LISTEN/NOTIFY wakes bus pulls across replicas
       tenant on quality_run + on every loop-memory point and filter
       per-tenant quotas; dumps to object storage; stores hosted
```

What blocks, in order of pain: (1) the model door is one subscription account — a weekly limit already surfaced as `brain-unavailable … rate_limit: weekly limit` at step 0 of a live session (owner's note subscription-only.md, 2026-10-16); many tenants means per-tenant credentials and a provider abstraction, which conflicts with the owner's subscription-only rule for this project **[VERIFY]**; (2) the in-flight gate is per process (ceiling 8), so admission must move to a shared store; (3) the bus wakes waiting pulls in-process, so a second notifications replica needs Postgres `LISTEN/NOTIFY`; (4) `quality_run` carries `openedBy` but no tenant, and the loop's own memory store has no tenant axis; (5) Telegram allows one poller per bot token. A Studio grade has taken 2 to 16 minutes, usually about 6 (features-summary, 28 Oct 2026, uncommitted; the first 2.0.0 canvas grade on 2026-10-20 ran 342 s, owner's note studio-competency-grading.md), so only the fastest would fit a Lambda invocation; docs/issues/platform-and-hygiene.md records quality runs of 8–15 minutes and memory orchestrations of 15–25 (PLAT-2, last revised 30 Sep 2026) and says neither fits one, a browser session runs for hours, and one evaluator call has taken 21.3 minutes (2026-10-20, owner's note form-answering-round.md) — so even the Studio grade belongs in a worker pool pulling runs, not request-response, with ECS on Fargate and RDS as PLAT-2's smallest step.

Where it lives: `packages/quality-loop/src/modules/janitor/run-janitor.ts`, `packages/llm/src/in-flight-gate.ts`, `packages/notifications/src/bus/wakeup.ts`, `packages/agentic-memory/src/space/scope.ts`, `docs/issues/platform-and-hygiene.md`

---

#### Follow-up: “What would you change first to make it a production multi-tenant service?”

**Interviewer:** “What would you change first to make it a production multi-tenant service?”

**Answer**

**Say it in 60 seconds.**

> “Five changes, in this order, each because the one before makes it safe. First, authentication and authorization at every HTTP edge: today the services are reachable only through Tilt port-forwards or localhost, the Gmail and Calendar endpoints have no login, and the loop has none either. Second, a tenant on every row and every vector point in the loop's store, with the Qdrant filter and the run list reading it; the memory runtime already has this shape, so it is the model to copy. Third, observability that is not a row: a trace per run with a span per exchange, and metrics for the rates the records already carry, with the vendor exporter as configuration. Fourth, hosted stores and containers with scheduled backups, because there is no backup today and every Studio record before 2 Oct 2026 was lost to a test run. Fifth, push `main` so the CI runs on the remote again — and I would say plainly that none of the five is built.”

**If they dig deeper.**

In this order, each because the one before makes it safe: first, authentication and authorization at every HTTP edge — today the services are reachable only through Tilt port-forwards or localhost, the Gmail and Calendar endpoints have no login, and the loop has none either; second, a tenant on every row and every vector point in the loop's store, with the Qdrant filter and the run list reading it (the agentic-memory runtime already has this shape, so it is the model to copy); third, observability that is not a row — an OpenTelemetry trace per run with a span per exchange, and metrics for the rates the records already carry (schema-miss share, escalations at the evidence gate, admission ratio, latency), with the vendor exporter as configuration (PLAT-1); fourth, hosted stores and containers with scheduled backups — there is no backup today, and every Studio record before 2 Oct 2026 was lost to a test run (features-summary, uncommitted); fifth, push `main` so the CI you saw in Q2 runs on the remote again. Observability (PLAT-1) and hosting (PLAT-2) are recorded in docs/issues/platform-and-hygiene.md; the missing login on the Gmail and Calendar endpoints, the missing backup and the unpushed `main` are recorded in docs/features-summary.md (28 Oct 2026, uncommitted); a tenant on runs is this write-up's own proposal, recorded nowhere in the repository. None of the five is built.

Where it lives: `docs/issues/platform-and-hygiene.md`, `packages/nest-kit/src/`, `packages/agentic-memory/src/space/scope.ts`, `.github/workflows/ci.yml`

---

### 22. The same engine behind the Studio and browser automation; ownership and evidence

Two product surfaces run on an engine that knows neither of them: the Studio grades and coaches a system-design canvas, and the browser session plans clicks and answers forms. A Lead interviewer probes this to see whether "one shared core" is real — whether a pipeline is really data, what each host owns and what it leaves to the loop — and then asks the question every résumé defense ends on: what did you personally build, and what evidence backs the numbers. This is a solo project; the answers say so and separate what was designed, implemented and measured.

_Disclosure note (added by the compiler of this document, not by the interviewer or the repository)._ The browser automation's live use so far has been applying to jobs on your behalf; Q2 below states the dated outcomes because they are the evidence. Decide before the interview how much of that you volunteer to an employer. The engine-level description is accurate on its own and matches the résumé's wording: multi-step browser workflows with an operator in the loop, every planned action judged before it runs, answers recalled and taught per unit, and a record that stops the same target from being opened twice.

#### Q1. “How does the Studio grade a canvas with this engine?”

**Interviewer:** “How does the Studio grade a system-design canvas with this engine?”

**Answer**

**Say it in 60 seconds.**

> “The Studio owns structure and storage and never judges: one port to the grader, one grading slot per session, one pipeline whose controller can only say revise, because a retry would replace a person's canvas with the model's. The loop returns findings with references; the Studio joins them onto the canvas and counts verdicts per competency, never rescaling.”

**If they dig deeper.**

The Studio API owns structure and storage and never judges; its one port onto the grader is `QualityLoopClient` (HTTP in production, a fake in specs). A submit runs under a `PESSIMISTIC_WRITE` lock on the session row: one grading slot (409 while a grade or coach is in flight), the interview transcript composed onto the submission if the format has phases, any referential problem refused at once (an edge to nothing, a binding to a criterion never derived) with the contract functions the pipeline's `references` validator runs, so Studio and loop cannot disagree, then one `system-design-canvas` run with the prompt as goal, the prompt's rubric, and the canvas as the provided artifact. The rubric is derived once per prompt and closed by three standing trade-off criteria the Studio appends (at most 27 rows), because the loop uses a supplied rubric verbatim and a dimension with no criteria could only lose points.

```text
studio-ui ─PUT /sessions/:id/draft─► studio-api (autosave, shape only)
studio-ui ─POST /sessions/:id/revisions─► studio-api
   derive the rubric once per prompt: POST :3003/criteria
                 + 3 standing trade-off criteria (≤ 27 rows)
   lock the session (PESSIMISTIC_WRITE) · one grading slot (409)
   refuse referential problems (edge→nothing, binding→none)
   POST :3003/runs {system-design-canvas, criteria, output, 1 iter}
quality-loop: validators references (block) / structure (warn)
   → 5 critics ×2 → 4 evaluators ×2 (shown confirmed findings)
   → REVISE_ONLY controller (never retry) → accept | revise | …
studio-ui ─GET /revisions/:id/evaluation─► findings → node.3 / edge.1
coach: POST /sessions/:id/improve (recall: true; 3 rounds, ≤ 10)
   → strictly-better iterations imported as "assistant" revisions
   → run complete ⇒ POST :3003/orchestrations/memory/from-run
progress: POST :3003/runs/evidence → pass/partial/fail per kind
```

In the loop, pipeline version 2.0.0 grades ten competencies (functional, domain_model, interface, boundary, workflow, non_functional, scale, evolution, tradeoff, constraint) through 16 finding types at `minHits: 2`; dimension weights coverage 0.2, design 0.3, qualities 0.15, reasoning 0.25, compliance 0.1; accept at 75, reject floor 30. Its controller is `REVISE_ONLY`: a retry would replace a person's canvas with the model's, so every retry reads as revise. Read-back joins each finding's refs onto the canvas and caches only terminal scalars. A coach run is the same pipeline with `recall: true`; a grade never recalls, and lessons reach the producer only, never a judge. Progress counts pass/partial/fail per kind from every graded iteration's verdicts, never weighing or rescaling, and the weakest kind picks the next practice format. Interview mode runs one `interview-turn` run per turn (three fixed criteria, nothing gates, one iteration); probes are chosen by rule and phase timers shown, never enforced.

Dated evidence (docs/features-summary.md as of 28 Oct 2026, uncommitted, unless noted): a grade took about 2 minutes and a rubric about 7 seconds on the real model (30 Sep 2026); a 3-round coach lifted a design from 25 to 60 and four grades reached accept at 76.7 to 83.3 (30 Sep to 3 Oct 2026); once over-long replies stopped being discarded, 20 of 20 coach rounds produced a design (4 of 8 before); no Studio grade since 3 Oct 2026; the first grade under pipeline 2.0.0 (2026-10-20) scored 33.9 revise (owner's note studio-competency-grading.md). `docs/practice-workspace.md` (edited 2026-10-20) prints weights — coverage 0.25, design 0.35, qualities 0.2, reasoning 0.1, compliance 0.1 — that match no committed version of the definition (1.x had three dimensions at 0.4 / 0.4 / 0.2); the definition at HEAD (0.2 / 0.3 / 0.15 / 0.25 / 0.1) is the source.

Where it lives: `packages/studio-api/src/modules/quality-loop/quality-loop.client.ts`, `packages/studio-api/src/modules/sessions/sessions.service.ts`, `packages/studio-api/src/modules/sessions/submission.ts`, `packages/studio-api/src/modules/sessions/run-kinds.ts`, `packages/studio-api/src/modules/sessions/improve.service.ts`, `packages/studio-api/src/modules/progress/`, `packages/studio-api/src/modules/interview/`, `packages/quality-loop/src/pipelines/system-design-canvas/`, `packages/quality-loop/src/pipelines/interview-turn/`, `packages/contracts/src/lib/studio-pipelines.ts`, `packages/contracts/src/lib/practice-formats.ts`

---

#### Q2. “How does a browser session become a quality-loop run?”

**Interviewer:** “How does a browser session become a quality-loop run?”

**Answer**

**Say it in 60 seconds.**

> “The browser session decides nothing of its own: a mission is declared data, every step is a run the loop can replay, and a forbidden company is cut by a validator, not by a model. A form is answered from memory scoped to the tenant and the hashed employer, and what the owner answers on Telegram becomes a fact the next form can use. The engine never learns which site it is on.”

**If they dig deeper.**

A mission is a markdown file whose `##` sections the engine parses as declared data — `Marks` (tokens written on items to pass over), `Stop conditions`, `Unit identity`, `Unit context`, `Advisors`, `Taking a unit on record`, `Documents` — through one grammar machine, refused before any row exists; the rest is prose the planner and the rubric deriver read. No engine code, config or persona names a site (`tooling/site-words.spec.ts` fails the build on one); the missions under `packages/browser-session/goals/` are the one place a site may be named.

```text
mission.md (## Marks, Stop conditions, Unit identity, Advisors …)
   │ parsed as declared data; a malformed section refuses the session
   ▼
browser-session: bind brain → advisors → ledger row → session.started
   derive one rubric per role (POST /criteria ×3: plan/answer/suggest)
   ┌─ one step ────────────────────────────────────────────────────┐
   │ observe (Playwright ARIA snapshot) → rails → POST /advice     │
   │ compose goal ≤ 64,000 B: mission · Page · Elements · Snapshot │
   │   · Recent actions · Objections · Units of work · Limits ·    │
   │   fenced JSON Index (validators read it; no model sees it)    │
   │ POST :3003/runs browser-step (1 iteration)                    │
   │   validators references / limits CUT at the faulted action    │
   │   critic.mission + critic.safety (1 sample) · evaluator beside│
   │   STANDARD controller, corroboration 'cited'                  │
   │ run the executable prefix → click / fill / … · a form page:   │
   │   recall per question from the memory space (tenant/unit)    │
   │   → field-answer run → route: fill | blank | ask the operator │
   │   (terminal + Telegram via the bus; first answer wins)        │
   │   → teach: one standing_answer fact per answer, no model      │
   │ taskStart / taskDone → bus events → job-application record    │
   └───────────────────────────────────────────────────────────────┘
```

Each step composes a goal the loop can judge replayably: the mission verbatim, the page, the reachable elements with their marks, the ARIA snapshot fitted under the 64,000-byte budget by a declared ladder of rungs, recent actions and objections, the units on record (40 rendered, the rest counted), a Limits line and a fenced index of facts. One `browser-step` run plans the next actions; the `references` and `limits` validators cut the plan at the first faulted action instead of voiding it, and the `STANDARD` controller decides under `corroboration: 'cited'` — a one-sample finding vetoes only when the evaluator independently failed a gating criterion it cites. The session runs the executable prefix; a `taskStart` at a forbidden company is cut by the validator, and the session refuses one at any company on record. On a form page, facts are recalled from the `job-assistant` memory space (the `memory` brain — `packages/browser-session/config/engine.json` declares it since commit `7d3f12b7` of 30 Oct 2026, 17:47 PT, per git log; owner's note job-assistant-memory-move.md), one request per distinct question, scoped by tenant, project and hashed unit key; a `field-answer` run judges the page on that evidence, a declared precedence routes each field to fill, blank or the operator, and a Telegram answer is taught at once as one `standing_answer` fact keyed by the question's hash. Opened and closed units ride the notifications bus to the applied-to record, which answers the next `POST /advice` with forbid or avoid stances under a 90-day window.

Dated evidence: 2,024 of the 3,139 runs recorded 6 Sep to 18 Oct 2026 were browser steps; at least 77 applications went in between 10 and 16 Oct 2026; the fastest run (15 Oct) made 10 applications in about 2.5 h with 15 of 26 fields from the record, 11 from Telegram and 0 wrong; an 8-hour run on 16 Oct submitted 7 and refused 39 attempts to reopen companies on record (docs/features-summary.md, 28 Oct 2026, uncommitted); the 2026-10-08 lens audit that reshaped these lenses is quoted in Q3 below (docs/quality-loop/lens-debate.md).

Where it lives: `packages/browser-session/src/core/session-engine.ts`, `packages/browser-session/src/core/step-flow.ts`, `packages/browser-session/src/core/rails.ts`, `packages/browser-session/src/core/field-flow.ts`, `packages/browser-session/src/adapters/memory-loop/`, `packages/browser-session/goals/linkedin-easy-apply.md`, `packages/browser-session/config/engine.json`, `packages/contracts/src/lib/browser-session/mission-sections.ts`, `packages/contracts/src/lib/browser-session/`, `packages/contracts/src/lib/units/`, `tooling/site-words.spec.ts`, `packages/quality-loop/src/pipelines/browser-step/`, `packages/quality-loop/src/pipelines/field-answer/`, `packages/notifications/src/`, `packages/job-application/src/`

---

#### Q3. “What did you personally own, and what evidence backs the numbers?”

**Interviewer:** “What did you personally own, and what evidence backs the numbers you quote?”

**Answer**

**Say it in 60 seconds.**

> “I designed, built and measured it alone, with Claude Code as a pair; the commit history shows that honestly. Every number I give you has a date and a place it is written down, and when a measurement came out null — recall’s effect at n=5 — I say null. If you ask about my personal project, it is this engine: pipelines as data, a controller that is code, and a memory that is digested, scoped and retractable. The habit I would bring to your team: mark what you cannot confirm instead of rounding it up.”

**If they dig deeper.**

Say it plainly: this is a solo project. The repository's history has one author on all 882 commits (27 Aug to 31 Oct 2026, measured 2026-11-02), and 870 of them carry a `Co-Authored-By` trailer naming a Claude model (HEAD `9cd3c978`) — one engineer with Claude Code as a pair; the AI reviewer and the loop's critics are part of the system, not a second contributor.

Designed — the doctrine that models produce evidence and code decides (stated and enforced by `tooling/quality-loop-guarantees.spec.ts`; the owner's CLAUDE.md that states it is a gitignored local file), pipelines and orchestrators as data over one engine, a deterministic controller, missions as declared sections, two memory tiers; and five dated decisions in the owner's notes: subscription-only model access (2026-09-30), coach-only recall (2026-10-01), never throw model work away (2026-10-02), the 90-day application window (2026-10-11), the 500-line bound (2026-10-14).

Implemented — first commits per package: studio-api, studio-ui, contracts, db and llm on 2026-08-27; quality-loop 2026-09-06; govcon 2026-09-26; browser-session and memory-ingest 2026-10-02; notifications 2026-10-10; job-application 2026-10-11; agentic-memory and agentic-system 2026-10-16. At HEAD: 16 pipelines, 9 orchestrators, 8 services, 40 entities, 89 migrations; 760 engine tests, 668 repo-guard tests and 45 Studio browser tests (19 Oct 2026, features-summary, uncommitted).

Measured — every number here carries its date and source: 3,139 runs recorded 6 Sep to 18 Oct 2026, 1,940 ending accept (features-summary, uncommitted); replay reproduced 54 recorded decisions (22 Sep 2026); the lost-sample defect over 324 runs and 4,136 calls (2026-10-01); the lens audit 52% → 93% (2026-10-08); recall's effect +0.5 ± 9 over 5 paired runs — a null result stated as one (2026-10-03); at least 77 applications (10 to 16 Oct 2026); the offline verification over 182 recorded pages with 0 leaks (2026-10-28).

```text
claim in this write-up ─► its date and its source
  run counts ............ quality_run rows + static/runs dumps (local)
  gate behaviour ........ tooling/*.spec.ts  (pnpm test:tooling)
  policy numbers ........ pipelines/<id>/definition.ts (code at HEAD)
  measured bounds ....... pipelines/<id>/measured.json (committed)
  live outcomes ......... docs/features-summary.md (28 Oct 2026, uncommitted),
                          docs/agentic-system/*-2026-10-28.md
  decisions ............. the owner's dated session notes (not in git)
  anything else ......... flagged for the owner, never asserted
```

Three things only the owner can confirm: the résumé (docs/ingestion/Resume_2026_c.pdf, a local file — `docs/ingestion/` is gitignored, so it is not in the repository) lists personal-project start dates (System Design Graph May 2026, browser automation January 2026) that predate this repository's first commit of 27 Aug 2026; confirm them yourself **[VERIFY]**. The résumé's AWS, Jira and MCP integrations are not in this repository — no AWS SDK, CDK or Terraform (PLAT-2), no Jira anywhere under `packages/`, and MCP only as a label in the agentic-system component catalog (`packages/agentic-system/src/catalog/components.ts` and its README), in website copy and in a seed fixture of the owner's experiences, while `packages/llm/src/claude-turn.ts` disables MCP servers for every model call; what is here is GitHub Actions, Playwright and the Claude Agent SDK — so name where that work lives **[VERIFY]**. And any figure quoted from a session note rather than a committed doc should be re-read before the interview **[VERIFY]**.

When the interviewer turns to the personal projects, do not narrate a past project: present this repository as the system design it is — the quality loop of area 19 (pipelines as data over one engine; a controller that is code, reading declared gates, weights and thresholds) and the memory of area 20 (digest through the loop, recall scoped by declared keys, admission and retraction as rows) — with the Studio and the browser session of this area as its two hosts.

Where it lives: `CLAUDE.md` (local, not tracked), `docs/features-summary.md` (local, not yet committed), `docs/quality-loop/`, `docs/agentic-system/`, `packages/quality-loop/src/pipelines/*/measured.json`, `tooling/*.spec.ts`, `packages/criteria/src/`, `.gitignore`, `docs/issues/platform-and-hygiene.md`, `packages/agentic-system/src/catalog/components.ts`, `packages/llm/src/claude-turn.ts`

---

## Personal Project — Agentic Engine (the résumé's DAG / graph-search wording, kept for reference)

_Reference block. These are the original interviewer questions and answers for the Agentic Engine bullet as it was first framed (goal → DAG compiler, beam search, XState). The current architecture is described in the section above; use this block to bridge from the résumé's wording to what the engine became._

_PERSONAL PROJECT — AGENTIC ENGINE_

Your resume describes a workflow engine that compiles goals into DAGs using LLM critics/evals, strict JSON schemas, beam search, MCP tooling, RAG, XState, TypeScript/Node, and Python.

The resume explicitly describes goal→DAG compilation using LLM critics/evals, strict schemas, beam search, MCP, RAG, XState, TypeScript/Node and Python. Oscar Gonzalez - Lead Engineer …

### 18. Agentic Engine

> **Résumé bullet:** 18. “Workflow engine compiling goals into DAGs using LLM critics/evals, strict JSON schemas, beam search, MCP tooling, RAG, XState, TypeScript, Node, Python.”

This is another bullet that could generate an entire system-design interview.

#### Q1. “How does natural language become a DAG?”

**Interviewer:** “Start from a user's natural-language goal. Show me exactly how that becomes a DAG. What are your node and edge data models?”

**Answer**

Architecture:

```text
User Goal
   │
   ▼
Intent / Goal Parser
   │
   ▼
Candidate Planner
   │
   ▼
Structured CandidatePlan
   │
   ▼
JSON Schema Validation
   │
   ▼
Critics / Evaluators
   │
   ▼
Search / Beam Selection
   │
   ▼
Validated DAG
   │
   ▼
Executor
```

Node model:

```ts
interface WorkflowNode {
  id: string;
  type: string;
  dependencies: string[];
  inputSchema: object;
  outputSchema: object;
  tool?: string;
}
```

Conceptual only; map to your actual schema.

---

#### Q2. “Why DAG? What about loops?”

**Interviewer:** “Why a DAG? What kinds of workflows cannot be represented cleanly as a DAG, and how do you handle loops or retries?”

**Answer**

DAG gives:

```text
explicit dependencies
parallelizable nodes
cycle detection
deterministic scheduling
visualizability
```

Loops can be modeled at a higher level:

```text
state machine
   ↓
execute DAG iteration
   ↓
evaluate
   ├── complete
   └── another iteration
```

or as a bounded retry state rather than introducing arbitrary graph cycles.

This is one reason XState + DAG can coexist.

---

#### Q3. “Where do critics/evals enter?”

**Interviewer:** “Where do LLM critics/evaluators enter the planning process? Do they score complete plans, individual nodes, or execution results?”

**Answer**

Possible evaluation layers:

```text
Candidate plan
      │
      ├── feasibility critic
      ├── completeness critic
      ├── safety/schema critic
      └── cost/efficiency critic
             │
             ▼
           score
```

During execution:

```text
node result
   ↓
result evaluator
   ↓
accept / retry / replan
```

The important distinction:

> “Planning evaluation and execution evaluation are separate problems.”

---

#### Q4. “Explain beam search.”

**Interviewer:** “Explain your beam search. What constitutes a candidate state, what is the beam width, what is the scoring function, and when do you stop searching?”

**Answer**

Instead of committing to first plan:

```text
Goal
 │
 ├── Candidate A
 ├── Candidate B
 ├── Candidate C
 └── Candidate D
```

Score them:

```text
coverage
feasibility
tool availability
risk
cost
```

Keep top `k`.

Each expands:

```text
A → A1, A2, A3
B → B1, B2
```

Again keep top `k`.

Stop when:

```text
complete valid plan
score threshold
max depth
budget exhausted
```

Be ready to name your actual beam width/scoring config if implemented.

---

#### Q5. “How do JSON schemas protect against LLM nondeterminism?”

**Interviewer:** “How do strict JSON schemas protect the system from LLM nondeterminism? What happens when the model produces structurally valid but semantically invalid output?”

**Answer**

Schema prevents structural garbage:

```json
{
  "nodeId": "...",
  "tool": "...",
  "inputs": {}
}
```

It can enforce:

```text
required properties
enums
types
additionalProperties=false
```

But schema cannot guarantee semantic correctness.

Therefore:

```text
Schema validity
       +
semantic validation
       +
tool/domain validation
```

are all needed.

---

#### Q6. “XState vs DAG?”

**Interviewer:** “What role does XState play relative to the DAG? Why do you need both a state machine and a graph?”

**Answer**

A strong distinction:

> “The DAG represents dependency structure between pieces of work. XState represents lifecycle/control state.”

```text
DAG:
A → B
A → C
B,C → D
```

XState:

```text
IDLE
 ↓
PLANNING
 ↓
VALIDATING
 ↓
EXECUTING
 ├── RETRYING
 ├── REPLANNING
 └── COMPLETED
```

They solve orthogonal problems.

---

#### Q7. “How does MCP fit?”

**Interviewer:** “Where does MCP fit? How are tools discovered, permissioned, invoked, and validated?”

**Answer**

Conceptual:

```text
Planner
   │
   ▼
Tool Registry
   │
   ├── MCP server A
   ├── MCP server B
   └── native tool C
```

For each tool:

```text
name
description
input schema
permissions
capabilities
```

Executor:

```text
validate tool allowed
validate input
invoke
validate output
persist result
```

Security must include:

- explicit tool allowlists;
- user/tenant permission;
- scoped credentials;
- secret isolation;
- no arbitrary tool execution solely because the LLM requested it.

---

#### Q8. “Explain the RAG pipeline.”

**Interviewer:** “Explain your RAG pipeline. What gets chunked and embedded, what retrieval strategy do you use, and where does reranking happen?”

**Answer**

```text
Documents
   ↓
chunk
   ↓
embed
   ↓
vector index

Query
   ↓
embed
   ↓
retrieve top-K
   ↓
optional keyword/hybrid retrieval
   ↓
rerank
   ↓
context
   ↓
LLM
```

For a source-grounded system, persist:

```text
document ID
chunk ID
score
citation
version
```

so answers can point back to evidence.

---

#### Q9. “Node 8 fails after 7 side effects.”

**Interviewer:** “How do you recover if node 8 of a 20-step workflow fails after the first seven nodes already caused side effects?”

**Answer**

This is distributed workflow recovery.

Each node needs:

```text
execution_id
status
attempt
idempotency_key
result
side_effect metadata
```

Then classify nodes:

```text
pure/retryable
idempotent side-effect
compensatable side-effect
irreversible
```

Example Saga:

```text
A success
B success
C success
D fails
   ↓
compensate C
compensate B
or resume from D
```

Do not rerun successful side-effecting nodes blindly.

---

#### Q10. “How horizontally scale thousands of workflows without executing a node twice?”

**Interviewer:** “How would you horizontally scale this engine to execute thousands of workflows concurrently without executing a node twice?”

For the final question, be ready to discuss something like:

```text
Workflow request
      ↓
Planner
      ↓
Versioned DAG
      ↓
Durable workflow store
      ↓
Ready-node queue
      ↓
Worker pool
      ↓
Tool execution
      ↓
Result store
      ↓
Evaluator
      ↓
next runnable nodes
```

with:

- idempotency keys
- leases
- checkpoints
- retries
- DLQs
- compensation
- distributed workers
- observability

**Answer**

```text
Workflow DB
     │
     ▼
Scheduler
     │
     ▼
Ready-node queue
     │
   ┌─┴───────┐
   ▼         ▼
Worker A   Worker B
```

Use:

```text
leases
atomic claim
idempotency key
execution version
heartbeat
lease expiry
```

Example:

```sql
UPDATE node_execution
SET worker_id = :worker,
    lease_until = ...
WHERE id = :node
  AND status = 'READY'
  AND lease is available;
```

Only one worker wins.

Even if queue delivery is duplicate:

```text
consumer A
consumer B
```

the durable claim prevents duplicate execution.

For external actions, use a downstream idempotency key too.

---

## The 10 cross-cutting questions they can ask about any bullet

_Questions they can use against almost any resume bullet_

After you've answered any of the 18 areas above, expect the Lead interviewer to switch into the same pressure-test sequence:

These were also questions in the previous response, so they should be part of your preparation.

### 1. “Draw it.”

**Interviewer:** “Draw it.”
They want components and data flow, not abstract descriptions.

**Answer**

Always start with:

```text
CLIENT
 ↓
INGRESS
 ↓
COMPUTE / SERVICE
 ↓
STATE
 ↓
ASYNC INTEGRATIONS
```

Then add:

```text
auth
cache
queue
external service
monitoring
```

Do not immediately draw 25 AWS icons.

Start from data flow and invariants.

---

### 2. “What did you personally own?”

**Interviewer:** “What did you personally own?”
Separate your contribution from the team's.

**Answer**

Use four buckets:

> “I personally designed X, implemented Y, led/reviewed Z, and the broader team owned W.”

This is much more credible than turning every organizational achievement into individual authorship.

---

### 3. “Why that technology?”

**Interviewer:** “Why did you choose that technology?”
Give alternatives and tradeoffs rather than “that's what we used.”

**Answer**

Use this pattern every time:

> “The requirements were A/B/C. I considered X and Y. X optimized for __, Y optimized for __. We chose X because the dominant requirement was __. The tradeoff was __.”

Example:

```text
SQS FIFO vs Kafka

Need:
ordering
retries
DLQ
modest event rate

No need:
replay
many consumer groups
high-throughput stream processing

→ SQS FIFO
```

That is stronger than “because AWS.”

---

### 4. “What was the scale?”

**Interviewer:** “What was the scale?”
Requests/sec, events/sec, data size, concurrency, number of tenants, latency.

**Answer**

Know these dimensions separately:

```text
concurrent users
requests/sec
events/sec
data volume
tenants
DB size
latency SLO
queue depth
```

Never substitute one for another.

`10,000 concurrent` does **not** automatically mean `10,000 requests/sec`.

---

### 5. “What happens when it fails?”

**Interviewer:** “What failed?”
Timeouts, duplicate messages, DB outage, queue backlog, third-party outage.

**Answer**

For every architecture, mentally walk:

```text
DB down
cache down
queue delayed
external API timeout
duplicate event
out-of-order event
instance crash
deployment bad
network partition
```

A Lead Engineer should design failure semantics, not just success flow.

---

### 6. “How do you prevent duplicates?”

**Interviewer:** “How did you prevent duplicates?”
Idempotency, unique constraints, conditional writes, source versions.

**Answer**

Common mechanisms:

```text
idempotency key
unique DB constraint
processed_event table
source version
conditional update
transactional outbox
```

Remember:

> At-least-once delivery means consumers must assume duplicates.

---

### 7. “What consistency do you need?”

**Interviewer:** “What consistency did you require?”
Strong versus eventual, and why.

**Answer**

Use strong consistency only where the invariant requires it.

Examples:

```text
Seat allocation       → strong
Payment/order state   → strong/idempotent
Analytics             → eventual
Search index          → eventual
Email                 → eventual
Cached seat map       → eventual
```

This demonstrates mature distributed-system judgment.

---

### 8. “How do you observe it?”

**Interviewer:** “How did you observe it?”
p50/p95/p99, error rate, queue lag, CPU, DB connections, traces.

**Answer**

Use the golden signals:

```text
latency
traffic
errors
saturation
```

Plus domain signals:

```text
queue lag
DLQ depth
hold expiration
payment failure
reward backlog
indexing freshness
```

For latency:

```text
p50
p95
p99
```

not just average.

Distributed tracing:

```text
trace_id
   ↓
API Gateway span
   ↓
Service span
   ↓
DB/external dependency span
```

---

### 9. “How is it secured?”

**Interviewer:** “How was it secured?”
Authentication, authorization, tenant isolation, secrets, encryption.

**Answer**

A strong security checklist:

```text
Authentication
→ who are you?

Authorization
→ what may you do?

Tenant isolation
→ whose data may you access?

Transport security
→ TLS

Secrets
→ secret manager/KMS

Data
→ encryption at rest

APIs
→ rate limits/validation

Webhooks
→ signature verification

Audit
→ who changed what?

Least privilege
→ minimum IAM/scopes
```

For JWT:

```text
verify signature
issuer
audience
expiration
scopes/roles
```

Never trust client-supplied `user_id` or `tenant_id` over authenticated identity.

---

### 10. “How do you know your resume metric is true?”

**Interviewer:** “How do you know the metric on your resume is true?”
Be able to explain every 10,000+, 50%, 60%, 70%, 30%, and 80%.

**Answer**

You have several quantified claims:

```text
10,000+ concurrent
50% production bugs
60% manual QA
70% coverage
30% incidents
80% approval-cycle reduction
```

For **every one**, prepare this four-part answer:

```text
Baseline
→ what was measured before?

Intervention
→ what did we change?

Measurement
→ what system/report gave the number?

Window
→ over what period?
```

For example:

> “Coverage is straightforward: the test tooling reported repository coverage after the initiative. For business metrics such as defect reduction, I would identify the exact issue-tracking baseline and comparison period rather than implying the number was subjective.”

If you cannot reconstruct how one percentage was calculated, that is something to resolve **before the interview**, because an aggressive interviewer will detect an unsupported metric very quickly.

---

The most dangerous answers for your particular resume are vague statements such as “we used AWS to scale,” “Kafka handled the events,” “Redis made it faster,” “Auth0 handled security,” or “Playwright automated testing.” At Lead level, they're likely to immediately ask what exact problem that component solved, what data moved through it, what happened on failure, and why you chose it instead of the alternative.

A good next preparation step is to take these 18 resume bullets one at a time and build a 2–3 minute “defense” for each containing: architecture diagram → one concrete implementation detail → scale → failure scenario → tradeoff → your personal ownership. That will prepare you much better for a resume-grilling interview than memorizing generic system-design answers.

## The answer structure I recommend memorizing

For essentially every experience question, answer in this order:

```text
1. CONTEXT
What problem were we solving?

2. REQUIREMENTS / INVARIANTS
What absolutely had to be true?

3. ARCHITECTURE
What components did I choose?

4. FLOW
Walk one request/event end-to-end.

5. SCALE
What traffic/data/concurrency did it handle?

6. CONSISTENCY
What required strong vs eventual consistency?

7. FAILURE MODES
What if a dependency failed?

8. SECURITY
Authentication, authorization, secrets, isolation.

9. OBSERVABILITY
What metrics/traces/logs told us it worked?

10. CI/CD
How did code safely reach production?

11. TRADEOFF
What alternative did I reject and why?

12. OWNERSHIP
What specifically did I personally design/build?
```

If they ask something as simple as:

> “Tell me about the TicketSocket scaling work.”

you can compress that framework into a 2-minute answer:

```text
Problem
   ↓
Architecture
   ↓
Critical invariant
   ↓
Scale
   ↓
Failure handling
   ↓
My ownership
```

That is the pattern I would use throughout this interview.

The areas I would prioritize most heavily before the interview are **TicketSocket 350→10,000 scaling/JWT routing**, **TicketSocket PostgreSQL + transactional event processing**, **Gala's 10,000+ architecture**, **Gala Vision/vector/Sanity pipeline**, **Frequence's configurable Angular widget architecture**, **Playwright/Claude testing with the 50%/60% metrics**, and your **Agentic Engine DAG/evaluator architecture**. Those claims contain enough technical depth that a strong interviewer can remain on a single bullet for 15–30 minutes.

# Part II — System Design Reference

The general study material: the building blocks of scalable systems, eleven reference architectures, storage and streaming choices, and two deep dives that came out of the TicketSocket questions (security and the waiting-room flow). Each chapter opens with the question that produced it.

## 0. Study notes: API gateway responsibilities, S3 event notifications, fan-out, and the problem → component map

### The components that come up most often in interviews

If you're short on study time, prioritize these:

```text
Load balancer → distribute traffic.
Stateless application servers → horizontally scale compute.
SQL vs NoSQL databases → choose appropriate persistence.
Indexes → improve database read performance.
Replication / read replicas → availability + read scalability.
Sharding / partitioning → scale databases horizontally.
Redis/cache → lower latency and database load.
CDN → cache content geographically near users.
Message queue → asynchronous processing.
Kafka/event streaming → high-volume distributed event processing.
Object storage → images, videos, files.
Search engine → full-text/search workloads.
API gateway → centralized API routing/security/rate limiting.
Rate limiter → protect services from excessive traffic.
Workers → process background jobs.
Retries + timeout + circuit breaker → distributed-system resilience.
Monitoring/logging/tracing → production observability.
Autoscaling → dynamically adjust capacity.
Multi-AZ / replication → high availability.
Consistent hashing → distribute cache/shard keys while minimizing remapping.
```

### API gateway responsibilities

#### 1. Rate Limiting (Why it needs State)

Rate limiting requires knowing the answer to: "How many times has Client X hit this API in the last 60 seconds?"

- **The Mechanism:** When a request arrives, the gateway extracts a unique identifier (like an IP address or an API key).
- **The State Check:** It looks up this key in its memory store (e.g., Redis). If the counter for that key is less than the limit (say, 99 out of 100), the gateway increments the counter and lets the request pass.
- **The Block:** If the counter is at 100, the gateway immediately drops the request and returns an HTTP 429 Too Many Requests error, saving your backend servers from getting overwhelmed.

#### 2. Authentication & Authorization

Instead of forcing every single microservice to write code to check passwords or validate tokens, the gateway handles it once at the front door.

- **The Mechanism:** The client sends a request with an `Authorization: Bearer <token>` header (like a JWT).
- **The Validation:** The gateway decrypts and verifies the token's cryptographic signature using a public key. It checks the expiration date and ensures the token hasn't been blacklisted.
- **The Result:** If valid, the gateway passes the request onward. It may also strip the messy token and pass clean user data (like X-User-ID: 12345) to the backend services.

#### 3. Request Transformation

Clients (like mobile apps) and internal microservices often speak different "languages" or expect different data formats.

- **The Mechanism:** A mobile app might send a modern POST request with a clean JSON payload.
- **The Transformation:** The API gateway intercepts this and translates it on the fly. It can inject missing headers, strip out sensitive internal fields, or even map the JSON into a legacy XML format or a high-performance gRPC payload required by an older backend service.

#### 4. API Versioning

When you upgrade your software, you cannot break the API for older mobile apps that users haven't updated yet. The gateway acts as a smart router to manage this seamlessly.

- **The Mechanism:** The gateway evaluates incoming paths or headers (e.g., ://api.com vs ://api.com, or an Accept-Version: 2.0 header).
- **The Routing:** Without the client knowing it, the gateway routes the v1 request to your old legacy server cluster, and the v2 request to your brand-new microservices cluster. This decouples your backend deployment cycle from your user-facing interface.

### Why Infrastructure Wins Over Application Code

Building an API gateway inside NestJS means your application code has to handle massive amounts of raw networking tasks (decrypting SSL, managing thousands of concurrent connections, parsing data packets).

Dedicated infrastructure tools are written in highly optimized, lower-level languages (like C or Go) explicitly designed to route millions of requests with sub-millisecond latency. Writing a gateway in Node.js/NestJS often introduces a performance bottleneck because Node.js is single-threaded.

### Approach 1: The Cloud/Infrastructure Way (Recommended)

In this model, you don't write code; you write configuration files or use a cloud console.

#### Option A: Managed Cloud (AWS API Gateway)

If you are already in AWS, this is entirely a configuration task.

- **Create the Gateway:** You go to the AWS Console (or use Terraform/CloudFormation) and create an "HTTP API" or "REST API".
- **Define Routes:** You configure routes visually or via config (e.g., ANY /users goes to a specific Load Balancer or Lambda function).
- **Turn on Features:** You check boxes or attach policies to enable JWT Authorizers, Rate Limiting (throttling), and CORS. AWS manages the scaling and servers for you entirely.

### The interview mindset

The key interview mindset is not merely saying "I'll add Redis/Kafka/Kubernetes." Explain the problem each component solves. For example:

> "Reads are overwhelming the primary database, so I'd first add caching for hot objects and read replicas for queries that can tolerate replica lag."

That type of requirement → bottleneck → architectural component → tradeoff reasoning is what system-design interviewers are usually evaluating.

### Fan-out for feeds

**Core idea:** fan-out on write. When someone posts:

```text
Post -> Kafka->Feed Workers->
 ├── add post to follower A feed
 ├── add post to follower B feed
 └── add post to follower C feed
```

For celebrities with millions of followers, use fan-out on read or a hybrid. Main topics: Kafka, caching, denormalization, fan-out, celebrity problem.

### S3 event notifications

```text
--> CDN —> Viewer
```

Amazon S3 (Object Storage) natively interfaces with a queue. It is a built-in feature of modern cloud storage providers called Object Storage Event Notifications. You do not need to write application code to pull the video out of S3 and push it into a queue; S3 handles it automatically.

Here is why this exact flow makes perfect sense and how the S3-to-queue mechanism works under the hood.

### How S3 Natively Interfaces with a Queue

When the Upload Service finishes saving a raw .mp4 file into Object Storage (S3), S3 triggers an event notification.

- **The Event:** You configure an S3 Event Notification rule that says: "Whenever a new file is successfully created in this specific folder, fire an event." [1]
- **The Destination:** You point that rule directly to your Queue (like AWS SQS).
- **The Payload:** S3 automatically generates a small JSON message and drops it into the queue. Crucially, this message does not contain the massive video file. It only contains metadata, looking something like this:

Json

```json
{
  "eventName": "ObjectCreated:Put",
  "bucket": "my-raw-videos-bucket",
  "videoKey": "user-123/my-travel-vlog.mp4"
}
```

### Why This Design Makes Sense (The Architecture Breakdown)

If you didn't use this exact asynchronous, queue-based flow, your system would crash or cost an astronomical amount of money to run. Here is the engineering logic behind the design:

#### 1. Decoupling the Upload from the Transcoding (The Queue's Role)

Videos are massive files. Transcoding a 4K video into 360p, 720p, and 1080p takes significant time, CPU power, and memory.

- **Without the Queue:** The Upload Service would have to wait around for the video to be transcoded before telling the user "Upload Complete." The user’s browser connection would timeout, and your upload servers would run out of memory trying to hold onto open connections.
- **With the Queue:** The moment the file lands in S3, the user gets a "Success! Your video is processing" message. The queue holds the processing request safely until a worker is free to pick it up.

#### 2. Absorbing Traffic Spikes (Load Leveling)

Imagine a famous creator uploads a video, and suddenly 10,000 other creators upload videos at the exact same minute.

The Queue absorbs this massive spike. It acts as a buffer.

Your Transcoding Workers don't crash from being overwhelmed; they simply pull jobs from the queue at a steady, manageable pace (e.g., handling 100 videos at a time). The remaining 9,900 jobs sit safely in the queue until workers become available.

#### 3. Parallel Processing (The Worker Split)

A single worker shouldn't transcode a video into 360p, then wait and do 720p, then wait and do 1080p. That is too slow.

Because of the queue architecture, you can design your system so that when a raw video notification lands in the queue, three separate worker processes can grab a copy of the task simultaneously.

Worker A generates the 360p version, Worker B handles 720p, and Worker C handles 1080p in parallel, drastically reducing the time the user spends waiting for their video to "process."

#### 4. Cost Efficiency & Speed at the Edge (S3 ──► CDN ──► Viewer)

Once the workers finish generating the different resolutions, they save the optimized formats (like HLS or DASH stream fragments) back into a secondary, public-facing Object Storage bucket.

You never want global viewers streaming video files directly from an S3 bucket. If 1 million people watch a video straight from S3, your cloud bill will skyrocket and the video will constantly buffer.

Instead, a CDN (Content Delivery Network) sits in front of S3. The CDN caches the 360p, 720p, and 1080p files at edge servers located all over the world (close to the viewers). When a Viewer hits play, they pull the video segments directly from a local CDN cache at ultra-fast speeds.

### The problem → component map

| Problem                 | Component/pattern you should immediately think about |
| ----------------------- | ---------------------------------------------------- |
| Too many reads          | Cache + read replicas                                |
| Too many writes         | Partition/shard DB + async writes                    |
| Traffic spikes          | Load balancer + autoscaling + queue                  |
| Slow expensive work     | Queue + workers                                      |
| Huge images/videos      | S3 + CDN                                             |
| Real-time communication | WebSockets                                           |
| Millions of events      | Kafka                                                |
| Limited inventory       | locking + atomic transactions                        |
| Duplicate requests      | idempotency key                                      |
| Database too large      | sharding                                             |
| Search                  | Elasticsearch/OpenSearch                             |
| Nearby objects          | geospatial index / geohash                           |
| Global users            | CDN + multi-region                                   |
| Service failures        | timeouts + retries + circuit breakers                |
| Downstream overload     | rate limiting + backpressure                         |
| System visibility       | logs + metrics + traces                              |

## 1. Common components of a scalable system

> **Original question:** for an interview on system design, give me all the common components used to build a scalable software system and brief description of what they are used for and what they're meant for

For a system design interview, think of a scalable system as a set of common building blocks. You usually won't use every component, but you should know what each does, why you'd add it, and when it becomes necessary.

| Component                      | What it does / why it's used                                                                                                                  |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Client                         | Web, mobile, desktop, or another service that sends requests to your system.                                                                  |
| DNS                            | Converts a domain such as api.example.com into the IP/address of your infrastructure.                                                         |
| CDN                            | Caches static or semi-static content close to users geographically, reducing latency and origin traffic. Examples: CloudFront, Cloudflare.    |
| Edge Network                   | Runs routing, caching, filtering, authentication, or lightweight computation near users before requests reach your backend.                   |
| WAF — Web Application Firewall | Blocks malicious web traffic such as SQL injection, bots, scanners, and suspicious requests.                                                  |
| Load Balancer                  | Distributes requests across multiple application servers so no single server becomes overloaded.                                              |
| Reverse Proxy                  | Sits in front of backend services and handles routing, TLS termination, caching, compression, etc. Nginx is common.                           |
| API Gateway                    | Central entry point for APIs. Handles routing, authentication, rate limiting, quotas, versioning, logging, etc.                               |
| Rate Limiter                   | Restricts how many requests a client/user can make over a period. Protects against abuse and overload.                                        |
| Application Server             | Runs your actual business logic. Usually horizontally scaled across many instances.                                                           |
| Stateless Service              | Server that keeps no important user state locally, making it easy to add/remove instances. Preferred for scalable APIs.                       |
| Stateful Service               | Keeps persistent state locally or tied to a specific instance. Requires more careful scaling and failover.                                    |
| Microservice                   | Independently deployable service responsible for a business capability such as users, payments, or orders.                                    |
| Monolith                       | Application where many features live in one deployable application. Simpler initially, but may become harder to scale organizationally.       |
| Service Discovery              | Allows services to dynamically locate other service instances instead of relying on hard-coded addresses.                                     |
| Service Mesh                   | Infrastructure layer controlling service-to-service networking, retries, TLS, observability, traffic policies, etc. Examples: Istio, Linkerd. |
| Database                       | Persistent source of truth for application data.                                                                                              |
| Relational Database / SQL      | Structured data with relationships, transactions, and strong consistency. PostgreSQL/MySQL.                                                   |
| NoSQL Database                 | Optimized for flexible schemas, high throughput, large scale, or specialized access patterns. DynamoDB, MongoDB, Cassandra.                   |
| Document Database              | Stores JSON-like documents. Useful when data structure varies or maps naturally to objects.                                                   |
| Key-Value Store                | Extremely fast lookup by key. Common for caching, sessions, counters, and simple high-scale data.                                             |
| Wide-Column Database           | Designed for enormous horizontally distributed datasets and high write throughput. Cassandra/ScyllaDB.                                        |
| Graph Database                 | Stores relationships as nodes and edges. Useful for social networks, recommendations, fraud graphs, etc.                                      |
| Time-Series Database           | Optimized for timestamped measurements such as monitoring metrics, IoT, and financial data.                                                   |
| Search Engine                  | Provides full-text search, indexing, filtering, and ranking. Elasticsearch/OpenSearch/Solr.                                                   |
| Vector Database                | Stores embeddings and retrieves similar vectors. Used for semantic search, recommendation, and RAG/AI systems.                                |
| Database Index                 | Additional data structure that speeds reads at the cost of storage and slower writes.                                                         |
| Read Replica                   | Copy of a database used primarily for reads, reducing load on the primary database.                                                           |
| Primary/Replica Architecture   | Primary handles writes; replicas copy its data and commonly serve reads/failover.                                                             |
| Database Sharding              | Splits data across multiple database servers so datasets and traffic can scale beyond one machine.                                            |
| Partitioning                   | Divides data into subsets, usually by key, range, geography, or time.                                                                         |
| Replication                    | Maintains multiple copies of data for availability, durability, and sometimes read scalability.                                               |
| Cache                          | Stores frequently accessed data in faster storage to reduce database/backend load and latency. Redis/Memcached.                               |
| Distributed Cache              | Cache shared across many application instances rather than local to one server.                                                               |
| Local/In-Memory Cache          | Data stored directly in application memory. Extremely fast but not shared across instances.                                                   |
| Cache Eviction Policy          | Determines what gets removed when cache fills, e.g. LRU, LFU, TTL.                                                                            |
| Message Queue                  | Buffers asynchronous jobs so producers don't have to wait for consumers. SQS, RabbitMQ.                                                       |
| Message Broker                 | Middleware responsible for routing and delivering messages between producers and consumers.                                                   |
| Event Bus                      | Allows components to publish events that multiple subscribers can independently consume.                                                      |
| Event Stream / Log             | Persistent ordered sequence of events optimized for high-throughput event processing. Kafka/Kinesis/Pulsar.                                   |
| Producer                       | Service that writes events/messages into a queue or stream.                                                                                   |
| Consumer / Worker              | Background process that reads messages and performs asynchronous work.                                                                        |
| Dead-Letter Queue — DLQ        | Stores messages that repeatedly fail processing so they can be inspected or retried later.                                                    |
| Job Scheduler                  | Executes work at specific times or intervals. Cron, Quartz, EventBridge Scheduler.                                                            |
| Background Worker              | Performs expensive/non-user-facing tasks asynchronously such as emails, image processing, or report generation.                               |
| Object Storage                 | Stores large blobs such as images, videos, backups, and files. S3/GCS/Azure Blob.                                                             |
| File Storage                   | Provides filesystem-like persistent storage. EFS/NFS.                                                                                         |
| Data Warehouse                 | Stores large historical datasets optimized for analytics instead of transactional workloads. Snowflake, BigQuery, Redshift.                   |
| Data Lake                      | Cheap storage for large amounts of structured and unstructured raw data. Often built on object storage.                                       |
| ETL / ELT Pipeline             | Moves and transforms operational data into analytical systems.                                                                                |
| Authentication Service         | Determines who the user is. Passwords, OAuth, OIDC, SSO, tokens.                                                                              |
| Authorization Service          | Determines what the user is allowed to do. RBAC, ABAC, permissions.                                                                           |
| Session Store                  | Stores user login/session state, often in Redis or a database.                                                                                |
| Secrets Manager                | Securely stores credentials, API keys, database passwords, encryption keys, etc.                                                              |
| KMS — Key Management Service   | Generates and manages encryption keys.                                                                                                        |
| TLS/SSL                        | Encrypts data traveling across networks.                                                                                                      |
| Container                      | Packages an application and dependencies into an isolated runtime. Docker.                                                                    |
| Container Orchestrator         | Deploys, restarts, scales, and manages containers across many machines. Kubernetes/ECS.                                                       |
| Virtual Machine                | Virtualized server running an operating system. EC2, Compute Engine.                                                                          |
| Serverless Function            | Executes code on demand without managing servers. Lambda, Cloud Functions.                                                                    |
| Autoscaler                     | Automatically increases/decreases application capacity based on traffic or resource usage.                                                    |
| Horizontal Scaling             | Adds more machines/instances. Usually the preferred scaling strategy.                                                                         |
| Vertical Scaling               | Gives one machine more CPU, RAM, or disk. Easy but has an upper limit.                                                                        |
| Health Check                   | Determines whether an instance is healthy enough to receive traffic.                                                                          |
| Heartbeat                      | Periodic signal showing that a service/node is still alive.                                                                                   |
| Failover                       | Automatically moves traffic/work to a healthy backup when a component fails.                                                                  |
| Multi-AZ Deployment            | Runs infrastructure across multiple availability zones to survive data-center failures.                                                       |
| Multi-Region Deployment        | Runs infrastructure geographically across regions for disaster recovery, global latency, or extreme availability.                             |
| Circuit Breaker                | Stops repeatedly calling an unhealthy downstream service to prevent cascading failures.                                                       |
| Retry                          | Re-attempts transient failures. Usually combined with exponential backoff and jitter.                                                         |
| Exponential Backoff            | Gradually increases delay between retries so recovering services aren't overwhelmed.                                                          |
| Timeout                        | Stops waiting for a downstream dependency after a bounded period. Essential for preventing resource exhaustion.                               |
| Bulkhead                       | Isolates resources so failure or overload in one subsystem doesn't consume everything.                                                        |
| Idempotency                    | Ensures retrying the same request doesn't accidentally perform the operation multiple times. Critical for payments/orders.                    |
| Distributed Lock               | Ensures only one distributed process performs a critical operation at a time. Redis/ZooKeeper/etc.                                            |
| Leader Election                | Selects one node to coordinate work among multiple distributed instances.                                                                     |
| Consensus System               | Allows distributed machines to agree on shared state despite failures. Raft/Paxos.                                                            |
| Coordination Service           | Provides leader election, configuration, locks, membership, etc. ZooKeeper/etcd.                                                              |
| Config Service                 | Centrally manages application configuration across environments and services.                                                                 |
| Feature Flag System            | Enables/disables functionality dynamically without redeploying code.                                                                          |
| Logging                        | Records application events and errors for debugging and auditing.                                                                             |
| Metrics                        | Numerical measurements such as request rate, latency, CPU, error rate, and queue depth.                                                       |
| Tracing                        | Tracks a request across multiple distributed services.                                                                                        |
| Distributed Tracing            | Correlates spans across microservices to identify where latency/errors occur. OpenTelemetry/Jaeger.                                           |
| Monitoring                     | Watches infrastructure and application health.                                                                                                |
| Alerting                       | Notifies engineers when metrics or failures cross meaningful thresholds.                                                                      |
| Observability Platform         | Combines logs, metrics, traces, dashboards, and alerts. Datadog/New Relic/Grafana.                                                            |
| Audit Log                      | Immutable-ish record of important actions, especially security/account/admin operations.                                                      |
| CI/CD Pipeline                 | Automatically builds, tests, and deploys software.                                                                                            |
| Container Registry             | Stores built container images. ECR, Docker Hub, GCR.                                                                                          |
| Infrastructure as Code         | Defines infrastructure in code so environments are reproducible. Terraform/CloudFormation.                                                    |
| Blue-Green Deployment          | Maintains old and new environments and switches traffic between them.                                                                         |
| Canary Deployment              | Sends a small percentage of traffic to a new version before full rollout.                                                                     |
| Rolling Deployment             | Gradually replaces old instances with new ones.                                                                                               |
| Database Migration System      | Safely changes database schemas across application versions.                                                                                  |
| Backup System                  | Periodically saves persistent data so it can be restored after corruption/failure.                                                            |
| Disaster Recovery              | Processes/infrastructure for recovering after catastrophic outages.                                                                           |
| API                            | Defined interface through which clients/services communicate. REST, GraphQL, RPC, etc.                                                        |
| REST                           | HTTP/resource-oriented API style; simple, ubiquitous, good for public APIs.                                                                   |
| GraphQL                        | Lets clients request exactly the fields they need. Useful for complex frontend data requirements.                                             |
| RPC / gRPC                     | Calls remote service methods as if they were functions; efficient for service-to-service communication.                                       |
| WebSocket                      | Persistent bidirectional connection. Useful for chat, collaboration, gaming, live dashboards.                                                 |
| Server-Sent Events             | Server continuously pushes updates to the browser over one HTTP connection. Simpler than WebSockets for one-way streaming.                    |
| Long Polling                   | Client keeps an HTTP request open until the server has an update. Older/simple approach to real-time communication.                           |

### The components that come up most often in interviews

If you're short on study time, prioritize these:

```text
Load balancer → distribute traffic.
Stateless application servers → horizontally scale compute.
SQL vs NoSQL databases → choose appropriate persistence.
Indexes → improve database read performance.
Replication / read replicas → availability + read scalability.
Sharding / partitioning → scale databases horizontally.
Redis/cache → lower latency and database load.
CDN → cache content geographically near users.
Message queue → asynchronous processing.
Kafka/event streaming → high-volume distributed event processing.
Object storage → images, videos, files.
Search engine → full-text/search workloads.
API gateway → centralized API routing/security/rate limiting.
Rate limiter → protect services from excessive traffic.
Workers → process background jobs.
Retries + timeout + circuit breaker → distributed-system resilience.
Monitoring/logging/tracing → production observability.
Autoscaling → dynamically adjust capacity.
Multi-AZ / replication → high availability.
Consistent hashing → distribute cache/shard keys while minimizing remapping.
```

### A common scalable architecture to keep in your head

```text
                  Users
                    │
                    ▼
                   DNS
                    │
                    ▼
              CDN / Edge / WAF
                    │
                    ▼
              Load Balancer
                    │
                    ▼
               API Gateway
                    │
          ┌─────────┴─────────┐
          ▼                   ▼
    App Server            App Server
          │                   │
          └─────────┬─────────┘
                    │
        ┌───────────┼──────────────┐
        │           │              │
        ▼           ▼              ▼
      Redis      Database      Message Queue
      Cache          │              │
                     │              ▼
               Read Replicas     Workers
                     │              │
                     │              ▼
                     │        External Services
                     │
             ┌───────┴───────┐
             ▼               ▼
        Object Storage     Search
```

The key interview mindset is not merely saying "I'll add Redis/Kafka/Kubernetes." Explain the problem each component solves. For example:

> "Reads are overwhelming the primary database, so I'd first add caching for hot objects and read replicas for queries that can tolerate replica lag."

That type of requirement → bottleneck → architectural component → tradeoff reasoning is what system-design interviewers are usually evaluating.

## 2. Ten high-yield architectures, a notification system, and the pattern behind them

> **Original question:** give me 10 more scalable architecture diagrams like the one above with usecase prompt to prepare for interview in an hour

Below are 10 high-yield system design interview architectures. These cover most patterns you are likely to encounter.

### 1. URL Shortener

**Prompt:**

> Design a scalable URL-shortening service like Bitly.

```text
             Users
               │
               ▼
          Load Balancer
               │
               ▼
          API Servers
          /          \
         /            \
        ▼              ▼
     Redis           Database
     Cache         URL Mappings
                       │
                       ▼
                 ID Generator
```

**Core flow:**

```text
POST /shorten creates shortCode -> longURL
GET /abc123 redirects to original URL
Cache popular mappings in Redis
Database is source of truth
Generate unique IDs using Snowflake/counter/random Base62
```

Main scalability topics: caching, ID generation, read-heavy traffic, database sharding.

### 2. Twitter / X News Feed

**Prompt:**

> Design a scalable social-media feed where users can post and follow other users.

```text
                    Users
                      │
                      ▼
                Load Balancer
                      │
                      ▼
                  API Gateway
                      │
          ┌───────────┼──────────┐
          ▼           ▼          ▼
      User Service Post Service Follow Service
          │           │          │
          ▼           ▼          ▼
       User DB      Post DB    Graph/Follow DB
                      │
                      ▼
                  Event Bus
                    Kafka
                      │
                      ▼
               Feed Workers
                      │
                      ▼
                 Feed Cache
                   Redis
                      │
                      ▼
                Feed Service
```

**Core idea:** fan-out on write.

When someone posts:

```text
Post
 │
 ▼
Kafka
 │
 ▼
Feed Workers
 │
 ├── add post to follower A feed
 ├── add post to follower B feed
 └── add post to follower C feed
```

For celebrities with millions of followers, use fan-out on read or a hybrid.

**Main topics:** Kafka, caching, denormalization, fan-out, celebrity problem.

### 3. Instagram / Image Sharing

**Prompt:**

> Design Instagram where users upload images and browse feeds.

```text
                    Users
                      │
                      ▼
                     CDN
                      │
                      ▼
                Load Balancer
                      │
                      ▼
                 API Servers
                 /         \
                ▼           ▼
           Metadata DB    Object Storage
                          S3
                            │
                            ▼
                           CDN
```

Upload:

```text
User
 │
 ▼
API
 │
 ▼
S3
 │
 ▼
Queue
 │
 ▼
Image Workers
 │
 ├── thumbnails
 ├── compression
 └── moderation
```

Store only metadata in DB:

```text
Post
- post_id
- user_id
- image_url
- caption
- created_at
```

Images themselves go into object storage, not SQL.

**Main topics:** CDN, S3, async image processing, metadata database, presigned uploads.

### 4. YouTube / Video Streaming

**Prompt:**

> Design a scalable video-upload and streaming platform.

```text
                       User
                        │
                        ▼
                  Upload Service
                        │
                        ▼
                  Object Storage
                        │
                        ▼
                     Queue
                        │
                        ▼
              Transcoding Workers
              /       |        \
             ▼        ▼         ▼
           360p      720p      1080p
             \        |         /
              └───────┼────────┘
                      ▼
                Object Storage
                      │
                      ▼
                     CDN
                      │
                      ▼
                    Viewer
```

Separate metadata:

```text
API
 │
 ▼
Metadata DB
 │
 ├── title
 ├── description
 ├── uploader
 └── video locations
```

**Main topics:** asynchronous processing, CDN, object storage, transcoding, chunked video/HLS.

### 5. WhatsApp / Real-Time Chat

**Prompt:**

> Design a real-time messaging application supporting millions of concurrent users.

```text
                User A
                  │
             WebSocket
                  │
                  ▼
           Gateway Servers
                  │
                  ▼
            Chat Service
             /        \
            ▼          ▼
        Message DB   Redis
                     Presence
                       │
                       ▼
                    Kafka
                       │
                       ▼
                Delivery Workers
                       │
                       ▼
                Gateway Server
                       │
                  WebSocket
                       │
                       ▼
                    User B
```

If B is offline:

```text
Message
   │
   ▼
Message DB
   │
   ▼
Push Notification Service
   │
   ▼
APNs / FCM
```

**Main topics:** WebSockets, connection management, message ordering, delivery/read receipts, presence, Kafka.

### 6. Uber / Lyft

**Prompt:**

> Design a ride-sharing system that matches riders with nearby drivers.

```text
                Rider App
                    │
                    ▼
                API Gateway
                    │
                    ▼
              Ride Service
                    │
                    ▼
             Matching Service
                    │
           ┌────────┴─────────┐
           ▼                  ▼
      Redis / Geo Index    Driver Service
           │                  │
           ▼                  ▼
     Nearby Drivers       Driver DB
```

```text
Driver App
    │
    ▼
Location Gateway
    │
    ▼
Kafka / Stream
    │
    ▼
Location Service
    │
    ▼
Redis Geo Index
```

Driver locations update continuously.

Typical geo options:

- Geohash
- H3
- S2
- Redis GEO

**Main topics:** geospatial indexing, real-time events, WebSockets, eventual consistency, high write throughput.

### 7. Amazon / E-Commerce Checkout

**Prompt:**

> Design an e-commerce platform that supports browsing, carts, inventory, and checkout.

```text
                       User
                        │
                        ▼
                    API Gateway
                        │
          ┌─────────────┼──────────────┐
          ▼             ▼              ▼
      Catalog        Cart Service   Order Service
      Service            │              │
          │               ▼              ▼
          ▼             Redis         Order DB
      Product DB                         │
                                        ▼
                                 Inventory Service
                                        │
                                        ▼
                                 Payment Service
                                        │
                                        ▼
                                   Payment API
```

Order events:

```text
Order Created
     │
     ▼
    Kafka
     │
 ┌───┼──────────┐
 ▼   ▼          ▼
Email Inventory Shipping
```

Critical flow:

```text
Inventory reserve
      ↓
Payment
      ↓
Create order
      ↓
Confirm inventory
```

Use Saga pattern for distributed transactions.

**Main topics:** transactions, idempotency, inventory race conditions, Saga, queues.

### 8. Ticketmaster / Flash-Sale Ticketing

Very relevant to your TicketSocket experience.

**Prompt:**

> Design a ticketing system where millions of users may try to purchase limited inventory simultaneously.

```text
                     Millions of Users
                            │
                            ▼
                          CDN
                            │
                            ▼
                     Waiting Room
                            │
                            ▼
                       Rate Limiter
                            │
                            ▼
                      Load Balancer
                            │
                            ▼
                      Ticket API
                            │
                ┌───────────┴──────────┐
                ▼                      ▼
             Redis                 Ticket DB
        Availability Cache       Source of Truth
                │
                ▼
          Reservation Service
                │
                ▼
           Distributed Lock
                │
                ▼
           Checkout Service
                │
                ▼
          Payment Provider
```

Reservation model:

```text
AVAILABLE
   │
   ▼
HELD for 5 minutes
   │
 ┌─┴─────┐
 ▼       ▼
SOLD   AVAILABLE
```

Avoid overselling using:

- atomic DB updates
- optimistic locking
- distributed locks
- reservation expiration

**Main topics:** extreme bursts, concurrency, rate limiting, queues, locking, idempotency.

### 9. Google Drive / Dropbox

**Prompt:**

> Design a distributed file-storage and synchronization service.

```text
                    Client
                      │
                      ▼
                API Gateway
                      │
            ┌─────────┴──────────┐
            ▼                    ▼
      Metadata Service       Upload Service
            │                    │
            ▼                    ▼
        Metadata DB          Chunk Service
                                 │
                                 ▼
                           Object Storage
                                 │
                                 ▼
                            Replication
```

```text
File Changed
     │
     ▼
Event Bus
     │
     ▼
Sync Service
     │
     ▼
Other Devices
```

Large files get chunked:

```text
File
 │
 ├── Chunk 1
 ├── Chunk 2
 ├── Chunk 3
 └── Chunk 4
```

Hash chunks to enable deduplication.

**Main topics:** chunking, synchronization, versioning, deduplication, conflict resolution.

### 10. Search Engine / Elasticsearch-Style Search

**Prompt:**

> Design a search system supporting millions of documents and low-latency queries.

```text
                   Data Producers
                        │
                        ▼
                      Kafka
                        │
                        ▼
                  Index Workers
                        │
                        ▼
                Search Index Cluster
              ┌─────────┼─────────┐
              ▼         ▼         ▼
           Shard 1    Shard 2   Shard 3
              │         │         │
              └─────────┼─────────┘
                        ▼
                 Search Service
                        │
                        ▼
                     Redis
                     Cache
                        │
                        ▼
                      User
```

Query:

```text
"senior software engineer"
          │
          ▼
      Coordinator
          │
   ┌──────┼──────┐
   ▼      ▼      ▼
Shard1  Shard2  Shard3
   │      │      │
   └──────┼──────┘
          ▼
        Merge
          │
          ▼
       Rank Top K
```

**Main topics:** inverted indexes, partitioning/sharding, ranking, caching, eventual indexing consistency.

### Bonus: Notification System

This is another extremely common interview question.

**Prompt:**

> Design a notification service capable of delivering email, SMS, and push notifications at large scale.

```text
             Application Services
                     │
                     ▼
              Notification API
                     │
                     ▼
                   Kafka
                     │
          ┌──────────┼───────────┐
          ▼          ▼           ▼
      Email Queue  SMS Queue   Push Queue
          │          │           │
          ▼          ▼           ▼
       Workers     Workers      Workers
          │          │           │
          ▼          ▼           ▼
       SendGrid    Twilio      APNs / FCM
```

Add:

```text
Redis
  │
  ├── rate limits
  ├── deduplication
  └── user preferences

DLQ
 │
 └── failed notifications
```

### The pattern you should recognize in almost every interview

Most scalable systems eventually resemble this:

```text
                         Users
                           │
                           ▼
                    DNS / CDN / WAF
                           │
                           ▼
                     Load Balancer
                           │
                           ▼
                      API Gateway
                           │
                ┌──────────┼───────────┐
                │          │           │
                ▼          ▼           ▼
            Service A   Service B   Service C
                │          │           │
                └──────┬───┴───────────┘
                       │
          ┌────────────┼─────────────┐
          ▼            ▼             ▼
        Redis       Database       Kafka
        Cache          │             │
                       │             ▼
                 Read Replicas     Workers
                       │             │
                       │             ▼
                 Search/S3     External APIs
```

The interviewer then changes which part is difficult.

| Problem                 | Component/pattern you should immediately think about |
| ----------------------- | ---------------------------------------------------- |
| Too many reads          | Cache + read replicas                                |
| Too many writes         | Partition/shard DB + async writes                    |
| Traffic spikes          | Load balancer + autoscaling + queue                  |
| Slow expensive work     | Queue + workers                                      |
| Huge images/videos      | S3 + CDN                                             |
| Real-time communication | WebSockets                                           |
| Millions of events      | Kafka                                                |
| Limited inventory       | locking + atomic transactions                        |
| Duplicate requests      | idempotency key                                      |
| Database too large      | sharding                                             |
| Search                  | Elasticsearch/OpenSearch                             |
| Nearby objects          | geospatial index / geohash                           |
| Global users            | CDN + multi-region                                   |
| Service failures        | timeouts + retries + circuit breakers                |
| Downstream overload     | rate limiting + backpressure                         |
| System visibility       | logs + metrics + traces                              |

### For your interview in one hour, memorize this sequence

When they say:

> "Design X."

Walk through this exact process:

```text
1. Clarify requirements
        ↓
2. Estimate scale
        ↓
3. Define APIs
        ↓
4. Define data model
        ↓
5. Draw high-level architecture
        ↓
6. Identify bottlenecks
        ↓
7. Add scaling mechanisms
        ↓
8. Discuss failures + consistency
        ↓
9. Discuss tradeoffs
```

And think:

```text
CLIENT
  ↓
LOAD BALANCER
  ↓
STATELESS SERVICES
  ↓
 ┌───────────┬───────────┐
 ▼           ▼           ▼
CACHE       DB          QUEUE
             │           │
             ▼           ▼
         REPLICAS      WORKERS

+ CDN if large/static content
+ S3 if files
+ Kafka if events
+ WebSocket if realtime
+ Search engine if search
+ Sharding if DB becomes huge
```

If you can confidently draw and explain the 10 architectures above, you will have seen the core architecture behind a very large percentage of system-design interview questions.

## 3. SQL vs NoSQL, database indexes, and Kafka event streaming

> **Original question:** sql vs nosql use cases, indexes use cases (and are these their own server or index in database?) what are some examples of Kafka/event streaming (is pub/sub ? if so how to determine topics/groups)

Yes—these are exactly the distinctions interviewers often probe.

### 1. SQL vs. NoSQL — when to use each

#### SQL — PostgreSQL, MySQL, SQL Server

Think:

Relationships + transactions + consistency

Use SQL when data has clear relationships and correctness matters.

```text
Users
  │
  ├── Orders
  │     └── OrderItems
  │
  └── Payments
```

Good use cases:

| Use case                   | Why SQL                             |
| -------------------------- | ----------------------------------- |
| Payments                   | ACID transactions                   |
| Banking                    | Strong consistency                  |
| Orders / checkout          | Transactions across related records |
| Inventory                  | Prevent overselling                 |
| User/account systems       | Structured relationships            |
| SaaS/business applications | Lots of relational data             |
| Ticket reservations        | Atomic inventory updates            |
| Reporting requiring JOINs  | Relational querying                 |

Example:

```text
users
orders
order_items
payments
```

You can easily ask:

```sql
SELECT *
FROM orders
JOIN users ON orders.user_id = users.id
WHERE users.id = 123;
```

#### NoSQL — MongoDB, DynamoDB, Cassandra

Think:

Massive scale + simple access patterns + flexible data model

Good use cases:

| Use case                       | Typical choice       |
| ------------------------------ | -------------------- |
| User sessions                  | Redis / DynamoDB     |
| Product catalog                | MongoDB / DynamoDB   |
| Activity/event data            | Cassandra            |
| IoT data                       | Cassandra / DynamoDB |
| Huge key-value lookup workload | DynamoDB             |
| Flexible JSON documents        | MongoDB              |
| Very high write throughput     | Cassandra            |
| Feed/timeline storage          | Cassandra/DynamoDB   |

Example document:

```json
{
  "userId": 123,
  "name": "Oscar",
  "preferences": {
    "theme": "dark",
    "notifications": true
  }
}
```

No joins required.

#### Interview shortcut

Ask yourself:

```text
Do I need:
transactions?
relationships?
joins?
strict consistency?

YES
 ↓
SQL

Do I primarily need:
huge horizontal scale?
very high throughput?
key-based lookups?
flexible schema?

YES
 ↓
NoSQL
```

But don't say:

> "SQL doesn't scale."

That's generally wrong.

PostgreSQL/MySQL can scale very far with:

- indexes
- caching
- read replicas
- partitioning
- sharding

A strong interview answer is:

> "I'd start with PostgreSQL unless the access patterns or scale give me a concrete reason to choose a specialized NoSQL database."

### 2. Database indexes

An index normally lives inside the database, not on its own server.

Suppose you have:

```text
users
--------------------------------
id
email
name
created_at
country
```

And frequently execute:

```sql
SELECT *
FROM users
WHERE email = 'a@example.com';
```

Without an index:

```text
Scan row 1
Scan row 2
Scan row 3
...
Scan row 100,000,000
```

Potentially O(n).

Create:

```sql
CREATE INDEX idx_users_email
ON users(email);
```

The DB maintains a separate data structure roughly like:

```text
              [M]
             /   \
          [F]     [T]
         /  \     / \
        A    H   P   Z
```

Typically a B-tree/B+ tree.

Then:

```text
email
  ↓
index
  ↓
location of row
  ↓
actual row
```

Much faster lookup—roughly logarithmic rather than scanning the whole table.

#### Common index use cases

##### Exact lookup

```sql
WHERE email = ?
```

Index:

```text
email
```

##### Range queries

```sql
WHERE created_at
BETWEEN X AND Y
```

Index:

```text
created_at
```

B-tree indexes are especially useful here.

##### Sorting

```sql
ORDER BY created_at DESC
```

An appropriate index can avoid an expensive sort.

##### JOINs

```sql
orders.user_id = users.id
```

Index foreign/reference columns frequently used in joins:

```text
orders.user_id
```

##### Composite indexes

Suppose this is common:

```sql
SELECT *
FROM orders
WHERE user_id = ?
AND status = ?
ORDER BY created_at DESC;
```

You might create:

```text
(user_id, status, created_at)
```

Important interview point:

Index column order matters.

For:

```text
(user_id, status, created_at)
```

it is particularly useful for queries beginning with:

```text
user_id
user_id + status
user_id + status + created_at
```

This is often called the leftmost-prefix principle.

### 3. Why not index everything?

Because indexes accelerate reads but add cost to writes.

```text
INSERT order

        │
        ├── update table
        ├── update index A
        ├── update index B
        └── update index C
```

Indexes consume:

- storage
- RAM/cache
- additional INSERT work
- additional UPDATE work
- additional DELETE work

So:

Index columns based on actual query/access patterns.

### 4. Is Elasticsearch/OpenSearch also an "index"?

Yes, but this is a different concept.

#### Database index

```text
PostgreSQL
   │
   ├── Table
   ├── B-tree index
   └── Hash/etc index
```

Part of the database.

#### Search index

```text
PostgreSQL
     │
     │ events / CDC
     ▼
Elasticsearch
     │
     ▼
Inverted Search Index
```

Elasticsearch/OpenSearch is typically a separate distributed service/cluster.

It's designed for:

> "find documents containing:
> senior software engineer AWS"

rather than normal relational lookup.

Its inverted index is conceptually:

```text
software → docs 1, 5, 7, 10
engineer → docs 1, 2, 7
AWS      → docs 1, 8, 9
```

So:

```text
DB index
→ optimize DB queries

Search index
→ optimize full-text/search/ranking
```

### 5. Kafka / event streaming

Kafka is an event-streaming platform.

And yes, it supports a publish/subscribe-style architecture, but its model is somewhat richer than a simple pub/sub system.

Basic idea:

```text
Producer
   │
   │ publish
   ▼
 Kafka Topic
   │
   ├──── Consumer A
   ├──── Consumer B
   └──── Consumer C
```

Example:

```text
Order Service
      │
      │ OrderCreated
      ▼
orders topic
      │
      ├── Inventory Service
      ├── Email Service
      ├── Analytics Service
      └── Fraud Service
```

Each independently reacts to the same event.

### 6. Real Kafka example

Imagine Amazon checkout:

```text
               Order Service
                     │
                     │
               OrderCreated
                     ▼
               Kafka: orders
                     │
        ┌────────────┼─────────────┐
        ▼            ▼             ▼
   Inventory       Email        Analytics
    Service       Service        Service
```

Another topic:

```text
Payment Service
      │
      │ PaymentCompleted
      ▼
Kafka: payments
      │
      ├── Order Service
      ├── Accounting
      ├── Fraud Detection
      └── Analytics
```

Another:

```text
Shipment Service
      │
      ▼
Kafka: shipments
      │
      ├── Notifications
      ├── Tracking
      └── Analytics
```

So topics commonly represent streams of related domain events.

### 7. How do I determine Kafka topics?

Think:

What category/domain of events forms a useful independent stream?

Good:

- orders
- payments
- shipments
- user-events
- inventory-events

Potential events within orders:

- OrderCreated
- OrderCancelled
- OrderShipped
- OrderCompleted

You don't necessarily need:

- order-created-topic
- order-cancelled-topic
- order-shipped-topic

That can create excessive topic proliferation.

Instead:

```text
orders
   │
   ├── OrderCreated
   ├── OrderCancelled
   └── OrderUpdated
```

and consumers inspect event type.

Topic boundaries are generally driven by:

- domain ownership
- retention requirements
- throughput
- permissions/security
- ordering requirements
- consumer patterns

### 8. Kafka partitions

A topic is divided into partitions for scalability.

```text
                 orders topic

         ┌──────────┬──────────┬──────────┐
         ▼          ▼          ▼
     Partition 0 Partition 1 Partition 2

       Broker A    Broker B    Broker C
```

This allows multiple brokers and consumers to process events concurrently.

### 9. How do you choose the partition key?

This is one of the most important Kafka interview concepts.

Suppose events are:

- OrderCreated
- OrderUpdated
- OrderCancelled

You probably need events for one order to stay ordered.

Use:

```text
key = orderId
```

Kafka hashes:

```text
hash(orderId)
      │
      ▼
partition
```

Therefore:

```text
order 123 Created
order 123 Updated
order 123 Cancelled
```

all reach:

```text
Partition 2
```

and preserve ordering.

Other examples:

```text
User events
key = userId

Payment events
key = paymentId

Account transactions
key = accountId

Device events
key = deviceId
```

The rule:

Pick a partition key corresponding to the entity for which ordering matters.

### 10. What is a consumer group?

This is critical.

Suppose you have:

```text
orders topic

P0
P1
P2
P3
```

Inventory Service needs to process all orders.

Instead of one server:

```text
Inventory Consumer
```

you run four:

```text
Consumer Group: inventory

Consumer 1 ← P0
Consumer 2 ← P1
Consumer 3 ← P2
Consumer 4 ← P3
```

Now work is parallelized.

#### Consumers within the SAME group

They share the workload.

```text
               Topic
                 │
       ┌─────────┼─────────┐
       ▼         ▼         ▼
       P0        P1        P2
       │         │         │
       ▼         ▼         ▼
 Consumer 1 Consumer 2 Consumer 3

     inventory-service group
```

Each event is handled by one consumer in that group.

### 11. Different consumer groups = pub/sub

Now consider:

```text
orders
  │
  ├── Inventory Group
  ├── Analytics Group
  └── Email Group
```

Each group receives the entire stream independently.

```text
                     orders
                       │
        ┌──────────────┼─────────────┐
        ▼              ▼             ▼
Inventory Group   Email Group   Analytics Group

C1 C2 C3          C1 C2          C1 C2 C3
```

That's how Kafka combines:

#### Queue behavior

Inside one consumer group:

Consumers divide work.

#### Pub/sub behavior

Across different consumer groups:

Every group independently gets the events.

This distinction is worth memorizing.

### 12. Topic vs partition vs consumer group

Use this mental model:

```text
TOPIC
"What type of events are these?"

orders


PARTITION
"How do we horizontally scale and preserve
ordering for an entity?"

orders P0
orders P1
orders P2


CONSUMER GROUP
"What independent application/job
needs to process these events?"

inventory-service
email-service
analytics-service
```

### 13. Example interview architecture

Suppose interviewer says:

> Design an e-commerce order-processing system.

You might draw:

```text
                       User
                        │
                        ▼
                   Order API
                        │
                        ▼
                   PostgreSQL
                        │
                   OrderCreated
                        ▼
                  Kafka: orders
                        │
          ┌─────────────┼───────────────┐
          │             │               │
          ▼             ▼               ▼
     Inventory       Payment        Analytics
       Group           Group           Group
          │             │
          ▼             ▼
     Inventory DB   Payment API
```

Partition:

```text
Kafka topic: orders

key = orderId

        hash(orderId)
             │
      ┌──────┼──────┐
      ▼      ▼      ▼
     P0     P1      P2
```

Scale inventory processing:

```text
Consumer Group: inventory

P0 → inventory-worker-1
P1 → inventory-worker-2
P2 → inventory-worker-3
```

### 14. Kafka vs normal message queue

This is also likely to come up.

|                                | Kafka            | SQS/RabbitMQ-style queue      |
| ------------------------------ | ---------------- | ----------------------------- |
| Main abstraction               | Event log/stream | Message queue                 |
| Message retained after read?   | Yes              | Usually consumed/deleted      |
| Replay old events?             | Yes              | Usually not the primary model |
| Multiple independent consumers | Excellent        | Possible, but different model |
| Huge throughput                | Excellent        | Good                          |
| Ordering                       | Per partition    | Depends on queue/type         |
| Event sourcing/analytics       | Excellent        | Less suited                   |
| Background jobs                | Can work         | Often simpler/better          |

Example:

#### Queue

```text
User uploads image
       │
       ▼
      SQS
       │
       ▼
Image Processor
```

You just need the job processed.

#### Kafka

```text
OrderPlaced
    │
    ▼
 Kafka
    │
    ├── Inventory
    ├── Fraud
    ├── Analytics
    ├── Notifications
    └── Data Warehouse
```

Many systems need to independently react, and you may want to replay history.

### Interview cheat sheet

Memorize these four statements:

#### SQL

> "I choose SQL when relational integrity, transactions, joins, and strong consistency are important."

#### NoSQL

> "I choose NoSQL when the access patterns are simple and I need massive horizontal scalability, high throughput, or a flexible data model."

#### Indexes

> "Indexes are usually data structures maintained inside the database that trade additional storage and write overhead for much faster reads."

#### Kafka

> "Kafka stores ordered event streams in topics. Topics are split into partitions for horizontal scale, a partition key preserves ordering for an entity, consumers within a group divide the work, and separate consumer groups independently receive the stream."

That last sentence alone covers topics + partitions + keys + consumer groups + pub/sub very well in a system-design interview.

## 4. Cassandra and wide-column databases

> **Original question:** what is cassandra and wide column db

Cassandra is a distributed NoSQL wide-column database designed for huge scale, high write throughput, and high availability.

A wide-column database stores data in rows, but unlike a traditional SQL table, each row can have a flexible set of columns and is physically organized around a partition key and clustering columns.

Think of it like this:

```text
SQL table
--------------------------------
user_id | name | email | age
1       | Bob  | ...   | 30
2       | Sue  | ...   | 25
```

Cassandra is closer to:

```text
Partition: user_123

timestamp       event_type      data
------------------------------------------
10:00:01        login           ...
10:01:12        page_view       ...
10:02:45        purchase        ...
10:05:20        logout          ...
```

The key idea is that Cassandra is optimized around known access patterns, not arbitrary joins.

### Why use Cassandra?

It's especially good when you have:

- massive write volume
- data spread across many servers
- very large datasets
- high availability requirements
- predictable queries by key
- time-series/event-style data

Common examples:

- IoT sensor events
- clickstream/activity logs
- messaging history
- user timelines
- metrics
- telemetry
- large event streams

For example:

```text
Millions of devices
       │
       ▼
     Kafka
       │
       ▼
   Cassandra
       │
       ├── Device A events
       ├── Device B events
       └── Device C events
```

Cassandra distributes partitions automatically across nodes:

```text
                Cassandra Cluster

          ┌────────┬────────┬────────┐
          ▼        ▼        ▼
        Node A   Node B   Node C

user1      ✓        ✓
user2               ✓        ✓
user3      ✓                 ✓
```

Data is replicated, so if one node dies, other replicas can continue serving requests.

### Why is it called "wide-column"?

Because one partition can contain a very large number of related rows/columns, often ordered by a clustering key.

Example schema:

```sql
CREATE TABLE user_events (
    user_id UUID,
    timestamp TIMESTAMP,
    event_type TEXT,
    data TEXT,
    PRIMARY KEY (user_id, timestamp)
);
```

Here:

```text
user_id
   ↓
Partition key
```

Determines which Cassandra nodes store the data.

```text
timestamp
   ↓
Clustering column
```

Determines ordering inside that partition.

So querying:

```sql
SELECT *
FROM user_events
WHERE user_id = 123;
```

is extremely efficient because Cassandra knows exactly which partition contains the data.

But doing:

```sql
SELECT *
FROM user_events
WHERE event_type = 'purchase';
```

may be inefficient unless you explicitly designed another table around that query.

This leads to an important Cassandra principle:

> Design your tables around your queries.

Unlike SQL:

```text
SQL:
model the relationships
→ query them later

Cassandra:
know the queries first
→ design tables specifically for them
```

### Cassandra vs PostgreSQL

|                         | PostgreSQL                | Cassandra                  |
| ----------------------- | ------------------------- | -------------------------- |
| Type                    | Relational                | Wide-column NoSQL          |
| JOINs                   | Excellent                 | Generally no               |
| Transactions            | Strong ACID               | Limited compared with SQL  |
| Complex queries         | Excellent                 | Poor fit                   |
| Horizontal scaling      | Harder                    | Built-in                   |
| Massive writes          | Good                      | Excellent                  |
| Multi-node distribution | Added architecture        | Core design                |
| Schema design           | Normalize data            | Often denormalize          |
| Query flexibility       | High                      | Low                        |
| Best for                | Business/transaction data | Huge distributed workloads |

A useful interview example:

```text
E-commerce

Orders + payments + inventory
        ↓
   PostgreSQL

Billions of click events
        ↓
    Cassandra
```

### Cassandra vs MongoDB

MongoDB stores documents:

```json
{
  "user": 123,
  "name": "Bob",
  "orders": [...]
}
```

Cassandra stores data optimized around partitioned access patterns:

```text
user_id = 123
      │
      ├── event 1
      ├── event 2
      ├── event 3
      └── event 4
```

So the interview-level summary is:

> Cassandra is a distributed wide-column NoSQL database built for extremely high write throughput, horizontal scaling, replication, and availability. It's best when you have massive datasets and predictable key-based access patterns, but it's a poor choice when you need joins, arbitrary querying, or complex transactions.

## 5. Explaining security at TicketSocket: Auth0 identity federation and merchant payment processors

> **Original question:** How do i explain in an interview how i handled security for users? For example in ticketsocket where we had onboarded clients using our white label software, where they wanted the users from their application to be able to use their same credentials to login to the application branded to their company that was ticketsocket white label software (I remember we used Auth0). Also how would security be handled for merchant payment processors since each merchant had a different payment processor they wanted to use to process tickets through ticket socket event and ticket management software

You can explain this as two different security problems:

- End-user identity federation — letting a merchant’s existing users log into the white-label TicketSocket application with the same credentials.
- Merchant payment credentials — securely connecting each merchant’s TicketSocket tenant to that merchant’s chosen payment processor.

For the interview, I’d keep those separate because the trust boundaries are different.

> At TicketSocket, security had two important tenant-specific concerns: authenticating the merchant's end users into our white-label application, and securely integrating each merchant's own payment processor.
>
> For customer authentication, we used Auth0 as the identity layer. Because TicketSocket was white-labeled, a merchant might already have its own customer identity system and wanted those same users to access the TicketSocket-powered experience without creating another account.
>
> The pattern was identity federation. TicketSocket trusted Auth0, and Auth0 could be configured with the merchant's identity provider using a standard protocol such as OpenID Connect or SAML. From the customer's perspective, they authenticated using the merchant's normal credentials. After successful authentication, Auth0 issued tokens that our application could validate.
>
> The access token contained the authenticated user's identity and relevant claims, and our APIs verified the token's signature, issuer, audience, expiration, and authorization claims before serving protected resources. We also associated the user with the correct merchant or tenant so a user authenticated through one white-label client could not cross tenant boundaries and access another merchant's data.
>
> The backend remained largely stateless for authentication because services could verify signed tokens rather than maintaining a server-side login session for every request. Authorization still happened at the application layer—for example, verifying that the authenticated user was actually allowed to access a particular order or ticket.
>
> Payment integrations were a separate security boundary. Each merchant could use a different processor, such as Square or another provider, so we treated payment credentials as tenant-scoped secrets rather than application-wide configuration.
>
> The merchant configuration identified which payment-provider adapter to use, while credentials or OAuth tokens were stored securely and retrieved only by the payment service when necessary. We would never expose those credentials to the frontend or place them directly in normal application configuration or logs.
>
> The architecture was roughly:

```text
Client → TicketSocket API → Payment Service → Merchant-specific provider adapter → Square/other processor.
```

> The payment service selected the appropriate provider based on the merchant configuration. Provider-specific code was isolated behind a common interface, which gave the rest of TicketSocket one consistent payment API even though the underlying processors differed.
>
> For card security, the preferred model is to let the processor tokenize the card information so TicketSocket handles a payment token rather than storing raw card numbers. That reduces PCI exposure and limits the amount of sensitive payment data inside our system.
>
> Incoming payment webhooks were also treated as untrusted internet traffic. We verified the provider's webhook signature, deduplicated events using the provider event or transaction ID, and processed state changes idempotently so retries couldn't create duplicate charges, refunds, or order transitions.
>
> So the general security model was: federated identity for end users, strict tenant isolation in authorization, securely scoped merchant credentials for payment providers, tokenization for card data, signed webhook verification, and idempotent processing for payment events.

A few details are worth understanding technically so you can answer follow-ups.

### 1. White-label authentication with Auth0

Suppose TicketSocket hosts:

```text
tickets.merchant-a.com
tickets.merchant-b.com
```

Merchant A already has:

```text
accounts.merchant-a.com
```

You don't want:

```text
Merchant A credentials
        ↓
copied into TicketSocket DB
```

Instead:

```text
                     Merchant A Identity Provider
                    /     OIDC / SAML
                   /
Customer → TicketSocket → Auth0
                             │
                             │ signed tokens
                             ▼
                     TicketSocket APIs
```

Auth0 acts as the identity broker.

Conceptually:

```text
Merchant A IdP ─┐
Merchant B IdP ─┼──→ Auth0 ───→ TicketSocket
Merchant C IdP ─┘
```

Each merchant can have its own upstream authentication system while TicketSocket has one normalized authentication model.

That is an excellent architecture pattern to mention:

> “We normalized multiple customer identity systems behind Auth0 rather than teaching every TicketSocket service how to authenticate against every merchant's identity provider.”

### 2. The JWT might contain tenant context

You might conceptually have claims like:

```json
{
  "sub": "user-92831",
  "tenant_id": "merchant-a",
  "aud": "ticketsocket-api",
  "iss": "https://auth.example.com/",
  "exp": 1793424600
}
```

Then the backend doesn't merely do:

```sql
WHERE order.user_id = user123
```

It should enforce something like:

```sql
WHERE
    tenant_id = merchantA
AND user_id = user123
```

This is multi-tenant isolation.

For a white-label SaaS platform, this is one of the most important security concepts to emphasize.

```text
Authenticated
≠
authorized
```

Authentication says:

> This is user 123.

Authorization says:

> User 123 belongs to Merchant A
> and is allowed to access Merchant A order 456.

### 3. Don't claim an exact Auth0 configuration you don't remember

Since you remember Auth0 but may not remember whether each client specifically used Auth0 Connections, Organizations, SAML, OIDC, a custom DB connection, etc., don't overstate it.

A safe interview formulation is:

> “We used Auth0 as the identity abstraction for the white-label application. Depending on the client's existing identity system, that could be federated through a standard OIDC/SAML connection. I don't remember the exact connection type used by every merchant, but the architectural goal was that TicketSocket trusted Auth0-issued identity rather than managing each client's credentials ourselves.”

That is better than confidently inventing an implementation detail.

### Payment processors: think “tenant-scoped provider adapters”

A clean architecture is:

```text
                         TicketSocket
                              │
                    Checkout / Order API
                              │
                              ▼
                       Payment Service
                              │
                 merchant_id = merchantA
                              │
                              ▼
                     Merchant Config
                              │
                  provider = Square
                              │
                              ▼
                        Secret Manager
                              │
                              ▼
                       Square Adapter
                              │
                              ▼
                         Square API
```

Another merchant:

```text
merchantB
   ↓
provider = Stripe
   ↓
Stripe Adapter
```

Another:

```text
merchantC
   ↓
provider = Authorize.Net
   ↓
Authorize.Net Adapter
```

Application code can expose a common contract:

```ts
interface PaymentProvider {
  authorize(...)
  capture(...)
  refund(...)
  void(...)
}
```

Then:

```text
Payment Service
    │
    ├── SquareProvider
    ├── StripeProvider
    └── OtherProvider
```

This is basically the Strategy/Adapter pattern, and it is very relevant to your TicketSocket experience.

#### How credentials should be secured

Not:

```text
merchant table

square_api_key = "secret123"
```

in plaintext.

Prefer:

```text
Merchant Config DB
provider = square
secret_reference = secret/merchantA/square
                         │
                         ▼
                  Secrets Manager
                         │
                         ├── OAuth access token
                         ├── refresh token
                         └── webhook secret
```

Encrypt at rest with KMS or equivalent and restrict access so only the payment service's identity can retrieve payment secrets.

That gives:

```text
Frontend                  ✗
Order-history service     ✗
Analytics                 ✗
Payment Service           ✓
```

This is least privilege.

#### If the processor supports OAuth

For something like a processor where merchants authorize your platform:

```text
Merchant
   ↓
"Connect Square"
   ↓
Square OAuth
   ↓
authorization code
   ↓
TicketSocket backend
   ↓
access + refresh tokens
   ↓
encrypted secret storage
```

Then TicketSocket does not need the merchant to manually hand over a password.

And importantly:

- Customer password
- Merchant payment credentials
- Card information

are three completely different secret types with different owners and lifecycle rules.

#### Card data

A strong interview answer should mention PCI scope.

Ideally:

```text
Browser
   │
   │ card details
   ▼
Square hosted SDK / payment component
   │
   ▼
Square
   │
   │ payment token
   ▼
TicketSocket backend
```

Rather than:

```text
Browser
   ↓
TicketSocket server
   ↓
store raw card number
```

The processor tokenizes the card.

TicketSocket sees something like:

```text
payment_method_token = xyz
```

not:

```text
4111 1111 1111 1111
```

That significantly limits exposure of cardholder data.

#### Square webhook security

This connects directly to the high-throughput architecture you've been discussing.

```text
Square
   │
   │ webhook
   ▼
Webhook Endpoint
   │
   ├── verify signature
   ├── validate merchant/provider
   ├── check event ID
   └── enqueue
          │
          ▼
      Kafka/SQS
          │
          ▼
      Consumers
```

Do not trust:

```http
POST /square/webhook
```

simply because the payload says:

```json
{
  "payment_status": "COMPLETED"
}
```

Anyone could POST that.

You need:

```text
payload + Square signature + shared verification secret
                      ↓
                 verification
                      ↓
                     valid?
```

Only then process it.

And still assume duplicate delivery:

```text
event abc123
event abc123
event abc123
```

so:

```text
provider_event_id = abc123
```

becomes an idempotency/deduplication key.

### Payment authorization needs multiple layers

For something like:

```http
POST /orders/123/refund
```

you would want:

```text
JWT valid?
     ↓
user/merchant authorized?
     ↓
does order belong to this tenant?
     ↓
does role allow refund?
     ↓
is refund state transition valid?
     ↓
call payment processor
```

For an administrative TicketSocket user, you might use RBAC:

```text
cashier
→ sell tickets

manager
→ sell + refund

merchant admin
→ configuration + reporting

TicketSocket support
→ carefully scoped support capabilities
```

Again:

Authentication proves identity; authorization determines whether that identity can perform this operation on this tenant's resource.

### A very strong way to connect both sides in your interview

You can say:

> “TicketSocket was multi-tenant in two different dimensions. On the identity side, merchants wanted their customers to experience TicketSocket as part of their own application, so Auth0 gave us an identity federation layer and normalized authentication across white-label clients. On the payment side, every tenant could bring its own processor credentials, so we normalized those integrations behind a payment-provider abstraction while keeping credentials tenant-scoped and encrypted. In both cases, the architectural principle was the same: don't spread vendor-specific trust logic throughout the application—put it behind a controlled boundary and expose a normalized interface to the rest of the platform.”

That last point is particularly strong because it shows you understand the architecture principle, not just Auth0 or Square.

## 6. Edge layer, admission tokens, sessions, and cookies in a waiting-room flow

> **Original question:** what do you mean by "When the user requests:
>
> tickets.example.com/event/123
>
> the edge layer checks whether they already have a valid admission token."
>
> what is the edge layer exactly? Also what is the admission token and is it different to other tokens? What is a session? How does client application manage the session and what is a cookie? If a user attempts to navigate to a reservation page domain route but they do not have ADMITTED status yet from the waiting room then what actually happens here do they get rerouted and how does this get handled and where client or other component or both?

Yes—this is where several concepts blur together. The cleanest way to understand it is to separate edge routing, authentication, waiting-room admission, and browser session state.

### 1. What exactly is the “edge layer”?

The edge layer is infrastructure that receives the user's request before it reaches your application servers.

For example:

```text
Browser
   │
   ▼
Cloudflare / CloudFront
   │
   ▼
WAF
   │
   ▼
Load Balancer / API Gateway
   │
   ▼
TicketSocket application
```

Depending on the architecture, "edge" might include:

- CDN
- WAF
- reverse proxy
- load balancer
- API Gateway
- edge functions / Lambda@Edge / Cloudflare Workers

Its purpose is to make decisions such as:

- Is this request malicious?
- Is this user rate-limited?
- Does this request have a valid admission token?
- Should this request go to the waiting room?
- Should this request reach the ticketing app?

So when I said:

> "the edge layer checks whether they already have a valid admission token"

I meant something like:

```text
Browser
   │
GET /event/123/reserve
   │
   ▼
CloudFront / edge worker / gateway
   │
   ├── admission token valid?
   │
   ├── YES → ticketing application
   │
   └── NO  → waiting room
```

The advantage is that unauthorized traffic gets stopped before it consumes expensive backend capacity.

### 2. What is an admission token?

An admission token means:

> "The waiting-room system has approved this browser/user to enter this particular ticket sale."

It is not necessarily the same thing as the user's login token.

For example:

```text
Authentication token
=
"this is user 123"

Admission token
=
"user/session 123 is allowed into event 456's ticket-sale flow until 10:30"
```

Those are two different questions.

You might have:

```text
Auth0 JWT
{
   sub: "user123",
   email: "...",
   roles: ["customer"]
}
```

and separately:

```text
Admission token
{
   sessionId: "queue-789",
   userId: "user123",
   eventId: "event456",
   status: "ADMITTED",
   admittedAt: 10:15,
   exp: 10:30
}
```

Then the request might effectively have both:

```text
Who are you?
        ↓
authentication token

Are you allowed into this sale?
        ↓
admission token
```

The reservation service may require both.

### 3. Why use an admission token?

Because otherwise the browser could simply claim:

```json
{
  "status": "ADMITTED"
}
```

and skip the waiting room.

You need something the user cannot forge.

For example the waiting-room service signs:

```text
{
   eventId: 123,
   queueSessionId: abc,
   status: ADMITTED,
   exp: ...
}
```

using its private signing key.

Then:

```text
Waiting Room
     │
     │ signs
     ▼
Admission Token
     │
     ▼
Browser
     │
     ▼
API Gateway
     │
     │ verifies signature
     ▼
Reservation Service
```

A user can see the token, but cannot change:

```text
WAITING
```

to:

```text
ADMITTED
```

because that would invalidate the signature.

### 4. Admission token vs login JWT

It helps to think of tokens as proofs of different facts.

| Token              | Proves                                         |
| ------------------ | ---------------------------------------------- |
| Login/Auth JWT     | Who you are                                    |
| Access token       | What APIs you may access                       |
| Refresh token      | Allows obtaining another access token          |
| Admission token    | You passed the waiting room                    |
| Seat-hold token/ID | You currently own a temporary seat reservation |
| Payment token      | Represents tokenized payment information       |

So one checkout might involve several:

```text
Auth token
   ↓
"This is Oscar"

Admission token
   ↓
"Oscar is admitted to Event 123"

hold_id
   ↓
"Oscar currently holds seats A12/A13"

payment token
   ↓
"This token represents the customer's payment method"
```

They should not be thought of as interchangeable.

### 5. What is a session?

A session is the server's concept of an ongoing interaction with a particular browser/user.

For example, suppose you visit TicketSocket.

The server could create:

```text
session_id = s_ABC123
```

and store:

```text
s_ABC123
{
    userId: 555,
    eventId: 123,
    waitingRoomStatus: WAITING,
    queuePosition: 12450
}
```

Then later:

```text
s_ABC123
{
    userId: 555,
    eventId: 123,
    waitingRoomStatus: ADMITTED
}
```

The browser needs some way of saying:

> "I'm the browser associated with session s_ABC123."

That's where cookies commonly come in.

### 6. What is a cookie?

A cookie is a small value the browser stores for a website and automatically sends back on future HTTP requests to that website.

Server response:

```http
Set-Cookie: queue_session=s_ABC123
```

Browser stores:

```text
queue_session=s_ABC123
```

Later the browser requests:

```http
GET /event/123/reserve
```

and automatically sends:

```http
Cookie: queue_session=s_ABC123
```

The server can then look up:

```text
s_ABC123
      ↓
Waiting Room Session Store
      ↓
status = ADMITTED
```

That's the basic idea.

### 7. Cookie vs session

These get confused constantly.

The cookie is stored in the browser.

The session is usually stored on the server.

For example:

```text
Browser

cookie:
session_id=ABC
       │
       ▼
Server / Redis

ABC:
{
   userId: 123,
   status: ADMITTED
}
```

The cookie normally doesn't need to contain all the session data.

It may simply contain a random identifier.

### 8. Where would session state be stored?

For one server:

```text
application memory
```

could technically work.

But that breaks when you horizontally scale:

```text
Browser
   ↓
Load Balancer
   │
 ┌─┴──────────────┐
 ▼                ▼
Server A        Server B
```

If Server A knows about session ABC but Server B doesn't, you have a problem.

So distributed systems typically use:

- Redis
- Database
- distributed session store

For example:

```text
Browser
 cookie=ABC
     │
     ▼
Any waiting-room instance
     │
     ▼
Redis
     │
     ▼
session ABC
status = WAITING
```

Every server can retrieve the same session.

### 9. Or you can avoid server-side sessions

Instead of storing:

```text
ABC → ADMITTED
```

in Redis, you can issue a signed token containing the state itself.

For example:

```text
Admission JWT

{
   sessionId: ABC,
   eventId: 123,
   status: ADMITTED,
   exp: ...
}
```

Then:

```text
Browser
   │
admission JWT
   │
   ▼
Gateway
   │
verify signature locally
```

Now the gateway doesn't necessarily have to query Redis.

This is stateless admission verification.

There are therefore two common models.

#### Stateful

```text
Cookie
   ↓
session ID
   ↓
Redis
   ↓
ADMITTED?
```

#### Stateless

```text
Cookie / header
   ↓
signed admission token
   ↓
verify signature
   ↓
ADMITTED?
```

And you can combine them.

### 10. How does the browser get redirected?

Now consider your exact example.

User manually enters:

```text
tickets.example.com/event/123/reserve
```

but they're not admitted.

The request flows:

```text
Browser
    │
GET /event/123/reserve
    │
    ▼
Edge
    │
    │ inspect cookie / admission token
    ▼
No valid admission
```

The edge can respond:

```http
HTTP/1.1 302 Found
Location: /waiting-room?event=123
```

The browser automatically follows that redirect.

So:

```text
/reserve
   ↓
Edge sees NO admission
   ↓
302 redirect
   ↓
/waiting-room
```

That is server/edge-side route protection.

### 11. What happens after the user gets admitted?

Suppose they wait:

```text
WAITING
   ↓
WAITING
   ↓
WAITING
   ↓
ADMITTED
```

The waiting-room service can issue the admission token:

```text
Waiting Room
     │
     ▼
Set-Cookie:
admission_token=eyJ...
```

Then the browser navigates:

```text
/event/123/reserve
```

Now:

```text
Browser
   │
Cookie: admission_token=...
   ▼
Edge
   │
verify signature
   │
eventId = 123 ✓
status = ADMITTED ✓
exp valid ✓
   │
   ▼
Ticketing application
```

The request is allowed through.

### 12. Should the client also check?

Yes—but client checks are only for UX.

Suppose your Vue/React application knows:

```text
waitingRoom.status = WAITING
```

and the user tries:

```js
router.push('/reserve');
```

A client-side route guard can say:

```text
if status !== 'ADMITTED':
    router.push('/waiting-room')
```

So:

```text
Vue Router
   │
   ├── admitted → reservation page
   │
   └── waiting → waiting-room page
```

That prevents confusing UI behavior.

But this is not security.

A user can bypass JavaScript and directly make:

```http
POST /api/reservations
```

using:

- curl
- Postman
- custom script

Therefore the backend/gateway must independently enforce admission.

### 13. The proper design is both client and server enforcement

Client:

```text
if not admitted:
    show waiting room
```

Server:

```text
if admission token invalid:
    reject request
```

Think:

```text
CLIENT CHECK
= usability

SERVER CHECK
= security
```

Never rely solely on:

- Vue route guard
- React route guard
- hidden button
- disabled button

for authorization.

### 14. Full example

Suppose the user goes to:

```text
https://tickets.example.com/events/123/seats
```

#### Request 1

```text
Browser
   │
GET /events/123/seats
   │
Cookie:
auth_token=XYZ
(no admission token)
   │
   ▼
CloudFront / Edge Worker
```

Edge evaluates:

```text
authentication valid? YES
admission for event123? NO
```

Response:

```text
302 /events/123/wait
```

#### Waiting-room page

Browser receives:

```text
/events/123/wait
```

Waiting-room frontend calls:

```text
POST /queue/join

eventId = 123
```

Server creates:

```text
queueSessionId = Q456
status = WAITING
```

Browser receives cookie:

```http
Set-Cookie:
queue_session=Q456;
Secure;
HttpOnly;
SameSite=Lax
```

### 15. What do Secure / HttpOnly / SameSite mean?

These are important cookie security settings.

#### Secure

```text
Secure
```

means:

Only send this cookie over HTTPS.

So never:

```text
http://tickets.example.com
```

only:

```text
https://tickets.example.com
```

#### HttpOnly

```text
HttpOnly
```

means JavaScript cannot do:

```js
document.cookie;
```

and steal/read that cookie.

This helps reduce token theft through XSS.

The browser still automatically sends the cookie with requests.

#### SameSite

Controls when cookies are sent during cross-site navigation.

Common values:

- Strict
- Lax
- None

This helps mitigate CSRF.

For many authentication/session cookies:

```text
SameSite=Lax
```

is a reasonable common choice, depending on the flow.

### 16. Queue polling

Browser periodically asks:

```http
GET /queue/Q456/status
```

with cookie:

```text
queue_session=Q456
```

Response:

```json
{
  "status": "WAITING",
  "approxPosition": 19234
}
```

Later:

```json
{
  "status": "ADMITTED"
}
```

Then the server may issue:

```http
Set-Cookie:
event_123_admission=<signed-token>;
Secure;
HttpOnly;
SameSite=Lax
```

Now the browser has proof of admission.

### 17. Client redirects after admission

The Vue/React page sees:

```json
{
  "status": "ADMITTED"
}
```

and does:

```js
router.replace('/events/123/seats');
```

So yes, the client can initiate the navigation once it learns it has been admitted.

But when the browser requests that route, the edge/server still checks the admission cookie.

That gives:

```text
Waiting room status changes
       │
       ▼
Client learns ADMITTED
       │
       ▼
Client navigates to /seats
       │
       ▼
Edge verifies admission token
       │
       ▼
Reservation application
```

### 18. What if the user manually changes the URL?

Suppose they're waiting and type:

```text
/events/123/seats
```

The client-side router might initially catch it.

But even if they bypass it:

```text
direct HTTP request
```

the server sees:

```text
no valid event123 admission token
```

and does:

```text
302 → /events/123/wait
```

Or for an API call:

```http
POST /api/reservations
```

the backend might return:

```text
403 Forbidden
```

or perhaps:

```text
428 Admission Required
```

depending on your API convention.

Typically:

```text
PAGE REQUEST
→ redirect

API REQUEST
→ 401/403-style JSON error
```

That's often cleaner.

### 19. Page route vs API route

This distinction matters.

Suppose:

```http
GET /events/123/seats
```

is a frontend page.

You might redirect:

```text
302 /events/123/wait
```

But:

```http
POST /api/events/123/reservations
```

should not usually redirect to HTML.

Instead:

```text
HTTP 403

{
  "code": "WAITING_ROOM_ADMISSION_REQUIRED"
}
```

Then the frontend can interpret that and send the user to the waiting room.

### 20. A complete architecture

```text
                    Browser
                       │
                       │ auth cookie
                       │ admission cookie
                       ▼
                CDN / Edge Layer
                       │
              ┌────────┴────────┐
              │                 │
       admission valid?     admission absent
              │                 │
             YES               NO
              │                 │
              ▼                 ▼
       Ticketing App      Waiting Room App
              │                 │
              │            Queue Service
              │                 │
              │                Redis
              │                 │
              │          status=WAITING
              │                 │
              │          status=ADMITTED
              │                 │
              │          issue signed token
              │                 │
              └─────────◄───────┘
                       │
                       ▼
               Reservation API
                       │
                       ▼
                Inventory Service
```

### 21. One subtle point: authenticated vs anonymous buyers

The queue session doesn't necessarily require a logged-in user.

For example:

```text
anonymous visitor
      ↓
queue session cookie
      ↓
WAITING
```

Then later:

```text
ADMITTED
   ↓
login
   ↓
select seats
```

Or you might require login before entering the queue.

Both designs are possible.

The session identity might therefore be:

```text
queue_session_id
```

rather than:

```text
user_id
```

until authentication happens.

### 22. A good session model

Conceptually:

```text
queue_sessions

session_id
event_id
user_id nullable
status
joined_at
priority
admitted_at
expires_at
```

For example:

```text
Q123
event = TSLA-2026-LA
user = 456
status = ADMITTED
joined = 09:51
admitted = 10:11
expires = 10:26
```

The browser holds only:

```text
Q123
```

or a signed representation of it.

The authoritative state is controlled by the server.

### 23. What I'd do in a real design

I would likely use:

```text
Browser
    │
    ▼
CloudFront / Cloudflare
    │
    ▼
Edge function
    │
    ├── validate admission cookie
    │
    ├── admitted → origin
    │
    └── not admitted → waiting-room origin
```

Waiting room:

```text
Stateless Queue API
       │
       ▼
Redis cluster
```

Admission:

```text
Redis status → ADMITTED
       │
       ▼
issue short-lived signed admission token
```

Then the reservation APIs also validate:

```text
auth token
+
admission token
```

That last part matters because even if the edge is accidentally bypassed, the sensitive backend still enforces admission.

### The simplest mental model

Think of going to a concert venue physically.

Your authentication token is:

> "This is Oscar."

Your queue session is:

> "Oscar is number 12,438 in line."

Your admission token is:

> "Security has let Oscar through the front gate."

Your seat hold is:

> "Oscar currently has A12 reserved for eight minutes."

Your order/payment record is:

> "Oscar successfully bought A12."

And the system is enforcing these progressively:

```text
IDENTITY
   ↓
QUEUE
   ↓
ADMISSION
   ↓
SEAT HOLD
   ↓
PURCHASE
```

That's the cleanest way to reason about the entire ticket-sale flow in a system-design interview.

# Part III — Security, identity and authorization

Security as the interviewer will probe it: a catalog of definitions for quick lookup, the authentication and authorization best practices behind every answer, and the flows that matter most for the owner's own systems — Frequence's multi-tenant SaaS, Gala's accounts, wallets and scarce inventory, and TicketSocket's white-label SSO, merchant payment processors and signed webhooks. Part I's company sections point here.

## 7. Security catalog — quick-reference definitions

Yes. I would add a dedicated **“Security, Identity & Authorization” reference section near the front of your interview-prep document**, then cross-reference it from the Gala, Frequence, and TicketSocket sections. That gives you a vocabulary lookup plus concrete architectures tied to things you can actually discuss from your career.

One distinction matters throughout this section: some implementation details are explicitly supported by your resume/current descriptions, while others are the **lead-level architecture I recommend you use to explain how such a system should be designed**. Where the exact historical implementation matters and we have not established it, I mark it **[VERIFY]** rather than inventing experience.

---

_Security & Identity — quick-reference catalog_

### Identity, federation and protocols

| Term                          | Interview definition                                                                                                                                                                | Where it matters in your experience                                                                              |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Authentication (AuthN)**    | Establishes **who the caller is**.                                                                                                                                                  | Auth0/TicketSocket SSO, Gala user accounts, Frequence users.                                                     |
| **Authorization (AuthZ)**     | Determines **what an authenticated caller may do to a particular resource**.                                                                                                        | Tenant isolation, refunds, campaign access, NFT/token actions.                                                   |
| **Identity Provider (IdP)**   | System that authenticates a user and asserts their identity. Auth0 can be an IdP or broker other IdPs.                                                                              | TicketSocket white-label SSO.                                                                                    |
| **Identity federation**       | One system trusts identity established by another organization/system.                                                                                                              | A Meow Wolf user signs into the TicketSocket-powered white-label experience without a second set of credentials. |
| **SSO**                       | User authenticates once and can enter another trusted application without signing in again.                                                                                         | Merchant → TicketSocket handoff.                                                                                 |
| **OAuth 2.0**                 | Framework for delegated authorization/access to APIs.                                                                                                                               | Access tokens, payment-provider OAuth.                                                                           |
| **OIDC**                      | Authentication protocol built on OAuth 2.0. Adds user identity, ID tokens and discovery.                                                                                            | Auth0 web SSO.                                                                                                   |
| **SAML**                      | XML-based enterprise federation protocol. Common alternative to OIDC for enterprise IdPs.                                                                                           | Possible enterprise TicketSocket clients **[VERIFY actual client protocols]**.                                   |
| **Authorization Code + PKCE** | Preferred browser/mobile OAuth/OIDC flow. Browser receives a temporary code rather than exposing credentials/tokens through URLs. PKCE binds the exchange to the initiating client. | White-label SSO.                                                                                                 |

### Tokens and claims

| Term              | Interview definition                                                                           | Where it matters in your experience                         |
| ----------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| **JWT**           | Signed token format containing claims. JWT is a format, not itself an authentication protocol. | TicketSocket JWT/service allocation; user/service auth.     |
| **ID token**      | OIDC token describing the authenticated user. Primarily for the client to establish identity.  | SSO/login.                                                  |
| **Access token**  | Credential presented to an API to access protected resources.                                  | `Authorization: Bearer ...`.                                |
| **Refresh token** | Longer-lived credential used to obtain new access tokens. Highly sensitive.                    | Long-lived sessions where required.                         |
| **Claim**         | A field in a signed token: `sub`, `tenant_id`, `role`, `scope`, `aud`, etc.                    | Multi-tenant authorization.                                 |
| **`sub`**         | Stable subject/user identifier asserted by the issuer.                                         | Maps authenticated identity to application user.            |
| **`iss`**         | Token issuer. API verifies that it trusts this issuer.                                         | JWT verification.                                           |
| **`aud`**         | Audience: which application/API the token was issued for.                                      | Prevents a token for App A from being reused against API B. |
| **Scope**         | Capability granted to a token, e.g. `orders:read`.                                             | API-level authorization.                                    |

### Access control and tenancy

| Term                 | Interview definition                                                                                       | Where it matters in your experience                  |
| -------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| **Role**             | User category grouping permissions.                                                                        | `tenant_admin`, `analyst`, `manager`, etc.           |
| **RBAC**             | Role-Based Access Control: permissions assigned to roles.                                                  | Frequence SaaS, TicketSocket merchant employees.     |
| **ABAC**             | Attribute-Based Access Control: decisions consider user, tenant, resource, amount, status, geography, etc. | “Manager can refund orders in their tenant up to X.” |
| **Tenant isolation** | Ensures tenant A cannot access tenant B's data.                                                            | Frequence and TicketSocket white-label SaaS.         |

### Sessions and the browser

| Term              | Interview definition                                                                                | Where it matters in your experience   |
| ----------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------- |
| **Session**       | Logical ongoing authenticated interaction. May be server-side state referenced by a browser cookie. | Web applications.                     |
| **Cookie**        | Small browser-managed value automatically sent to a domain.                                         | Secure browser sessions.              |
| **HttpOnly**      | Prevents browser JavaScript from reading a cookie.                                                  | Helps reduce token theft through XSS. |
| **Secure cookie** | Cookie transmitted only through HTTPS.                                                              | Browser auth.                         |
| **SameSite**      | Controls cross-site cookie behavior and helps defend against CSRF.                                  | Browser auth.                         |

### Strong authentication

| Term                       | Interview definition                                                    | Where it matters in your experience          |
| -------------------------- | ----------------------------------------------------------------------- | -------------------------------------------- |
| **MFA**                    | Requires more than one authentication factor.                           | High-value Gala account/security operations. |
| **Step-up authentication** | Requires stronger/recent authentication only for a sensitive operation. | Token purchases, wallet changes, refunds.    |

### Keys, signatures, replay and integrity

| Term                  | Interview definition                                                                               | Where it matters in your experience                  |
| --------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| **JWKS**              | Endpoint exposing an issuer's public verification keys.                                            | Auth0/OIDC JWT verification.                         |
| **Key rotation**      | Periodically change signing/encryption keys while allowing safe transition from old keys.          | JWT infrastructure.                                  |
| **Nonce**             | Single-use unpredictable value used to prevent replay.                                             | OIDC and crypto-wallet proof.                        |
| **`state`**           | OAuth parameter correlating authorization request/response and protecting against request forgery. | SSO redirect flow.                                   |
| **Replay attack**     | Attacker captures a valid request/signature and submits it again.                                  | Crypto signing, payment webhooks, rewards.           |
| **Idempotency**       | Repeating the same operation produces no additional side effect.                                   | Payments, refunds, token purchases, webhook retries. |
| **Webhook signature** | Cryptographic evidence that an incoming webhook was generated by the expected provider.            | Square/payment-provider events.                      |

### Secrets, least privilege and infrastructure

| Term                | Interview definition                                                                                              | Where it matters in your experience                     |
| ------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| **Tokenization**    | Replace sensitive card data with a provider-generated token.                                                      | TicketSocket payment processing / PCI reduction.        |
| **Secret manager**  | Secure system for API keys, OAuth tokens and credentials.                                                         | Merchant-specific processor credentials.                |
| **KMS/HSM**         | Systems that protect cryptographic keys; an HSM performs sensitive cryptographic operations in hardened hardware. | Signing infrastructure, custodial crypto if applicable. |
| **Least privilege** | Every user/service gets only permissions it actually needs.                                                       | IAM, payment service, support roles.                    |
| **mTLS**            | Both sides of a TLS connection authenticate with certificates.                                                    | High-security service-to-service communication.         |
| **Audit log**       | Immutable/append-oriented record of who performed a security-sensitive operation.                                 | Refunds, admin changes, token/merchant actions.         |
| **RLS**             | PostgreSQL Row-Level Security; DB itself can enforce which rows a tenant/user may access.                         | Optional defense-in-depth for SaaS.                     |

### Browser boundaries that are not security

| Term                     | Interview definition                                                                                   | Where it matters in your experience |
| ------------------------ | ------------------------------------------------------------------------------------------------------ | ----------------------------------- |
| **CORS**                 | Browser policy governing which origins can call an API. **It is not authentication or authorization.** | White-label web apps.               |
| **Frontend route guard** | UX mechanism preventing navigation. **It is not security.** Backend must authorize independently.      | Angular/Vue/React apps.             |

### Web3 transactions

| Term                   | Interview definition                                                                                           | Where it matters in your experience    |
| ---------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| **Transaction intent** | Application-specific record/token describing a specific authorized sensitive action. Not a universal protocol. | Useful model for Gala purchases/mints. |
| **Wallet proof**       | User proves control of a crypto wallet by signing a server-generated challenge.                                | Gala/Web3.                             |

### Alphabetical index of terms

- ABAC — Access control and tenancy
- Access token — Tokens and claims
- `aud` — Tokens and claims
- Audit log — Secrets, least privilege and infrastructure
- Authentication (AuthN) — Identity, federation and protocols
- Authorization (AuthZ) — Identity, federation and protocols
- Authorization Code + PKCE — Identity, federation and protocols
- Claim — Tokens and claims
- Cookie — Sessions and the browser
- CORS — Browser boundaries that are not security
- Frontend route guard — Browser boundaries that are not security
- HttpOnly — Sessions and the browser
- ID token — Tokens and claims
- Idempotency — Keys, signatures, replay and integrity
- Identity federation — Identity, federation and protocols
- Identity Provider (IdP) — Identity, federation and protocols
- `iss` — Tokens and claims
- JWKS — Keys, signatures, replay and integrity
- JWT — Tokens and claims
- Key rotation — Keys, signatures, replay and integrity
- KMS/HSM — Secrets, least privilege and infrastructure
- Least privilege — Secrets, least privilege and infrastructure
- MFA — Strong authentication
- mTLS — Secrets, least privilege and infrastructure
- Nonce — Keys, signatures, replay and integrity
- OAuth 2.0 — Identity, federation and protocols
- OIDC — Identity, federation and protocols
- RBAC — Access control and tenancy
- Refresh token — Tokens and claims
- Replay attack — Keys, signatures, replay and integrity
- RLS — Secrets, least privilege and infrastructure
- Role — Access control and tenancy
- SameSite — Sessions and the browser
- SAML — Identity, federation and protocols
- Scope — Tokens and claims
- Secret manager — Secrets, least privilege and infrastructure
- Secure cookie — Sessions and the browser
- Session — Sessions and the browser
- SSO — Identity, federation and protocols
- `state` — Keys, signatures, replay and integrity
- Step-up authentication — Strong authentication
- `sub` — Tokens and claims
- Tenant isolation — Access control and tenancy
- Tokenization — Secrets, least privilege and infrastructure
- Transaction intent — Web3 transactions
- Wallet proof — Web3 transactions
- Webhook signature — Keys, signatures, replay and integrity

### The security mental model

The security mental model I want you to have during an interview is:

```text
                    AUTHENTICATION
                         WHO?
                           │
                           ▼
                      Identity
                           │
                           ▼
                    AUTHORIZATION
                 WHAT MAY THEY DO?
                           │
                           ▼
                 RESOURCE / TENANT
                 WHICH DATA/ACTION?
```

And at the system level:

```text
User
 │
 ▼
Identity Provider
 │
 │ signed identity/access credential
 ▼
Gateway
 │
 ├── token authentic?
 ├── correct issuer?
 ├── correct audience?
 ├── expired?
 └── broad scope?
 │
 ▼
Domain Service
 │
 ├── correct tenant?
 ├── correct role?
 ├── owns resource?
 ├── action legal in current state?
 └── additional business policy?
 │
 ▼
Database
```

The gateway does **coarse authorization**. The domain service must still do **fine-grained authorization**.

---

## 8. Authentication and authorization — best practices and flows

> **Original question:** Provide best practices in software engineering and system design flows for both authentication and authorization

A strong system-design answer starts by keeping the two concerns separate:

- Authentication = who are you?
- Authorization = what are you allowed to do?

They often happen in the same request path, but they should not be treated as the same thing.

A good modern architecture looks like this:

```text
                    ┌────────────────────┐
                    │ Identity Provider  │
                    │ Auth0 / Okta / IdP │
                    └─────────┬──────────┘
                              │
                         login / OIDC
                              │
                              ▼
                           Client
                              │
                              │ access token / session cookie
                              ▼
                     CDN / WAF / Gateway
                              │
                    authenticate request
                              │
                  ┌───────────┴────────────┐
                  │                        │
                  ▼                        ▼
             User Service             Order Service
                  │                        │
            authorize action         authorize action
                  │                        │
                  ▼                        ▼
               Database                 Database
```

The key principle is that authentication usually happens at the boundary, while authorization must still happen at the service/domain layer.

### Authentication flow

For a typical web application using OIDC/OAuth:

```text
User
 │
 ▼
Frontend
 │
 │ redirect to login
 ▼
Identity Provider
 │
 │ username/password / SSO / MFA
 ▼
Identity verified
 │
 ▼
Authorization code
 │
 ▼
Backend / client exchanges code
 │
 ▼
Access token + refresh token
 │
 ▼
Client calls API
```

The access token might contain claims such as:

```json
{
  "sub": "user-123",
  "iss": "https://auth.example.com",
  "aud": "orders-api",
  "roles": ["customer"],
  "scope": "orders:read orders:create",
  "exp": 1790000000
}
```

The API should validate:

- signature
- issuer
- audience
- expiration
- token type
- required scopes

With asymmetric signing:

```text
Identity Provider
      │
      │ private key
      ▼
    signs JWT

API Gateway / Services
      │
      │ public key / JWKS
      ▼
   verify JWT
```

The public key is not secret. The private signing key must be protected.

A common production design is:

```text
IdP
 │
 ▼
JWKS endpoint
 │
 ▼
Gateway / service caches public keys
 │
 ▼
verify JWT locally
```

That avoids calling the auth server on every API request.

### Authorization flow

Authentication only proves:

```text
user = user-123
```

Authorization asks something more specific:

```text
Can user-123 refund order-456?
```

A strong authorization flow is:

```text
Request
  │
  ▼
Authenticate token
  │
  ▼
Extract identity
  │
  ▼
Check coarse permission
  │
  ▼
Load requested resource
  │
  ▼
Check resource ownership / policy
  │
  ▼
Allow or deny
```

For example:

```http
DELETE /orders/456
```

JWT:

```json
{
  "sub": "user-123",
  "roles": ["customer"],
  "scope": "orders:read"
}
```

The service checks:

```text
Does token have orders:delete?
        ↓
       no
        ↓
   403 Forbidden
```

Or suppose scope is allowed, but the order belongs to another user:

```text
authenticated user = 123
order.owner_id = 999
```

Then:

```text
403 Forbidden
```

That second check must happen in the service because the gateway usually does not know resource ownership.

### Best-practice split between gateway and service

Use the gateway for coarse-grained access control:

```text
API Gateway
-------------
validate JWT
validate issuer/audience
reject expired tokens
check broad scopes
rate limit
reject guests
```

Use the service for domain authorization:

```text
Order Service
-------------
does user own order?
is order refundable?
does merchant have permission?
is user in correct tenant?
is operation valid in current state?
```

This is much safer than relying only on the gateway.

A useful rule:

> Gateway answers “Can this caller reach this API?”
>
> Service answers “Can this caller perform this action on this resource?”

### RBAC vs ABAC

The two most common authorization models are RBAC and ABAC.

RBAC:

```text
Role
 ↓
Permissions

customer
→ orders:read-own

manager
→ orders:read
→ orders:refund

admin
→ tenant:configure
```

Good for simple organizational permissions.

ABAC adds contextual rules:

```text
user.role = manager
resource.tenant_id = user.tenant_id
resource.amount < refund_limit
request.region = allowed_region
```

Then authorization can express:

```text
Manager may refund
IF same tenant
AND amount < $500
AND order status = COMPLETED
```

For large SaaS systems, a hybrid is common:

```text
RBAC
+
resource ownership
+
tenant boundaries
+
contextual policy
```

### Multi-tenant security

For white-label or SaaS systems, tenant isolation is critical.

Bad:

```http
GET /orders?tenant_id=merchant-b
```

where the client chooses the tenant.

Better:

```text
JWT
{
  sub: user123,
  tenant_id: merchantA
}
```

Then backend binds:

```sql
SELECT *
FROM orders
WHERE tenant_id = :authenticatedTenant
  AND user_id = :authenticatedUser;
```

Never trust:

```text
tenant_id from request body
```

over:

```text
tenant_id from authenticated context
```

This prevents cross-tenant access.

### Sessions vs JWTs

A session-based system typically works like:

```text
Browser
 │
 │ cookie: session_id=ABC
 ▼
Server
 │
 ▼
Redis / DB
 │
 ▼
ABC → user123
```

JWT-based authentication:

```text
Browser
 │
 │ JWT
 ▼
API
 │
 │ verify locally
 ▼
user123
```

JWT advantages:

- stateless verification
- easy horizontal scaling
- good for distributed APIs

Session advantages:

- easy logout/revocation
- centralized control
- smaller client token

A common pattern is:

```text
browser session
+
short-lived access tokens
```

rather than extremely long-lived JWTs.

### Token lifetimes

Access tokens should usually be short-lived:

```text
5–15 minutes
```

or another reasonably short duration based on risk.

Refresh token:

- longer lived
- more sensitive
- stored carefully
- rotated

Flow:

```text
access token expires
      │
      ▼
refresh token
      │
      ▼
new access token
```

Best practice:

```text
refresh-token rotation
```

Meaning every refresh produces a new refresh token and invalidates the previous one.

This helps detect token theft.

### Cookies

For browser applications, sensitive session/refresh credentials are often safer in secure cookies:

```http
Set-Cookie:
session=...
Secure;
HttpOnly;
SameSite=Lax
```

Secure means HTTPS only.

HttpOnly prevents JavaScript from reading the cookie.

SameSite helps reduce CSRF risk.

Avoid storing highly sensitive long-lived tokens in:

```text
localStorage
```

when a secure HttpOnly cookie architecture is available, because XSS can read localStorage.

### CSRF vs XSS

Authentication design should account for both.

With cookies:

```text
CSRF
```

becomes an important concern because browsers automatically send cookies.

Mitigations:

- SameSite
- CSRF token
- Origin/Referer validation

With bearer tokens stored in JavaScript:

```text
XSS
```

is especially dangerous because malicious JS may steal them.

Mitigations:

- Content Security Policy
- output escaping
- input sanitization
- avoid unsafe DOM APIs
- HttpOnly cookies
- dependency hygiene

### Service-to-service authentication

Internal services should not blindly trust that traffic is internal.

Example:

```text
Order Service
    │
    ▼
Payment Service
```

Use one of:

- mTLS
- service identity
- short-lived service JWT
- cloud IAM identity
- OAuth client credentials

For example:

```text
Order Service
    │
    │ service token
    ▼
Payment Service
    │
    ├── verify service identity
    └── verify scope=payments:create
```

Avoid:

> "it's inside the VPC, so it's trusted"

That is weak security design.

### Secrets management

Do not put:

- DB passwords
- OAuth client secrets
- payment API keys
- JWT private keys

in source code or plain environment files committed to git.

Use:

- AWS Secrets Manager
- GCP Secret Manager
- Vault
- KMS

with least-privilege access.

Example:

```text
Payment Service IAM role
      │
      ▼
can read:
merchantA/square-token

Cannot read:
unrelated production secrets
```

### Password storage

If your application manages passwords itself:

Never store:

- plaintext password
- reversible encryption
- simple SHA256(password)

Use a password hashing algorithm:

- Argon2id
- bcrypt
- scrypt

with unique salts.

Also support:

- MFA
- rate limiting
- credential-stuffing detection
- password reset tokens
- account lockout / throttling

### Authorization should be deny-by-default

A good authorization model is:

```text
no explicit permission
→ deny
```

not:

```text
unknown case
→ allow
```

For example:

```ts
if (!policyAllows(user, action, resource)) {
  throw new ForbiddenException();
}
```

This is safer than scattering:

```ts
if (user.role === 'admin') ...
```

through controllers.

Centralize policy logic.

### Policy layer

For complex applications:

```text
Controller
    │
    ▼
Authorization Policy
    │
    ▼
Business Service
```

Example conceptual policy:

```text
canRefund(user, order) =
  user.tenantId === order.tenantId &&
  user.permissions.includes('refund') &&
  order.status === 'COMPLETED'
```

At larger scale, teams may use dedicated policy systems such as OPA-style policy engines, but that is only worth the complexity when authorization rules become sufficiently broad.

### API design: 401 vs 403

Use:

```text
401 Unauthorized
```

when authentication is missing or invalid.

Despite the name, it really means:

authentication required/failed.

Use:

```text
403 Forbidden
```

when:

identity is known, but permission is denied.

Example:

```text
No token
→ 401

Valid token but wrong role
→ 403
```

For sensitive resources, some systems intentionally return:

```text
404
```

instead of revealing that another user's resource exists.

### Authorization and database queries

A strong pattern is to bind authorization directly into query shape.

Instead of:

```sql
SELECT * FROM orders WHERE id = :orderId;
```

then later checking user ownership, use:

```sql
SELECT *
FROM orders
WHERE id = :orderId
  AND user_id = :authenticatedUser
  AND tenant_id = :authenticatedTenant;
```

Then unauthorized resources naturally return no row.

This reduces accidental data leaks.

### Rate limiting and abuse prevention

Authentication endpoints need stronger rate limiting than ordinary APIs.

Protect:

- /login
- /password-reset
- /MFA
- /token refresh

with:

- per-IP rate limits
- per-account limits
- bot detection
- progressive delays
- CAPTCHA where appropriate

But avoid permanent account lockout solely based on failed login attempts because attackers can weaponize that for denial of service.

### Logging and audit

Do log:

- login success/failure
- token validation failure
- authorization denial
- privileged action
- role change
- password reset
- API key creation
- refund
- admin impersonation

Do not log:

- passwords
- access tokens
- refresh tokens
- credit card numbers
- private keys

Audit log example:

```text
actor_id
tenant_id
action
resource_type
resource_id
timestamp
result
source_ip
trace_id
```

For sensitive actions, append-only audit logs are valuable.

### Distributed tracing

Propagate identity context carefully:

- trace_id
- user_id or anonymized subject
- tenant_id
- service identity

But don't dump full JWTs into logs/traces.

Example:

```text
API Gateway
 trace_id=ABC
 user=user123
      │
      ▼
Order Service
 trace_id=ABC
      │
      ▼
Payment Service
 trace_id=ABC
```

Now you can debug authorization failures end-to-end.

### CI/CD security

Authentication and authorization changes should be treated as high-risk.

A solid pipeline:

```text
PR
 ↓
lint / typecheck
 ↓
unit tests
 ↓
authorization policy tests
 ↓
integration tests
 ↓
dependency/security scan
 ↓
build
 ↓
staging
 ↓
E2E auth flows
 ↓
canary/progressive release
 ↓
monitor 401/403/error rates
```

Important automated tests:

- user can access own resource
- user cannot access another user's resource
- merchant A cannot access merchant B
- expired token rejected
- wrong audience rejected
- wrong issuer rejected
- missing scope rejected
- admin permission works
- revoked/disabled user behavior correct

Authorization tests are especially important because many security bugs are:

```text
valid authentication + missing authorization check.
```

### Failure behavior

Think through:

- IdP unavailable
- JWKS endpoint unavailable
- token expired
- key rotated
- Redis/session store unavailable
- authorization DB slow
- service clock skew
- refresh token stolen
- user disabled while token valid

Good designs use:

- cached JWKS
- short token TTL
- key rotation overlap
- timeouts
- circuit breakers
- fail-closed authorization

For authorization, default to:

```text
uncertain
→ deny
```

not:

```text
dependency failed
→ allow
```

### Key rotation

Identity provider:

```text
old private key
      ↓
new private key
```

JWKS temporarily exposes:

```text
public key A
public key B
```

JWT header includes:

```json
{
  "kid": "key-B"
}
```

Verifier chooses the appropriate public key.

Keep old verification keys until tokens signed with them expire.

### A strong interview system-design answer

If an interviewer asks:

> “How would you design authentication and authorization for this system?”

You can say:

> “I separate authentication from authorization. Authentication is centralized through an identity provider using OIDC/OAuth, which issues short-lived signed access tokens. At the edge or API gateway I verify signature, issuer, audience, expiration and broad scopes, using cached JWKS keys so request validation stays local and scalable. I then propagate the authenticated identity to downstream services. Authorization remains enforced inside each domain service because that layer understands resource ownership and business rules—for example whether this user owns this order, belongs to this tenant, and has permission to refund it. I prefer deny-by-default policies, tenant-bound database queries, least-privilege service identities, secure secret storage and audit logging. For browsers I protect session or refresh credentials with Secure, HttpOnly, SameSite cookies, and I use short access-token lifetimes plus refresh-token rotation. Service-to-service calls are independently authenticated with service identity or mTLS rather than trusting the network. Finally, I test negative authorization paths in CI and monitor auth failures, privilege changes and suspicious login activity in production.”

The shortest mental model to keep is:

```text
IDENTITY PROVIDER
      ↓
AUTHENTICATION
Who are you?
      ↓
TOKEN / SESSION
      ↓
GATEWAY
Is this token valid?
      ↓
SERVICE
Are you allowed to perform
THIS ACTION on THIS RESOURCE?
      ↓
DATABASE
Query constrained by
user + tenant + permissions
```

And the most important security rule is:

> Authenticate once at the boundary, but authorize every sensitive operation at the domain boundary.

## 9. Security by company — Frequence multi-tenant SaaS, Gala Web3 accounts and inventory, TicketSocket SSO, payments and webhooks

### Frequence/Madhive — multi-tenant SaaS security

Your resume establishes that you helped lead Frequence's configurable Angular framework and workflows, provided technical direction across 30+ engineers/QAs, and worked on a large AdTech platform. _Oscar Gonzalez - Lead Engineer …_ Your additional context establishes the white-label/multi-tenant SaaS aspect.

The principal security invariant is:

> **A valid Frequence user from Tenant A must never be able to read or modify Tenant B's campaign, audience, strategy, reporting or configuration data.**

That is stronger than merely saying “users must log in.”

#### Lead-level architecture

```text
                           User
                            │
                            ▼
                       Login / IdP
                            │
                       signed token
                            │
                            ▼
                     API Gateway / BFF
                            │
             authenticate + coarse scopes
                            │
                            ▼
                    Frequence API Service
                            │
             ┌──────────────┴──────────────┐
             │                             │
             ▼                             ▼
     Authorization Policy           Tenant Configuration
             │                             │
             ▼                             ▼
      Domain Services             workflow/features
             │
             ▼
       Data Access Layer
             │
      ALWAYS scopes by:
      tenant_id + resource
             │
             ▼
          Database
```

Token/security context conceptually:

```json
{
  "sub": "user-8432",
  "tenant_id": "customer-A",
  "roles": ["campaign_manager"],
  "scope": "campaign:read campaign:write",
  "aud": "frequence-api"
}
```

The crucial implementation principle is:

> **`tenant_id` comes from trusted authenticated context, not from a request parameter the browser is allowed to choose.**

Bad:

```http
GET /campaigns?tenantId=customer-B
```

where the backend trusts that value.

Better:

```text
authenticatedPrincipal.tenantId
          │
          ▼
      customer-A
```

and:

```sql
SELECT ...
FROM campaigns
WHERE tenant_id = :authenticatedTenant;
```

Even if the browser modifies a request:

```text
tenant_id = customer-B
```

the service either ignores it or rejects the mismatch.

#### Layer the tenant isolation

A Lead Engineer answer should explain that you don't depend on one check:

```text
                 Tenant Isolation

Token / session
tenant = A
     │
     ▼
Service authorization
tenant = A
     │
     ▼
Repository query
WHERE tenant_id = A
     │
     ▼
Cache
A:campaign:123
     │
     ▼
Async events
tenant_id=A
```

The same boundary applies to caches.

Bad:

```text
campaign:123
```

Better:

```text
tenant:A:campaign:123
```

Otherwise two tenants with colliding identifiers could create accidental cache leakage.

The same applies to background workers:

```text
CampaignUpdated
{
   tenant_id: A,
   campaign_id: 123
}
```

The worker should not infer tenant from an unsafe caller-controlled field.

For PostgreSQL, **RLS can be an additional defense**, not the only protection:

```sql
tenant_id = current_application_tenant()
```

That way even an accidentally under-scoped query can be rejected at the DB layer. Use this as a recommended design unless you know Frequence actually used RLS.

#### RBAC + ABAC

Do not reduce authorization to:

```text
if role === admin
```

A strong SaaS model combines role with resource context.

Example conceptual matrix:

| Role             |                    Planning | Campaign activation |  Reporting | Tenant configuration |
| ---------------- | --------------------------: | ------------------: | ---------: | -------------------: |
| Viewer/Analyst   |                        Read |                  No |       Read |                   No |
| Campaign Manager |                  Read/write |             Allowed |       Read |                   No |
| Tenant Admin     |                  Read/write |             Allowed | Read/write |              Allowed |
| Platform Support | Explicit scoped access only |            Explicit |   Explicit |              Audited |

Then add attributes:

```text
user.tenant_id == campaign.tenant_id
AND
role allows campaign:update
AND
campaign.status allows update
```

So authorization becomes:

```text
Authentication
     ↓
tenant membership
     ↓
role permission
     ↓
resource ownership
     ↓
workflow-state rule
     ↓
ALLOW / DENY
```

That's a much better Lead answer than “we had JWTs.”

#### Frontend responsibility

Angular route guards can provide:

```text
hide inaccessible menu
disable buttons
prevent accidental navigation
```

But:

> **The backend is authoritative.**

A malicious user can bypass Angular entirely:

```bash
curl DELETE /api/tenant-B/campaign/123
```

The API must still deny it.

#### Frequence CI/CD security flow

```text
Developer PR
    │
    ▼
TypeScript / lint / build
    │
    ▼
Unit tests
    │
    ├── permission policy tests
    └── config/schema tests
    │
    ▼
Integration tests
    │
    ├── tenant A reads A     ✓
    ├── tenant A reads B     ✗
    ├── role X action Y      ✓/✗
    └── disabled feature     ✗
    │
    ▼
Playwright E2E
    │
    ├── tenant-specific workflow
    ├── role-specific UI
    └── negative authorization path
    │
    ▼
Security / dependency / secret scan
    │
    ▼
Staging
    │
    ▼
Deployment
    │
    ▼
Datadog:
401 / 403 / error anomalies
```

An excellent interview statement:

> “For a configurable multi-tenant platform, I don't consider security tested just because the happy path works. Cross-tenant negative tests are first-class regression tests.”

---

### Gala — account, wallets, token transactions and scarce digital inventory

Your resume explicitly supports Web3 launch workflows, digital ownership/NFT collectibles, reward-driven experiences, Node/NestJS services, blockchain application paths and production-critical token/ICO launches. _Oscar Gonzalez - Lead Engineer …_

Here you should distinguish **three different identities**:

```text
Gala account identity
        │
        │ may be associated with
        ▼
Crypto wallet identity
        │
        │ authorizes
        ▼
Blockchain transaction
```

They are related but are **not the same security object**.

#### 1. Gala account authentication

```text
User
 │
 ▼
Login
 │
 ├── password/SSO [VERIFY]
 ├── MFA [VERIFY actual Gala use]
 │
 ▼
Authenticated Gala Account
 │
 ▼
short-lived session/access token
 │
 ▼
Gala APIs
```

For a high-value Web3 platform, a good security model includes **step-up authentication**.

Normal operation:

```text
browse films
view collectibles
view profile
```

may use normal session authentication.

High-risk operation:

```text
change wallet
purchase token
transfer valuable asset
change recovery/security configuration
```

can require:

```text
recent login
+
MFA / step-up verification
```

Only claim Gala actually required MFA if you can verify that.

---

#### 2. Proving wallet ownership

This is a very useful system-design flow to know.

Do **not** trust the user simply saying:

```json
{
  "wallet": "0xABC..."
}
```

Instead:

```text
Browser
   │
   │ "link wallet"
   ▼
Gala Backend
   │
   │ generate random one-time nonce
   ▼
Browser
   │
   ▼
Wallet Software
   │
   │ signs challenge using wallet private key
   │ PRIVATE KEY NEVER LEAVES WALLET
   ▼
Browser
   │ signature
   ▼
Gala Backend
   │
   ├── verify nonce
   ├── verify expiration
   ├── verify expected domain/chain
   ├── recover/verify wallet address
   └── mark nonce used
   │
   ▼
Account ↔ Wallet binding
```

Conceptual challenge:

```text
"Link wallet 0xABC to account 58293
 nonce=e7f3...
 expires=...
 domain=gala.example"
```

This prevents a user from linking someone else's public wallet simply because they know its address.

The one-time nonce prevents:

```text
attacker captures old signed challenge
           ↓
replays it later
```

---

#### 3. Sensitive token/collectible transaction

I would describe this with an explicit **transaction intent**.

This is not necessarily a standardized Gala token; it is the system-design concept you should be able to explain.

```text
User selects collectible/token
          │
          ▼
      Gala API
          │
          ├── authenticate account
          ├── authorize eligibility
          ├── check limits
          ├── check inventory
          ├── validate price server-side
          │
          ▼
   Create Transaction Intent
          │
          ├── intent_id
          ├── user_id
          ├── wallet_id
          ├── asset
          ├── amount
          ├── nonce
          ├── expiration
          └── idempotency key
          │
          ▼
      Wallet signs
          │
          ▼
 Blockchain submission
          │
          ▼
       PENDING
          │
     ┌────┴─────┐
     ▼          ▼
 CONFIRMED    FAILED
```

Important rule:

> **The frontend never determines authoritative price, entitlement or inventory.**

A compromised browser must not be able to submit:

```json
{
  "item": "rareNFT",
  "price": 0.01
}
```

and have the backend trust it.

The backend resolves price and eligibility from authoritative data.

---

#### 4. Preventing replay and duplicate token transactions

Sensitive actions need:

```text
nonce
+
expiration
+
user/wallet binding
+
idempotency key
+
transaction state
```

Suppose the API times out:

```text
Client
  │
  │ purchase
  ▼
Backend
  │
  ├─────────────> Blockchain
  │                  ✓ transaction submitted
  X
network timeout
```

Do **not** simply resubmit.

Track:

```text
transaction_intent
------------------
intent_id
user_id
wallet
asset
status
chain_tx_id
created_at
```

Then reconcile:

```text
Unknown outcome
      │
      ▼
Blockchain query
      │
 ┌────┴─────┐
 ▼          ▼
Found     Not found
 │
CONFIRM    evaluate safe retry
```

This is exactly the kind of failure-mode reasoning a Lead interviewer wants.

---

#### 5. Protecting collectible/token inventory

If a drop contains finite inventory:

```text
100 NFTs
1,000,000 requests
```

authentication alone does nothing to prevent overselling.

You need an atomic inventory invariant:

```text
AVAILABLE
    │
    │ atomic reservation
    ▼
RESERVED
    │
    │ blockchain confirmed
    ▼
ALLOCATED
```

For off-chain allocation:

```sql
UPDATE inventory
SET status = 'RESERVED',
    reservation_id = :id
WHERE asset_id = :asset
  AND status = 'AVAILABLE';
```

Exactly one caller gets:

```text
rowsAffected = 1
```

Everyone else gets zero.

If the blockchain/smart contract itself enforces supply, that is another safety layer:

```text
application allocation
       +
on-chain maximum supply
```

The ideal security invariant is enforced as close as possible to the authoritative asset layer.

---

#### 6. Crypto key safety

A very strong interview statement:

> “A non-custodial application should never receive or persist the user's wallet seed phrase or private key.”

The wallet signs locally.

```text
Application sees:
public address
signature
transaction ID

Application does NOT see:
seed phrase
private key
```

If a platform is custodial, the design changes:

```text
Application
    │
    ▼
Custody / signing service
    │
    ▼
HSM / hardened KMS
```

Private signing material should not sit in:

```text
.env file
database plaintext
developer laptop
ordinary application memory longer than necessary
```

---

#### Gala CI/CD and launch security

For your token/ICO-launch resume claim, be ready to draw this:

```text
PR
 │
 ▼
Typecheck / lint
 │
 ▼
Unit tests
 │
 ├── authorization
 │
 ├── pricing
 │
 ├── allocation limits
 │
 └── state-machine transitions
 │
 ▼
Integration tests
 │
 ├── wallet-signature validation
 │
 ├── replay/nonce test
 │
 ├── duplicate purchase
 │
 └── chain failure/retry
 │
 ▼
Testnet / staging
 │
 ▼
Load / launch-spike testing
 │
 ▼
Dependency + secret scan
 │
 ▼
High-risk release approval
 │
 ▼
Feature flag / controlled launch
 │
 ▼
Production
 │
 ▼
Live dashboards
 │
 ├── transaction failure rate
 ├── allocation remaining
 ├── duplicate/replay rejects
 ├── p95/p99
 └── reconciliation backlog
```

For irreversible blockchain operations, say:

> “Traditional rollback is not always possible after an on-chain transaction. That increases the importance of pre-deployment validation, feature flags around initiation, testnet rehearsal and reconciliation.”

That sounds like a Lead Web3 engineer rather than a generic backend engineer.

---

### TicketSocket — white-label SSO, tenant identity and merchant payment processing

Your resume supports white-label partner workflows, PostgreSQL transactional processing, webhooks, JWT-based service allocation, AWS ticketing scale and partner APIs. _Oscar Gonzalez - Lead Engineer …_ You have also established in this conversation that Auth0 was used and that different merchants integrated their own processors.

This is the company where I would expect your interviewer to test **authentication, tenant isolation, payments, webhooks and inventory all together**.

---

#### TicketSocket SSO: existing merchant user → white-label TicketSocket

Use your Meow Wolf example.

Conceptually:

```text
                  MEOW WOLF
             existing user account
                    / IdP
                      │
                      │ OIDC or SAML
                      ▼
                    Auth0
                identity broker
                      │
                      │ OIDC
                      ▼
              TicketSocket App
                      │
                      ▼
                TicketSocket API
```

The important security concept is:

> **Meow Wolf should not send TicketSocket its users' passwords. Identity should be federated.**

#### Full redirect flow

Suppose the user is already logged into:

```text
meowwolf.com
```

and clicks:

> My Tickets

Flow:

```text
1. User
   │
   ▼
Meow Wolf
   │
   │ "My Tickets"
   ▼
TicketSocket white-label app
   │
   │ no TicketSocket session yet
   ▼
Redirect → Auth0 /authorize
   │
   │ tenant / connection context
   │ state
   │ nonce
   │ PKCE challenge
   ▼
Auth0
   │
   ▼
Meow Wolf Identity Provider
   │
   │ user already authenticated?
   ├──────────── yes ──────────────┐
   │                               │
   └── no → authenticate user      │
                                   ▼
                         identity assertion
                                   │
                                   ▼
                                 Auth0
                                   │
                           authorization code
                                   │
                                   ▼
                     TicketSocket callback
                                   │
                     exchange code + verifier
                                   │
                                   ▼
                         validated identity
                                   │
                                   ▼
                        TicketSocket session
                                   │
                                   ▼
                          My Tickets page
```

The user experiences this as SSO.

They may see:

```text
Meow Wolf → TicketSocket
```

without entering credentials again because the trusted identity system already has an active login session.

---

#### Safe JWT/token handling

This is important because interviewers may catch sloppy language around “sharing JWTs.”

A stronger statement than:

> “Meow Wolf shares its JWT with TicketSocket”

is:

> “TicketSocket should trust a configured identity issuer through federation. Ideally Auth0 brokers the merchant identity and issues an audience-specific token for the TicketSocket application/API.”

You generally **do not want one generic Meow Wolf bearer token reused everywhere**.

Token:

```json
{
  "sub": "meow-user-9282",
  "tenant_id": "meowwolf",
  "aud": "ticketsocket-api",
  "iss": "trusted-auth0-issuer",
  "exp": ...
}
```

TicketSocket validates:

```text
signature        ✓
issuer           ✓
audience         ✓
expiration       ✓
nonce/state flow ✓
tenant mapping   ✓
```

Then:

```text
external subject
   +
merchant tenant
        │
        ▼
TicketSocket customer identity
```

#### Never put bearer tokens in URLs

Bad:

```text
https://tickets.example.com?jwt=eyJ...
```

URLs can leak into:

```text
browser history
proxy logs
analytics
Referer headers
```

Use authorization-code redirects and secure cookie/session handling instead.

Browser session cookie:

```http
Set-Cookie:
ticketsocket_session=...
Secure;
HttpOnly;
SameSite=Lax
```

---

#### Tenant isolation after SSO

Successful Meow Wolf login is not enough.

Suppose:

```text
user = 123
tenant = meowwolf
```

Ticket history query should effectively become:

```sql
SELECT *
FROM orders
WHERE tenant_id = 'meowwolf'
  AND customer_id = '123';
```

Never:

```sql
SELECT *
FROM orders
WHERE customer_id = '123';
```

if customer identifiers can overlap among tenants.

And don't trust:

```http
GET /orders?tenant=other-company
```

for the tenant authority.

---

#### TicketSocket payment-provider architecture

The payment side is a separate trust boundary.

A merchant could use:

```text
Square
Stripe
Authorize.Net
other processor
```

The rest of TicketSocket should not care which one.

Use an Adapter/Strategy abstraction:

```text
                    Checkout API
                         │
                         ▼
                   Payment Service
                         │
                Merchant Configuration
                         │
              provider = Square
                         │
                         ▼
                  Payment Adapter
                ┌────────┼─────────┐
                ▼        ▼         ▼
             Square    Stripe    Other
```

Conceptual interface:

```ts
interface PaymentProvider {
  authorize(input): Promise<Authorization>;
  capture(input): Promise<Payment>;
  void(input): Promise<void>;
  refund(input): Promise<Refund>;
}
```

That means order logic doesn't contain:

```ts
if (merchant === 'A') Square...
if (merchant === 'B') Stripe...
```

everywhere.

---

#### Merchant payment credentials

Do not store:

```text
merchant.square_secret
```

plaintext in your application DB.

Instead:

```text
Merchant Config DB
------------------
merchant_id
provider
secret_reference
```

and:

```text
AWS Secrets Manager / Vault
---------------------------
ticketsocket/meowwolf/square
  access_token
  refresh_token
  webhook secret
```

Access:

```text
Payment Service    ✓
Analytics          ✗
Frontend           ✗
Inventory Service  ✗
```

This is **least privilege**.

If the processor supports OAuth onboarding:

```text
Merchant Admin
      │
      │ Connect Square
      ▼
Square OAuth
      │
      │ authorization code
      ▼
TicketSocket Backend
      │
      │ server-side exchange
      ▼
OAuth credentials
      │
      ▼
Encrypted secret store
```

The merchant does not need to email TicketSocket their password/API credential.

---

#### Card data/tokenization

A strong payment architecture minimizes TicketSocket's exposure to raw card data.

```text
Customer Browser
      │
      │ card information
      ▼
Square / processor SDK
      │
      │ tokenized payment method
      ▼
TicketSocket Checkout API
      │
      │ payment token
      ▼
Payment Service
      │
      ▼
Square
```

TicketSocket receives:

```text
payment_method_token
```

rather than persisting:

```text
PAN
CVV
```

This materially reduces PCI exposure.

Do not claim TicketSocket's exact PCI architecture unless you remember it, but this is the architecture you should know.

---

#### Ticket purchase + payment security

For ticketing:

```text
                    Customer
                       │
                       ▼
                 Checkout API
                       │
          authenticate + authorize
                       │
                       ▼
               Reservation Service
                       │
             AVAILABLE → HELD
                       │
                       ▼
                 Order Service
                       │
                       ▼
                Payment Service
                       │
          merchant-specific credential
                       │
                       ▼
              Payment Processor
                       │
             ┌─────────┴──────────┐
             ▼                    ▼
          success               failed
             │                    │
             ▼                    ▼
        seat → SOLD          release hold
```

Security/correctness principles overlap here.

The client cannot dictate:

```text
ticket price
merchant account
seat ownership
refund status
```

Those are server-authoritative.

---

#### Idempotent payment flow

Client creates:

```text
checkout_id = ABC123
```

Server derives an idempotency key:

```text
merchant + order + payment_attempt
```

Payment provider request:

```text
Idempotency-Key: payment:ABC123
```

If:

```text
payment succeeds
but HTTP response is lost
```

the retry does not create another charge.

Instead:

```text
same idempotency key
       ↓
same logical operation
```

This is critical to payments.

---

#### Signed webhook verification

Payment providers call TicketSocket asynchronously:

```text
Square
   │
   │ HTTPS webhook
   ▼
Public Webhook Receiver
   │
   ├── preserve raw request if verification requires it
   ├── verify provider signature
   ├── identify configured merchant/provider
   ├── reject invalid signatures
   │
   ▼
Deduplication / event log
   │
   ▼
Queue / broker
   │
   ▼
Payment Consumer
   │
   ▼
Transactional state transition
```

Do not process:

```json
{
  "status": "REFUNDED"
}
```

simply because an HTTP request claims to be Square.

The provider's cryptographic signature must validate.

Then assume legitimate providers will still send duplicates:

```text
event_9384
event_9384
event_9384
```

Store:

```text
provider_event_id UNIQUE
```

or equivalent idempotency record.

---

#### Out-of-order webhook handling

Payment lifecycle:

```text
CREATED
   ↓
IN_PROCESS
   ↓
COMPLETED
   ↓
REFUND_REQUESTED
   ↓
REFUNDED
```

Now imagine:

```text
12:00 COMPLETED
12:01 REFUNDED
12:03 delayed COMPLETED webhook arrives
```

Naive system:

```text
REFUNDED → COMPLETED    ✗
```

Correct system uses:

```text
source version
provider timestamp/sequence where trustworthy
legal state transitions
provider reconciliation
```

so an older event cannot regress authoritative state.

---

#### Merchant refund authorization

Payment-provider credentials being available does not mean every merchant employee may use them.

```text
Merchant employee
       │
       ▼
Authenticate
       │
       ▼
RBAC
manager has refund permission?
       │
       ▼
Tenant check
order belongs to this merchant?
       │
       ▼
Domain check
order status refundable?
       │
       ▼
Payment Service
       │
       ▼
Processor refund
       │
       ▼
Audit log
```

This combines AuthN + AuthZ + payment correctness.

---

#### TicketSocket CI/CD security flow

This is worth memorizing because it ties your security story to your Lead experience:

```text
PR
 │
 ▼
Lint / TypeScript / build
 │
 ▼
Unit tests
 │
 ├── payment state machine
 ├── authorization
 ├── seat allocation
 └── idempotency
 │
 ▼
Integration tests
 │
 ├── Auth0/OIDC token validation
 ├── wrong issuer rejected
 ├── wrong audience rejected
 ├── tenant-A → tenant-B rejected
 ├── provider sandbox transaction
 ├── webhook signature valid
 ├── webhook invalid signature rejected
 ├── duplicate webhook no-op
 └── refund permission tests
 │
 ▼
Concurrency tests
 │
 └── 100 callers compete for one seat
          → exactly one wins
 │
 ▼
Secret/dependency/security scanning
 │
 ▼
Staging
 │
 ▼
Payment-provider sandbox E2E
 │
 ▼
Controlled deployment
 │
 ▼
Production monitoring
     payment failures
     webhook failures
     auth rejection spikes
     duplicate events
     seat contention
     p95/p99
```

That is a very strong Lead Engineer answer because it demonstrates that security is something you **continuously verify**, not a middleware library you configure once.

---

### Gala vs Frequence vs TicketSocket — security comparison

This table is useful to memorize because it lets you tailor your answer to the domain rather than giving the same generic JWT explanation every time.

| Company/use case                | Most important security invariant                                                                                               | Primary security patterns                                                                                                                      |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Frequence multi-tenant SaaS** | Tenant A must never access Tenant B's business data.                                                                            | Trusted tenant context, RBAC/ABAC, tenant-scoped DB queries/cache/events, negative isolation testing.                                          |
| **Gala Web3**                   | Only the authorized account/wallet can perform a valid transaction, and scarce/digital assets cannot be duplicated or replayed. | Account auth, MFA/step-up, wallet challenge/signature, nonce, idempotency, transaction state machine, protected keys, authoritative inventory. |
| **TicketSocket SSO**            | Merchant users can seamlessly authenticate without TicketSocket owning/copying the merchant's passwords.                        | Auth0 federation, OIDC/SAML, authorization code + PKCE, audience-restricted tokens, secure sessions.                                           |
| **TicketSocket multi-tenant**   | Merchant A can never see Merchant B's customers/orders/tickets.                                                                 | JWT/session tenant identity, RBAC, tenant-bound resource queries.                                                                              |
| **TicketSocket payments**       | Only authorized merchant actions can charge/refund through the correct merchant processor, exactly once logically.              | Tenant-scoped secrets, tokenization, adapter pattern, idempotency, audit logs.                                                                 |
| **TicketSocket webhooks**       | Only authentic provider events change payment state, and duplicates/out-of-order events cannot corrupt it.                      | Signature verification, event dedupe, state/version guards, queue, DLQ/reconciliation.                                                         |
| **TicketSocket inventory**      | One finite seat cannot be sold twice.                                                                                           | Admission control, atomic hold, strong consistency, TTL, payment Saga.                                                                         |

---

### What “zero trust” means in these systems

You don't need to say “zero trust” constantly, but the design principle is useful:

```text
Internet request
→ untrusted

Frontend claims
→ untrusted

JWT
→ untrusted until cryptographically verified

Internal service call
→ authenticated/authorized

Webhook
→ untrusted until signature verified

Queue message
→ schema + provenance validated

Tenant ID from browser
→ never trusted

Wallet address entered by user
→ not ownership proof

Payment status from frontend
→ never authoritative
```

That is the mindset a Lead interviewer wants.

---

### Three 60-second interview answers to memorize

#### Frequence

> “For Frequence, I think about security primarily as multi-tenant authorization. Authentication establishes the user, but every business operation also needs trusted tenant context and role permissions. I would derive the tenant from authenticated identity rather than a caller-supplied parameter, then bind that tenant throughout the API, database query, cache namespace and asynchronous event path. RBAC handles broad capabilities, while resource and workflow attributes handle fine-grained authorization. Angular guards improve UX but aren't security—the APIs enforce the policy. In CI I'd specifically test negative cross-tenant paths because the highest-severity failure is Tenant A seeing Tenant B's campaign or reporting data.”

#### Gala

> “At Gala I separate account identity, wallet ownership and blockchain transaction authorization. A user first authenticates to the application; sensitive operations can require step-up authentication. To establish wallet ownership, the backend generates a short-lived one-time challenge that the wallet signs locally, so the private key never leaves the wallet. For purchases or token operations, the backend validates price, eligibility and inventory, creates an idempotent transaction intent, and tracks the transaction through submitted, pending, confirmed or failed states. Replay prevention, nonces, reconciliation and atomic inventory allocation are important because a blockchain timeout is not necessarily a failed transaction.”

#### TicketSocket

> “For TicketSocket there were two major trust boundaries. On the identity side, white-label merchants wanted existing users to access TicketSocket without another account, so Auth0 could act as the identity broker between the merchant IdP and TicketSocket through federation such as OIDC or SAML. TicketSocket trusts a signed audience-specific identity rather than receiving the user's password, then scopes every API request by merchant and user. Separately, each merchant could have its own payment processor, so provider integrations belong behind a common payment-service interface with tenant-scoped secrets. Card details should be tokenized by the provider; webhook signatures must be verified; and payment/refund processing must be idempotent because provider events can be duplicated or arrive out of order.”

Those three answers are strong because they demonstrate **three different security architectures** rather than repeating “JWT + API Gateway” for every company.

The interview-level principle tying your career examples together is:

```text
Authenticate the actor
        ↓
derive trusted identity context
        ↓
authorize the specific action
        ↓
bind authorization to the resource/tenant
        ↓
perform the state transition atomically/idempotently
        ↓
audit it
        ↓
propagate only the minimum trusted context
        ↓
continuously test the negative security paths in CI/CD
```

That is the security thread I would weave through your interview tomorrow.

# Appendix A — Pre-interview checklist: every [VERIFY] marker

Each line below is a detail the answers could not establish from the résumé or the repository. Confirm it from memory before the interview, or soften the claim.

**Gala Games & Entertainment — Lead Full Stack SE**

- 1. Full-stack engineering across Vue, React Native TV, APIs, and blockchain › Follow-up: “You keep saying we. What did YOU own?”: “The broader product was obviously a team effort. My personal ownership was at the architecture and implementation boundaries I can defend in detail. For example, I pe…
- 3. Gala NestJS/AWS/GCP/MongoDB at 10,000+ concurrency › Q1. “What changed between before and after scaling?”: replicas/shards [VERIFY]
- 3. Gala NestJS/AWS/GCP/MongoDB at 10,000+ concurrency › Q3. “How were NestJS services deployed? Stateless?”: [VERIFY] your actual AWS runtime—ECS, Kubernetes, EC2, Lambda, etc.—before naming it.
- 4. Vision API + vector search + Sanity › Q4. “Which model and vector DB?”: [VERIFY].

**Frequence + Madhive — Lead Senior SE**

- 8. Angular widget framework › Q1. “What was a widget?”: Exact interface [VERIFY]; use it conceptually unless you remember actual code.
- 9. Playwright/Jest/Claude/Datadog testing › Q2. “Where was Claude multimodal used?”: [VERIFY exact usage].
- 9. Playwright/Jest/Claude/Datadog testing › Q4. “How did tests run in CI?”: [VERIFY CI provider].
- 9. Playwright/Jest/Claude/Datadog testing › Q5. “Explain 50% bug reduction and 60% manual QA reduction.”: “I would define the metrics before presenting them. Production bug reduction was based on [VERIFY exact tracking source/time period]. Manual QA reduction was based on …

**TicketSocket & IceCreamSocial — Lead Full Stack SE**

- 11. AngularJS → React + TypeScript › Q2. “How did AngularJS and React coexist?”: Use your actual implementation [VERIFY].
- 14. AWS ticketing scaling 350 → 10,000+ › Q1. “Draw before and after.”: Exact AWS components [VERIFY].

**Visa — Full Stack Engineer**

- 17. Real-time vendor portal › Q1. “What does real-time mean?”: [VERIFY exact mechanism].

**Enfav LLC and the personal projects — the current project: the quality-loop engine and agentic memory**

- 19. The quality loop: one shared AI core (producer → critics → evaluators → controller → trace) › Q1. “Draw the quality loop end to end.”: Code facts in this area are of the working tree at HEAD `9cd3c978` (2026-10-31) unless a figure says otherwise; every measurement carries its own date and source, and …
- 19. The quality loop: one shared AI core (producer → critics → evaluators → controller → trace) › Q7. “What did you measure, and what did you change because of a measurement?”: The rule the repository is built to is that a failing run is evidence about the engine, never a licence to special-case its input, and that a change you cannot demonst…
- 19. The quality loop: one shared AI core (producer → critics → evaluators → controller → trace) › Q7. “What did you measure, and what did you change because of a measurement?”: | undated | narrowing a mission to help one site raised false refusals from 3/8 to 6/8 | reverted; the date and the mission are yours to name [VERIFY] (`CLAUDE.md`, TO…
- 20. Memory: digest and recall › Q2. “Why digest through the quality loop?”: [VERIFY] The sweep behind the cap lesson (96 pre-canvas digest runs, 1,142 statements, longest 288; one canvas record at 735, 573 and 751 across three attempts; two ov…
- 20. Memory: digest and recall › Q3. “Postgres plus Qdrant: what lives where?”: [VERIFY] The 1,047-point count is from a session measurement note (recall-controls-result, 2026-10-03) and the 163-memory tenant count from the tracked `docs/agentic-s…
- 20. Memory: digest and recall › Q4. “How does recall work, and who sees it?”: [VERIFY] The 20 of 20, 16 of 16, 316-call, +0.5 give or take 9, sd 7.4, 8.8-point and 30-pair figures come from the session measurement note recall-controls-result (20…
- 20. Memory: digest and recall › Q5. “Admission, duplicates, retraction and unit scoping”: [VERIFY] The first freeze (6 points, 92.6 and 94.0; note quality-loop-memory-frozen, 2026-09-09), the admission counts since (over ten experience digests, 79 memories …
- 20. Memory: digest and recall › Q6. “The agentic-memory runtime and the job assistant's migration”: [VERIFY] The runtime's 15 of 15 live checks (2026-10-17) are recorded in the working tree's `docs/agentic-system/overview.md`, uncommitted at HEAD `9cd3c978`, and that…
- 20. Memory: digest and recall › Follow-up: “How do you re-index safely?”: [VERIFY] The 444-chunk collection size behind rule 4 (quality-loop-knowledge-lane, 2026-10-03), the 2026-10-14 backup location (`static/memory-ingest/backup-2026-10-14…
- 21. Platform, delivery, security and observability › Q1. “Draw the deployment topology.”: In CI (GitHub Actions) the `verify` job reproduces the stack with service containers (postgres:16-alpine on 5432, qdrant v1.19.1 on 6333) on `DB_NAME=sysdesign_test`, …
- 21. Platform, delivery, security and observability › Q2. “CI/CD: what gates a change?”: Migrations are hand-written SQL, one concern per file, applied transactionally all-or-nothing into `mikro_orm_migrations`; `ormOptions` is the one object every DbModul…
- 21. Platform, delivery, security and observability › Follow-up: “How would you scale this to many tenants and concurrent runs?”: What blocks, in order of pain: (1) the model door is one subscription account — a weekly limit already surfaced as `brain-unavailable … rate_limit: weekly limit` at st…
- 22. The same engine behind the Studio and browser automation; ownership and evidence › Q3. “What did you personally own, and what evidence backs the numbers?”: Three things only the owner can confirm: the résumé (docs/ingestion/Resume_2026_c.pdf, a local file — `docs/ingestion/` is gitignored, so it is not in the repository) …

**7. Security catalog — quick-reference definitions**

- Identity, federation and protocols: | SAML | XML-based enterprise federation protocol. Common alternative to OIDC for enterprise IdPs. | Possible enterprise TicketSocket clients [VERIFY actual client pro…

**9. Security by company — Frequence multi-tenant SaaS, Gala Web3 accounts and inventory, TicketSocket SSO, payments and webhooks**

- Gala — account, wallets, token transactions and scarce digital inventory › 1. Gala account authentication: ├── password/SSO [VERIFY]
- Gala — account, wallets, token transactions and scarce digital inventory › 1. Gala account authentication: ├── MFA [VERIFY actual Gala use]

# Appendix B — Theme index: components, CI/CD, security, diagrams and more

Where each theme is discussed, so a topic can be revised across every company and chapter. Numbers after a section name are the résumé bullet or chapter; “Q” numbers are questions under it. Sections whose answers include a diagram are marked ▣.

**System design components and architecture**

- 0. Study notes: API gateway responsibilities, S3 event notifications,…: The components that come up most often in interviews ▣; API gateway responsibilities; 1. Rate Limiting (Why it needs State); 2. Authentication & Authorization; 3. Request Transformation; 4. API Versioning; Why Infrastructure Wins Over Application Code; Approach 1: The Cloud/Infrastructure Way (Recommended); Option A: Managed Cloud (AWS API Gatewa…; The interview mindset; Fan-out for feeds ▣; S3 event notifications ▣; How S3 Natively Interfaces with a Queue ▣; Why This Design Makes Sense (The Architecture Breakdown) ▣; 1. Decoupling the Upload from the Trans…; 2. Absorbing Traffic Spikes (Load Level…; 3. Parallel Processing (The Worker Spli…; The problem → component map
- 1. Common components of a scalable system: The components that come up most often in interviews ▣; A common scalable architecture to keep in your head ▣
- 2. Ten high-yield architectures, a notification system, and the patte…: 1. URL Shortener ▣; 2. Twitter / X News Feed ▣; 3. Instagram / Image Sharing ▣; 4. YouTube / Video Streaming ▣; 5. WhatsApp / Real-Time Chat ▣; 6. Uber / Lyft ▣; 7. Amazon / E-Commerce Checkout ▣; 8. Ticketmaster / Flash-Sale Ticketing ▣; 9. Google Drive / Dropbox ▣; 10. Search Engine / Elasticsearch-Style Search ▣; Bonus: Notification System ▣; The pattern you should recognize in almost every interview ▣; For your interview in one hour, memorize this sequence ▣
- 3. SQL vs NoSQL, database indexes, and Kafka event streaming: 4. Is Elasticsearch/OpenSearch also an "index"?; 4 › Search index ▣; 5. Kafka / event streaming ▣; 6. Real Kafka example ▣; 7. How do I determine Kafka topics? ▣; 8. Kafka partitions ▣; 10. What is a consumer group? ▣; 10 › Consumers within the SAME group ▣; 11. Different consumer groups = pub/sub ▣; 11 › Queue behavior; 11 › Pub/sub behavior; 12. Topic vs partition vs consumer group ▣; 13. Example interview architecture ▣; 14. Kafka vs normal message queue; 14 › Queue ▣; 14 › Kafka ▣; Interview cheat sheet; Kafka
- 4. Cassandra and wide-column databases: Why use Cassandra? ▣
- 5. Explaining security at TicketSocket: Auth0 identity federation and…: 1. White-label authentication with Auth0 ▣; Payment processors: think “tenant-scoped provider adapters” ▣; Square webhook security ▣; A very strong way to connect both sides in your interview
- 6. Edge layer, admission tokens, sessions, and cookies in a waiting-r…: 1. What exactly is the “edge layer”? ▣; 8. Where would session state be stored? ▣; 9. Or you can avoid server-side sessions ▣; 9 › Stateful ▣; 10. How does the browser get redirected? ▣; 11. What happens after the user gets admitted? ▣; 14. Full example; 14 › Request 1 ▣; 16. Queue polling; 17. Client redirects after admission ▣; 20. A complete architecture ▣; 23. What I'd do in a real design ▣; The simplest mental model ▣
- Gala Games & Entertainment — Lead Full Stack SE: 1. Full-stack engineering across Vue, React Native TV, APIs…; 1 › Q1 ▣; 1 › Q2 ▣; 1 › Q4 ▣; 2. Gala Film creator-to-fan media, ownership and rewards; 2 › Q1 ▣; 2 › Q3 ▣; 2 › Q4 ▣; 2 › Q5 ▣; 3. Gala NestJS/AWS/GCP/MongoDB at 10,000+ concurrency; 3 › Q1 ▣; 3 › Q3 ▣; 3 › “Why AWS and GCP?” ▣; 4. Vision API + vector search + Sanity ▣; 4 › Q1 ▣; 5. Token / ICO launch flows; 5 › Q1 ▣
- Frequence + Madhive — Lead Senior SE: 6. Platform execution / engineering maturity; 6 › Q2 ▣; 6 › Q3 ▣; 7 › Q4 ▣; 8. Angular widget framework ▣; 8 › Q1 ▣; 8 › Q2 ▣; 8 › Q3 ▣; 8 › Q5 ▣; 10 › Q5 ▣
- TicketSocket & IceCreamSocial — Lead Full Stack SE: 11. AngularJS → React + TypeScript; 11 › Q1 ▣; 11 › Q2 ▣; 11 › Q3 ▣; 12. Configurable dashboards and white-label workflows; 12 › Q1 ▣; 12 › Q2 ▣; 12 › Q5 ▣; 13 › Q2 ▣; 13 › Q4 ▣; 14. AWS ticketing scaling 350 → 10,000+ ▣; 14 › Q1 ▣; 14 › Q2 ▣; 14 › Q4 ▣; 15 › Q4
- Visa — Full Stack Engineer: 16 › Q1 ▣; 16 › Q4 ▣; 16 › Follow-up: “Would 15-minute stale risk data b… ▣; 17. Real-time vendor portal; 17 › Q1 ▣; 17 › Q2 ▣; 17 › Q3 ▣
- Personal Project — Agentic Engine: 18. Agentic Engine; 18 › Q1 ▣; 18 › Q2 ▣; 18 › Q3 ▣; 18 › Q6 ▣; 18 › Q10 ▣
- The 10 cross-cutting questions they can ask about any bullet: 1. “Draw it.” ▣; 3. “Why that technology?” ▣
- 7. Security catalog — quick-reference definitions: The security mental model ▣; The security mental model ▣
- 8. Authentication and authorization — best practices and flows: Authentication flow ▣; Authorization flow ▣; Best-practice split between gateway and service ▣; Sessions vs JWTs ▣; Service-to-service authentication ▣; Policy layer ▣; A strong interview system-design answer ▣; Authentication flow ▣; Authorization flow ▣; Best-practice split between gateway and service ▣; Sessions vs JWTs ▣; Service-to-service authentication ▣; Policy layer ▣; A strong interview system-design answer ▣
- 9. Security by company — Frequence multi-tenant SaaS, Gala Web3 accou…: Lead-level architecture ▣; Layer the tenant isolation ▣; Gala — account, wallets, token transactions and scarce digi… ▣; 6. Crypto key safety ▣; TicketSocket SSO: existing merchant use… ▣; Full redirect flow ▣; TicketSocket payment-provider architect… ▣; Merchant payment credentials ▣; Card data/tokenization ▣; Ticket purchase + payment security ▣; Signed webhook verification ▣; Gala vs Frequence vs TicketSocket — security comparison; What “zero trust” means in these systems ▣; TicketSocket ▣
- Enfav LLC and the personal projects — the current project: the quality-loop engine and agentic memory: 19 › Q1 ▣; 19 › Q2 ▣; 19 › Q3 ▣; 19 › Q4 ▣; 19 › Q6 ▣; 19 › Follow-up: orchestrator versus pipeline ▣; 20 › Q1 ▣; 20 › Q6 ▣; 21 › Q1 ▣; 22 › Q1 ▣; 22 › Q2 ▣

**CI/CD, release and deployment**

- 0. Study notes: API gateway responsibilities, S3 event notifications,…: 4. API Versioning; Approach 1: The Cloud/Infrastructure Way (Recommended); Option A: Managed Cloud (AWS API Gatewa…
- Gala Games & Entertainment — Lead Full Stack SE: 1. Full-stack engineering across Vue, React Native TV, APIs…; 1 › Q1 ▣; 3. Gala NestJS/AWS/GCP/MongoDB at 10,000+ concurrency; 3 › Q3 ▣; 5. Token / ICO launch flows; 5 › Q5 ▣
- Frequence + Madhive — Lead Senior SE: 6 › Q1 ▣; 6 › Q5 ▣; 7 › Q1 ▣; 7 › Q2 ▣; 7 › Q5 ▣; 8 › Q4 ▣; 9 › Q4 ▣
- TicketSocket & IceCreamSocial — Lead Full Stack SE: 15 › Q1 ▣; 15 › Q3 ▣; 15 › Q5 ▣
- 8. Authentication and authorization — best practices and flows: CI/CD security ▣; CI/CD security ▣
- 9. Security by company — Frequence multi-tenant SaaS, Gala Web3 accou…: Frequence CI/CD security flow ▣; Gala CI/CD and launch security ▣; TicketSocket CI/CD security flow ▣; Frequence
- Enfav LLC and the personal projects — the current project: the quality-loop engine and agentic memory: 21 › Q1 ▣; 21 › Q2 ▣; 21 › Follow-up: production multi-tenant service

**Security: authentication, authorization, tenancy, secrets, webhooks**

- 0. Study notes: API gateway responsibilities, S3 event notifications,…: API gateway responsibilities; 2. Authentication & Authorization; Option A: Managed Cloud (AWS API Gatewa…
- 5. Explaining security at TicketSocket: Auth0 identity federation and…: 1. White-label authentication with Auth0 ▣; 2. The JWT might contain tenant context ▣; 3. Don't claim an exact Auth0 configuration you don't remem…; Payment processors: think “tenant-scoped provider adapters” ▣; How credentials should be secured ▣; If the processor supports OAuth ▣; Card data ▣; Square webhook security ▣; Payment authorization needs multiple layers ▣; A very strong way to connect both sides in your interview
- 6. Edge layer, admission tokens, sessions, and cookies in a waiting-r…: 1. What exactly is the “edge layer”? ▣; 2. What is an admission token? ▣; 3. Why use an admission token? ▣; 4. Admission token vs login JWT ▣; 5. What is a session?; 6. What is a cookie? ▣; 7. Cookie vs session ▣; 9. Or you can avoid server-side sessions ▣; 9 › Stateless ▣; 10. How does the browser get redirected? ▣; 11. What happens after the user gets admitted? ▣; 12. Should the client also check? ▣; 13. The proper design is both client and server enforcement; 14. Full example; 14 › Request 1 ▣; 15. What do Secure / HttpOnly / SameSite mean?; 15 › Secure; 15 › HttpOnly; 15 › SameSite; 16. Queue polling; 17. Client redirects after admission ▣; 18. What if the user manually changes the URL? ▣; 19. Page route vs API route; 20. A complete architecture ▣; 21. One subtle point: authenticated vs anonymous buyers ▣; 23. What I'd do in a real design ▣; The simplest mental model ▣
- Gala Games & Entertainment — Lead Full Stack SE: 2. Gala Film creator-to-fan media, ownership and rewards; 2 › Q1 ▣; 2 › Q3 ▣; 2 › Q4 ▣; 3. Gala NestJS/AWS/GCP/MongoDB at 10,000+ concurrency; 3 › “Why AWS and GCP?” ▣
- Frequence + Madhive — Lead Senior SE: 6 › Q5 ▣
- TicketSocket & IceCreamSocial — Lead Full Stack SE: 12. Configurable dashboards and white-label workflows; 12 › Q2 ▣; 12 › Q3 ▣; 12 › Q4 ▣; 13. PostgreSQL, stored procedures, triggers, webhooks, tran…; 13 › Q5 ▣; 14 › Q2 ▣
- Visa — Full Stack Engineer: 17. Real-time vendor portal; 17 › Q4 ▣
- Personal Project — Agentic Engine: 18 › Q7 ▣
- The 10 cross-cutting questions they can ask about any bullet: 9. “How is it secured?” ▣
- 7. Security catalog — quick-reference definitions: Identity, federation and protocols; Tokens and claims; Access control and tenancy; Sessions and the browser; Strong authentication; Keys, signatures, replay and integrity; Secrets, least privilege and infrastructure; Browser boundaries that are not security; Web3 transactions; Alphabetical index of terms; The security mental model ▣; Identity, federation and protocols; Tokens and claims; Access control and tenancy; Sessions and the browser; Strong authentication; Keys, signatures, replay and integrity; Secrets, least privilege and infrastructure; Browser boundaries that are not security; Web3 transactions; Alphabetical index of terms; The security mental model ▣
- 8. Authentication and authorization — best practices and flows: Authentication flow ▣; Authorization flow ▣; Best-practice split between gateway and service ▣; RBAC vs ABAC ▣; Multi-tenant security ▣; Sessions vs JWTs ▣; Token lifetimes ▣; Cookies ▣; CSRF vs XSS ▣; Service-to-service authentication ▣; Secrets management ▣; Password storage; Authorization should be deny-by-default ▣; Policy layer ▣; API design: 401 vs 403 ▣; Authorization and database queries ▣; Rate limiting and abuse prevention; Logging and audit ▣; Distributed tracing ▣; CI/CD security ▣; Failure behavior ▣; Key rotation ▣; A strong interview system-design answer ▣; Authentication flow ▣; Authorization flow ▣; Best-practice split between gateway and service ▣; RBAC vs ABAC ▣; Multi-tenant security ▣; Sessions vs JWTs ▣; Token lifetimes ▣; Cookies ▣; CSRF vs XSS ▣; Service-to-service authentication ▣; Secrets management ▣; Password storage; Authorization should be deny-by-default ▣; Policy layer ▣; API design: 401 vs 403 ▣; Authorization and database queries ▣; Rate limiting and abuse prevention; Logging and audit ▣; Distributed tracing ▣; CI/CD security ▣; Failure behavior ▣; Key rotation ▣; A strong interview system-design answer ▣
- 9. Security by company — Frequence multi-tenant SaaS, Gala Web3 accou…: Frequence/Madhive — multi-tenant SaaS security; Lead-level architecture ▣; Layer the tenant isolation ▣; RBAC + ABAC ▣; Frontend responsibility ▣; Frequence CI/CD security flow ▣; Gala — account, wallets, token transactions and scarce digi… ▣; 1. Gala account authentication ▣; 2. Proving wallet ownership ▣; 3. Sensitive token/collectible transact… ▣; 4. Preventing replay and duplicate toke… ▣; 5. Protecting collectible/token invento… ▣; 6. Crypto key safety ▣; Gala CI/CD and launch security ▣; TicketSocket — white-label SSO, tenant identity and merchan…; TicketSocket SSO: existing merchant use… ▣; Full redirect flow ▣; Safe JWT/token handling ▣; Never put bearer tokens in URLs ▣; Tenant isolation after SSO ▣; TicketSocket payment-provider architect… ▣; Merchant payment credentials ▣; Card data/tokenization ▣; Ticket purchase + payment security ▣; Signed webhook verification ▣; Merchant refund authorization ▣; TicketSocket CI/CD security flow ▣; Gala vs Frequence vs TicketSocket — security comparison; What “zero trust” means in these systems ▣; Three 60-second interview answers to memorize; Frequence; Gala; TicketSocket ▣
- Enfav LLC and the personal projects — the current project: the quality-loop engine and agentic memory: 20 › Q3 ▣; 20 › Q4 ▣; 20 › Q5; 20 › Q6 ▣; 21 › Q3 ▣; 21 › Follow-up: production multi-tenant service; 22 › Q2 ▣

**Scaling and performance**

- 0. Study notes: API gateway responsibilities, S3 event notifications,…: The components that come up most often in interviews ▣; API gateway responsibilities; 1. Rate Limiting (Why it needs State); Why Infrastructure Wins Over Application Code; Option A: Managed Cloud (AWS API Gatewa…; The interview mindset; Fan-out for feeds ▣; S3 event notifications ▣; Why This Design Makes Sense (The Architecture Breakdown) ▣; 1. Decoupling the Upload from the Trans…; 2. Absorbing Traffic Spikes (Load Level…; 3. Parallel Processing (The Worker Spli…; The problem → component map
- 1. Common components of a scalable system: The components that come up most often in interviews ▣; A common scalable architecture to keep in your head ▣
- 2. Ten high-yield architectures, a notification system, and the patte…: 1. URL Shortener ▣; 2. Twitter / X News Feed ▣; 3. Instagram / Image Sharing ▣; 4. YouTube / Video Streaming ▣; 5. WhatsApp / Real-Time Chat ▣; 6. Uber / Lyft ▣; 7. Amazon / E-Commerce Checkout ▣; 8. Ticketmaster / Flash-Sale Ticketing ▣; 9. Google Drive / Dropbox ▣; 10. Search Engine / Elasticsearch-Style Search ▣; Bonus: Notification System ▣; The pattern you should recognize in almost every interview ▣; For your interview in one hour, memorize this sequence ▣
- 3. SQL vs NoSQL, database indexes, and Kafka event streaming: 1. SQL vs. NoSQL — when to use each; 1 › NoSQL — MongoDB, DynamoDB, Cassandra ▣; 1 › Interview shortcut ▣; 2. Database indexes ▣; 2 › Common index use cases; 3. Why not index everything? ▣; 5. Kafka / event streaming ▣; 8. Kafka partitions ▣; 9. How do you choose the partition key? ▣; 10. What is a consumer group? ▣; 10 › Consumers within the SAME group ▣; 11. Different consumer groups = pub/sub ▣; 12. Topic vs partition vs consumer group ▣; 13. Example interview architecture ▣; 14. Kafka vs normal message queue; Interview cheat sheet; NoSQL; Indexes; Kafka
- 4. Cassandra and wide-column databases: Why use Cassandra? ▣; Why is it called "wide-column"? ▣; Cassandra vs PostgreSQL ▣
- 6. Edge layer, admission tokens, sessions, and cookies in a waiting-r…: 8. Where would session state be stored? ▣; 9. Or you can avoid server-side sessions ▣; 9 › Stateless ▣; 23. What I'd do in a real design ▣
- Gala Games & Entertainment — Lead Full Stack SE: 2. Gala Film creator-to-fan media, ownership and rewards; 2 › Q1 ▣; 2 › Q3 ▣; 3. Gala NestJS/AWS/GCP/MongoDB at 10,000+ concurrency; 3 › Q1 ▣; 3 › Q2 ▣; 3 › Q3 ▣; 3 › Q4 ▣; 3 › Q5 ▣; 3 › “What state prevented NestJS from being…; 3 › “How did you handle DB connection pooli… ▣; 5. Token / ICO launch flows; 5 › Q1 ▣
- Frequence + Madhive — Lead Senior SE: 6 › Q3 ▣; 6 › Q5 ▣
- TicketSocket & IceCreamSocial — Lead Full Stack SE: 12 › Q5 ▣; 13 › Q1 ▣; 14. AWS ticketing scaling 350 → 10,000+ ▣; 14 › Q1 ▣; 14 › Q4 ▣; 14 › Q5; 14 › Follow-up: “Why Redis?” ▣
- Visa — Full Stack Engineer: 16 › Q2 ▣; 16 › Q3 ▣; 16 › Follow-up: “Would 15-minute stale risk data b… ▣
- Personal Project — Agentic Engine: 18 › Q10 ▣
- The 10 cross-cutting questions they can ask about any bullet: 4. “What was the scale?” ▣
- 8. Authentication and authorization — best practices and flows: Authentication flow ▣; Sessions vs JWTs ▣; Authentication flow ▣; Sessions vs JWTs ▣
- 9. Security by company — Frequence multi-tenant SaaS, Gala Web3 accou…: 5. Protecting collectible/token invento… ▣
- Enfav LLC and the personal projects — the current project: the quality-loop engine and agentic memory: 19 › Follow-up: loop limits; 21 › Follow-up: many tenants and concurrent runs ▣

**Data modeling and storage**

- 0. Study notes: API gateway responsibilities, S3 event notifications,…: The components that come up most often in interviews ▣; The interview mindset; Fan-out for feeds ▣; S3 event notifications ▣; How S3 Natively Interfaces with a Queue ▣; The problem → component map
- 1. Common components of a scalable system: The components that come up most often in interviews ▣; A common scalable architecture to keep in your head ▣
- 2. Ten high-yield architectures, a notification system, and the patte…: 1. URL Shortener ▣; 2. Twitter / X News Feed ▣; 3. Instagram / Image Sharing ▣; 4. YouTube / Video Streaming ▣; 6. Uber / Lyft ▣; 9. Google Drive / Dropbox ▣; 10. Search Engine / Elasticsearch-Style Search ▣; The pattern you should recognize in almost every interview ▣; For your interview in one hour, memorize this sequence ▣
- 3. SQL vs NoSQL, database indexes, and Kafka event streaming: 1. SQL vs. NoSQL — when to use each; 1 › SQL — PostgreSQL, MySQL, SQL Server ▣; 1 › NoSQL — MongoDB, DynamoDB, Cassandra ▣; 1 › Interview shortcut ▣; 2. Database indexes ▣; 2 › Common index use cases; 3. Why not index everything? ▣; 4. Is Elasticsearch/OpenSearch also an "index"?; 4 › Database index ▣; 4 › Search index ▣; 7. How do I determine Kafka topics? ▣; 9. How do you choose the partition key? ▣; 13. Example interview architecture ▣; 14. Kafka vs normal message queue; Interview cheat sheet; SQL; NoSQL; Indexes
- 4. Cassandra and wide-column databases: Why use Cassandra? ▣; Why is it called "wide-column"? ▣; Cassandra vs PostgreSQL ▣; Cassandra vs MongoDB ▣
- 5. Explaining security at TicketSocket: Auth0 identity federation and…: 2. The JWT might contain tenant context ▣; How credentials should be secured ▣
- 6. Edge layer, admission tokens, sessions, and cookies in a waiting-r…: 5. What is a session?; 7. Cookie vs session ▣; 8. Where would session state be stored? ▣; 9 › Stateful ▣; 20. A complete architecture ▣; 21. One subtle point: authenticated vs anonymous buyers ▣; 22. A good session model
- Gala Games & Entertainment — Lead Full Stack SE: 1. Full-stack engineering across Vue, React Native TV, APIs…; 1 › Q2 ▣; 1 › Q3 ▣; 2. Gala Film creator-to-fan media, ownership and rewards; 2 › Q2 ▣; 2 › Q3 ▣; 3. Gala NestJS/AWS/GCP/MongoDB at 10,000+ concurrency; 3 › Q4 ▣; 3 › Follow-up: “Why MongoDB instead of PostgreSQL… ▣; 3 › “What state prevented NestJS from being…; 4. Vision API + vector search + Sanity ▣; 4 › Q4; 5. Token / ICO launch flows; 5 › Q2 ▣; 5 › Q3 ▣
- Frequence + Madhive — Lead Senior SE: 8 › Q4 ▣
- TicketSocket & IceCreamSocial — Lead Full Stack SE: 12. Configurable dashboards and white-label workflows; 12 › Q3 ▣; 12 › Q5 ▣; 13. PostgreSQL, stored procedures, triggers, webhooks, tran…; 13 › Q1 ▣; 13 › Q2 ▣; 13 › Q3 ▣; 13 › Q5 ▣; 14 › Q3 ▣; 14 › Follow-up: “Why Redis?” ▣; 14 › Follow-up: “Why not Redis alone as seat sourc… ▣
- Visa — Full Stack Engineer: 16 › Q2 ▣; 17 › Q3 ▣; 17 › Q4 ▣
- Personal Project — Agentic Engine: 18 › Q1 ▣; 18 › Q8 ▣
- 8. Authentication and authorization — best practices and flows: Multi-tenant security ▣; Authorization and database queries ▣; Multi-tenant security ▣; Authorization and database queries ▣
- 9. Security by company — Frequence multi-tenant SaaS, Gala Web3 accou…: Lead-level architecture ▣; Layer the tenant isolation ▣; 3. Sensitive token/collectible transact… ▣; 4. Preventing replay and duplicate toke… ▣; 5. Protecting collectible/token invento… ▣; Tenant isolation after SSO ▣; Merchant payment credentials ▣; Signed webhook verification ▣
- Enfav LLC and the personal projects — the current project: the quality-loop engine and agentic memory: 19 › Follow-up: lessons stored, who reads them ▣; 20 › Q1 ▣; 20 › Q2; 20 › Q3 ▣; 20 › Q5; 20 › Q6 ▣; 20 › Follow-up: consistency model; 20 › Follow-up: re-index safely

**Consistency, idempotency and duplicates**

- 0. Study notes: API gateway responsibilities, S3 event notifications,…: The problem → component map
- 2. Ten high-yield architectures, a notification system, and the patte…: 5. WhatsApp / Real-Time Chat ▣; 6. Uber / Lyft ▣; 7. Amazon / E-Commerce Checkout ▣; 8. Ticketmaster / Flash-Sale Ticketing ▣; 9. Google Drive / Dropbox ▣; 10. Search Engine / Elasticsearch-Style Search ▣; Bonus: Notification System ▣; The pattern you should recognize in almost every interview ▣; For your interview in one hour, memorize this sequence ▣
- 3. SQL vs NoSQL, database indexes, and Kafka event streaming: 1. SQL vs. NoSQL — when to use each; 1 › SQL — PostgreSQL, MySQL, SQL Server ▣; 1 › Interview shortcut ▣; 9. How do you choose the partition key? ▣; 12. Topic vs partition vs consumer group ▣; 13. Example interview architecture ▣; Interview cheat sheet; SQL; Kafka
- 5. Explaining security at TicketSocket: Auth0 identity federation and…: Square webhook security ▣
- Gala Games & Entertainment — Lead Full Stack SE: 1. Full-stack engineering across Vue, React Native TV, APIs…; 1 › Q1 ▣; 1 › Q3 ▣; 2. Gala Film creator-to-fan media, ownership and rewards; 2 › Q4 ▣; 2 › Q5 ▣; 5. Token / ICO launch flows; 5 › Q1 ▣; 5 › Q2 ▣; 5 › Q3 ▣; 5 › Q4 ▣
- TicketSocket & IceCreamSocial — Lead Full Stack SE: 13. PostgreSQL, stored procedures, triggers, webhooks, tran…; 13 › Q4 ▣; 13 › Q5 ▣; 14. AWS ticketing scaling 350 → 10,000+ ▣; 14 › Q3 ▣; 14 › Follow-up: “Why not Redis alone as seat sourc… ▣
- Visa — Full Stack Engineer: 17. Real-time vendor portal
- Personal Project — Agentic Engine: 18 › Q9 ▣; 18 › Q10 ▣
- The 10 cross-cutting questions they can ask about any bullet: 6. “How do you prevent duplicates?” ▣; 7. “What consistency do you need?” ▣
- 7. Security catalog — quick-reference definitions: Keys, signatures, replay and integrity; Keys, signatures, replay and integrity
- 9. Security by company — Frequence multi-tenant SaaS, Gala Web3 accou…: 2. Proving wallet ownership ▣; 3. Sensitive token/collectible transact… ▣; 4. Preventing replay and duplicate toke… ▣; 5. Protecting collectible/token invento… ▣; Ticket purchase + payment security ▣; Idempotent payment flow ▣; Signed webhook verification ▣; Out-of-order webhook handling ▣; TicketSocket CI/CD security flow ▣; Gala vs Frequence vs TicketSocket — security comparison; Gala; TicketSocket ▣
- Enfav LLC and the personal projects — the current project: the quality-loop engine and agentic memory: 19 › Q4 ▣; 20 › Q5; 20 › Follow-up: consistency model

**Failure modes and resilience**

- 0. Study notes: API gateway responsibilities, S3 event notifications,…: The components that come up most often in interviews ▣; 1. Rate Limiting (Why it needs State); Why This Design Makes Sense (The Architecture Breakdown) ▣; 1. Decoupling the Upload from the Trans…; 2. Absorbing Traffic Spikes (Load Level…; The problem → component map
- 1. Common components of a scalable system: The components that come up most often in interviews ▣
- 2. Ten high-yield architectures, a notification system, and the patte…: 5. WhatsApp / Real-Time Chat ▣; 7. Amazon / E-Commerce Checkout ▣; 8. Ticketmaster / Flash-Sale Ticketing ▣; Bonus: Notification System ▣; The pattern you should recognize in almost every interview ▣; For your interview in one hour, memorize this sequence ▣
- 4. Cassandra and wide-column databases: Why use Cassandra? ▣
- 6. Edge layer, admission tokens, sessions, and cookies in a waiting-r…: 23. What I'd do in a real design ▣
- Gala Games & Entertainment — Lead Full Stack SE: 1. Full-stack engineering across Vue, React Native TV, APIs…; 1 › Q1 ▣; 1 › Q3 ▣; 2. Gala Film creator-to-fan media, ownership and rewards; 2 › Q5 ▣; 5. Token / ICO launch flows; 5 › Q4 ▣
- Frequence + Madhive — Lead Senior SE: 6 › Q5 ▣
- TicketSocket & IceCreamSocial — Lead Full Stack SE: 13. PostgreSQL, stored procedures, triggers, webhooks, tran…; 13 › Q4 ▣; 13 › Q5 ▣; 14 › Q4 ▣; 14 › Follow-up: “Why not Redis alone as seat sourc… ▣
- Personal Project — Agentic Engine: 18 › Q2 ▣; 18 › Q9 ▣
- The 10 cross-cutting questions they can ask about any bullet: 5. “What happens when it fails?” ▣
- 8. Authentication and authorization — best practices and flows: Rate limiting and abuse prevention; Failure behavior ▣; Key rotation ▣; Rate limiting and abuse prevention; Failure behavior ▣; Key rotation ▣
- 9. Security by company — Frequence multi-tenant SaaS, Gala Web3 accou…: 4. Preventing replay and duplicate toke… ▣; Gala CI/CD and launch security ▣; Ticket purchase + payment security ▣; Idempotent payment flow ▣; Out-of-order webhook handling ▣; Gala
- Enfav LLC and the personal projects — the current project: the quality-loop engine and agentic memory: 19 › Q5 ▣; 19 › Follow-up: loop limits; 20 › Follow-up: Qdrant down mid-digest; 20 › Follow-up: re-index safely; 21 › Q5 ▣

**Observability: metrics, traces, logs**

- 0. Study notes: API gateway responsibilities, S3 event notifications,…: The components that come up most often in interviews ▣; The problem → component map
- 1. Common components of a scalable system: The components that come up most often in interviews ▣
- 2. Ten high-yield architectures, a notification system, and the patte…: The pattern you should recognize in almost every interview ▣
- Gala Games & Entertainment — Lead Full Stack SE: 3. Gala NestJS/AWS/GCP/MongoDB at 10,000+ concurrency; 3 › Q2 ▣; 3 › Q4 ▣; 3 › Q5 ▣; 3 › “How did you handle DB connection pooli… ▣; 4. Vision API + vector search + Sanity ▣; 4 › Q5 ▣; 5. Token / ICO launch flows; 5 › Q5 ▣
- Frequence + Madhive — Lead Senior SE: 6 › Q1 ▣; 6 › Q5 ▣; 7 › Q5 ▣; 9. Playwright/Jest/Claude/Datadog testing; 9 › Q4 ▣; 9 › “What did Datadog contribute?” ▣
- TicketSocket & IceCreamSocial — Lead Full Stack SE: 13 › Q3 ▣; 14 › Q5
- The 10 cross-cutting questions they can ask about any bullet: 8. “How do you observe it?” ▣
- 8. Authentication and authorization — best practices and flows: Logging and audit ▣; Distributed tracing ▣; CI/CD security ▣; Logging and audit ▣; Distributed tracing ▣; CI/CD security ▣
- 9. Security by company — Frequence multi-tenant SaaS, Gala Web3 accou…: Frequence CI/CD security flow ▣; Gala CI/CD and launch security ▣; TicketSocket CI/CD security flow ▣
- Enfav LLC and the personal projects — the current project: the quality-loop engine and agentic memory: 19 › Q6 ▣; 21 › Q4 ▣; 21 › Q5 ▣; 21 › Follow-up: production multi-tenant service

**Testing and quality**

- Gala Games & Entertainment — Lead Full Stack SE: 3. Gala NestJS/AWS/GCP/MongoDB at 10,000+ concurrency; 3 › Q2 ▣; 3 › Q5 ▣; 5. Token / ICO launch flows; 5 › Q5 ▣
- Frequence + Madhive — Lead Senior SE: 6 › Q1 ▣; 6 › Q4; 6 › Q5 ▣; 7 › Q2 ▣; 7 › Q3; 7 › Q5 ▣; 9. Playwright/Jest/Claude/Datadog testing; 9 › Q1 ▣; 9 › Q2 ▣; 9 › Q3 ▣; 9 › Q4 ▣; 9 › Q5 ▣; 9 › “How did you handle flaky tests?” ▣; 9 › “How did you stop LLM nondeterminism fr… ▣; 10. High-variation workflow validation ▣; 10 › Q1 ▣; 10 › Q2 ▣; 10 › Q3 ▣; 10 › Q4 ▣; 10 › Q5 ▣
- TicketSocket & IceCreamSocial — Lead Full Stack SE: 11. AngularJS → React + TypeScript; 11 › Q5 ▣; 11 › Follow-up: “How did you measure improvement?” ▣; 13 › Q3 ▣; 14 › Q5; 15. Testing to 70% + Redocly/Swagger; 15 › Q1 ▣; 15 › Q2 ▣; 15 › Q3 ▣; 15 › Q4; 15 › Q5 ▣; 15 › Follow-up: “Why 70% instead of 100%?”
- 8. Authentication and authorization — best practices and flows: CI/CD security ▣; CI/CD security ▣
- 9. Security by company — Frequence multi-tenant SaaS, Gala Web3 accou…: Frequence CI/CD security flow ▣; Gala CI/CD and launch security ▣; TicketSocket CI/CD security flow ▣; Frequence
- Enfav LLC and the personal projects — the current project: the quality-loop engine and agentic memory: 21 › Q2 ▣

**APIs and contracts**

- 0. Study notes: API gateway responsibilities, S3 event notifications,…: API gateway responsibilities; 2. Authentication & Authorization; 3. Request Transformation; 4. API Versioning; How S3 Natively Interfaces with a Queue ▣
- 2. Ten high-yield architectures, a notification system, and the patte…: 1. URL Shortener ▣; For your interview in one hour, memorize this sequence ▣
- 5. Explaining security at TicketSocket: Auth0 identity federation and…: Payment processors: think “tenant-scoped provider adapters” ▣
- 6. Edge layer, admission tokens, sessions, and cookies in a waiting-r…: 2. What is an admission token? ▣; 6. What is a cookie? ▣; 10. How does the browser get redirected? ▣; 11. What happens after the user gets admitted? ▣; 14. Full example; 14 › Request 1 ▣; 16. Queue polling; 18. What if the user manually changes the URL? ▣; 19. Page route vs API route
- Gala Games & Entertainment — Lead Full Stack SE: 1. Full-stack engineering across Vue, React Native TV, APIs…; 1 › Q4 ▣
- Frequence + Madhive — Lead Senior SE: 7 › Q5 ▣; 7 › “How did offshore teams get sufficient…; 8 › Q1 ▣; 8 › Q4 ▣; 8 › Q5 ▣
- TicketSocket & IceCreamSocial — Lead Full Stack SE: 11 › Q4 ▣; 15. Testing to 70% + Redocly/Swagger; 15 › Q5 ▣
- Personal Project — Agentic Engine: 18 › Q5 ▣; 18 › Q7 ▣
- 7. Security catalog — quick-reference definitions: Tokens and claims; Tokens and claims
- 8. Authentication and authorization — best practices and flows: Authentication flow ▣; Authorization flow ▣; API design: 401 vs 403 ▣; Authentication flow ▣; Authorization flow ▣; API design: 401 vs 403 ▣
- 9. Security by company — Frequence multi-tenant SaaS, Gala Web3 accou…: Lead-level architecture ▣; Safe JWT/token handling ▣; Tenant isolation after SSO ▣; TicketSocket payment-provider architect… ▣; Idempotent payment flow ▣
- Enfav LLC and the personal projects — the current project: the quality-loop engine and agentic memory: 19 › Q1 ▣; 19 › Q3 ▣; 19 › Q5 ▣; 22 › Q1 ▣

**AI, LLMs, embeddings and vector search**

- Gala Games & Entertainment — Lead Full Stack SE: 4. Vision API + vector search + Sanity ▣; 4 › Q1 ▣; 4 › Q2; 4 › Q3 ▣; 4 › Q4; 4 › Q5 ▣
- Frequence + Madhive — Lead Senior SE: 9. Playwright/Jest/Claude/Datadog testing; 9 › Q2 ▣; 9 › Q3 ▣; 9 › “How did you stop LLM nondeterminism fr… ▣
- Personal Project — Agentic Engine: 18. Agentic Engine; 18 › Q1 ▣; 18 › Q3 ▣; 18 › Q4 ▣; 18 › Q5 ▣; 18 › Q7 ▣; 18 › Q8 ▣
- Enfav LLC and the personal projects — the current project: the quality-loop engine and agentic memory: 19 › Q1 ▣; 19 › Q2 ▣; 19 › Q4 ▣; 19 › Q5 ▣; 19 › Q7; 19 › Follow-up: lessons stored, who reads them ▣; 20 › Q1 ▣; 20 › Q2; 20 › Q4 ▣; 22 › Q1 ▣; 22 › Q2 ▣

**Leadership and engineering process**

- Gala Games & Entertainment — Lead Full Stack SE: 1. Full-stack engineering across Vue, React Native TV, APIs…; 1 › Q5 ▣; 1 › Follow-up: “You keep saying we. What did YOU… ▣
- Frequence + Madhive — Lead Senior SE: 6. Platform execution / engineering maturity; 6 › Q1 ▣; 6 › Q4; 7. Technical direction across 30+ engineers/QAs; 7 › Q1 ▣; 7 › Q2 ▣; 7 › Q3; 7 › Q5 ▣; 7 › Follow-up: “How did you handle disagreement?”; 7 › “How did you prevent yourself becoming… ▣; 7 › “How did offshore teams get sufficient…
- TicketSocket & IceCreamSocial — Lead Full Stack SE: 11 › Q5 ▣; 11 › Follow-up: “Why React?”; 11 › Follow-up: “Why not modern Angular?”; 15 › Q1 ▣; 15 › Follow-up: “Why 70% instead of 100%?”
- The 10 cross-cutting questions they can ask about any bullet: 2. “What did you personally own?”
- Enfav LLC and the personal projects — the current project: the quality-loop engine and agentic memory: 22 › Q3 ▣

**Defending the résumé's numbers**

- Gala Games & Entertainment — Lead Full Stack SE: 1. Full-stack engineering across Vue, React Native TV, APIs…; 1 › Q5 ▣; 3. Gala NestJS/AWS/GCP/MongoDB at 10,000+ concurrency; 3 › Q2 ▣; 3 › Q5 ▣
- Frequence + Madhive — Lead Senior SE: 9. Playwright/Jest/Claude/Datadog testing; 9 › Q5 ▣; 10 › Q3 ▣
- TicketSocket & IceCreamSocial — Lead Full Stack SE: 11 › Follow-up: “How did you measure improvement?” ▣; 13 › Q1 ▣; 14 › Q5; 15 › Follow-up: “Why 70% instead of 100%?”
- Visa — Full Stack Engineer: 16 › Q5 ▣; 17 › Q5 ▣
- The 10 cross-cutting questions they can ask about any bullet: 10. “How do you know your resume metric is true?” ▣
- Enfav LLC and the personal projects — the current project: the quality-loop engine and agentic memory: 19 › Q2 ▣; 19 › Q7; 20 › Q2; 20 › Q4 ▣; 22 › Q3 ▣

**Frontend and UX architecture**

- 6. Edge layer, admission tokens, sessions, and cookies in a waiting-r…: 12. Should the client also check? ▣; 13. The proper design is both client and server enforcement; 17. Client redirects after admission ▣; 18. What if the user manually changes the URL? ▣; 19. Page route vs API route
- Gala Games & Entertainment — Lead Full Stack SE: 1. Full-stack engineering across Vue, React Native TV, APIs…; 1 › Q2 ▣; 1 › Q4 ▣
- Frequence + Madhive — Lead Senior SE: 6 › Q1 ▣; 6 › Q2 ▣; 6 › Q4; 7 › Q4 ▣; 8. Angular widget framework ▣; 8 › Q1 ▣; 8 › Q2 ▣; 8 › Q3 ▣; 8 › Q4 ▣; 8 › Q5 ▣; 10. High-variation workflow validation ▣; 10 › Q1 ▣
- TicketSocket & IceCreamSocial — Lead Full Stack SE: 11. AngularJS → React + TypeScript; 11 › Q1 ▣; 11 › Q2 ▣; 11 › Q3 ▣; 11 › Q4 ▣; 11 › Q5 ▣; 11 › Follow-up: “Why React?”; 11 › Follow-up: “Why not modern Angular?”; 11 › Follow-up: “How did you measure improvement?” ▣; 12 › Q1 ▣
- Visa — Full Stack Engineer: 16. Angular/D3 risk dashboard; 16 › Q3 ▣; 16 › Q4 ▣; 17. Real-time vendor portal; 17 › Q1 ▣
- 7. Security catalog — quick-reference definitions: Sessions and the browser; Browser boundaries that are not security; Sessions and the browser; Browser boundaries that are not security
- 8. Authentication and authorization — best practices and flows: Cookies ▣; CSRF vs XSS ▣; Cookies ▣; CSRF vs XSS ▣
- 9. Security by company — Frequence multi-tenant SaaS, Gala Web3 accou…: Frontend responsibility ▣; Never put bearer tokens in URLs ▣

# Appendix C — Where each bullet of the résumé the company holds is covered

The question bank in Part I was written against an earlier résumé (17 experience bullets plus one personal project). The résumé the company holds, `docs/ingestion/Resume_2026_c.pdf`, is organised differently, so this map shows where each of its bullets is defended in this document. Wording differs slightly in places; the architecture questions still apply.

| Résumé entry (Resume_2026_c.pdf)                                                | Bullet                                                                                                                                                                                                            | Where it is covered                                                                                                                                                                                           |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Enfav LLC — Chief Software Engineer (Jul 2026 – Present)                        | Founded an AI-focused engineering company; own technical strategy, architecture, product delivery, solution design, and business operations…                                                                      | Part I › Current project › areas 19–22 (the platform as a whole; govcon is one consumer of it)                                                                                                                |
| Enfav LLC                                                                       | Architected multi-agent workflow engines integrating LLMs, tool calling, API orchestration, contextual memory, and multi-step reasoning…                                                                          | Part I › Current project › area 19 (the quality loop) and area 20 (memory)                                                                                                                                    |
| Enfav LLC                                                                       | Designed modular applications and backend services with TypeScript, Node.js, React, Next.js, PostgreSQL, and AWS…                                                                                                 | Part I › Current project › area 21 (platform, delivery)                                                                                                                                                       |
| Enfav LLC                                                                       | Built RAG systems with vector embeddings, semantic and hybrid search, reranking, and contextual grounding; developed graph-based architecture tooling with AI critics and iterative evaluation.                   | Part I › Current project › area 20 (digest/recall, Qdrant) and area 22 Q1 (the Studio)                                                                                                                        |
| Enfav LLC                                                                       | Integrated GitHub, Jira, Playwright, and MCP into code analysis, automated testing, and developer workflows; manage federal registration and procurement opportunity identification.                              | Part I › Current project › area 21 Q2 (CI/CD gates) and area 22 Q2 (browser automation); procurement = the govcon package, mentioned in area 21 Q1                                                            |
| Madhive — Senior Software Engineer, Contract (Jan 2026 – Jul 2026)              | Developed enterprise AdTech applications with TypeScript, Angular, and Node.js; built reusable components and dynamic widgets for complex advertising workflows.                                                  | Part I › Frequence + Madhive › 8 (Angular widget framework), 6; Part III › 9 › Frequence/Madhive — multi-tenant SaaS security                                                                                 |
| Madhive                                                                         | Drove Claude Code + Playwright E2E automation with Jest, Datadog, and multimodal validation, cutting production bugs 50% and manual QA 60%.                                                                       | Part I › Frequence + Madhive › 9                                                                                                                                                                              |
| Madhive                                                                         | Improved CI/CD regression workflows and automated quality checks; used Datadog and application logs to investigate defects and improve production reliability.                                                    | Part I › Frequence + Madhive › 9 (Q4, “What did Datadog contribute?”), 10                                                                                                                                     |
| Madhive                                                                         | Partnered with product, design, QA, and engineering on production delivery, code reviews, modular architecture, and platform evolution following Frequence’s acquisition.                                         | Part I › Frequence + Madhive › 6, 7                                                                                                                                                                           |
| Gala Games and Entertainment — Lead Software Engineer (Jun 2024 – Jan 2026)     | Owned architecture, implementation, integrations, and production delivery across Gala’s consumer-facing entertainment applications.                                                                               | Umbrella bullet: Part I › Gala › 1–5 together; “What did YOU own?” follow-up under 1                                                                                                                          |
| Gala                                                                            | Integrated GCP Vision API, vector search, and Sanity CMS to automate film content ops, static inputs, thumbnail prep, image selection, and release metadata.                                                      | Part I › Gala › 4                                                                                                                                                                                             |
| Gala                                                                            | Drove full-stack engineering for Gala collectibles, Film, and Web3 launch workflows across Vue.js web, React Native TV, backend APIs, and blockchain product surfaces.                                            | Part I › Gala › 1                                                                                                                                                                                             |
| Gala                                                                            | Led Gala Film application delivery for creator-to-fan media flows, digital ownership, NFT collectibles, and reward-driven viewer experiences alongside Claude Code.                                               | Part I › Gala › 2 (the “alongside Claude Code” clause is new: be ready to say what the assistant did and did not do); Part III › 9 › Gala — account, wallets, token transactions and scarce digital inventory |
| Gala                                                                            | Architected Node.js/NestJS services on AWS/GCP with MongoDB, scaling media, collectibles, user-state, and blockchain workflows to 10,000+ concurrent users.                                                       | Part I › Gala › 3                                                                                                                                                                                             |
| Gala                                                                            | Owned production-critical token/ICO launch flows across user experience, backend services, release operations, and blockchain-integrated application paths.                                                       | Part I › Gala › 5; Part III › 9 › Gala (transaction intent, replay, inventory, launch CI/CD)                                                                                                                  |
| Frequence — Lead Software Engineer (Dec 2020 – Jun 2024)                        | Helped lead Frequence’s Angular framework, architecting extensible widgets and configurable UI workflows for AdTech automation.                                                                                   | Part I › Frequence + Madhive › 8; Part III › 9 › Frequence/Madhive (RBAC + ABAC, tenant isolation layers)                                                                                                     |
| Frequence                                                                       | Automated AI-assisted browser regression across high-variation customer paths, improving release confidence for production-critical workflows.                                                                    | Part I › Frequence + Madhive › 10, 9                                                                                                                                                                          |
| Frequence                                                                       | Contributed to platform execution and engineering maturity that supported Frequence’s acquisition by Madhive across omnichannel workflow & local CTV infra.                                                       | Part I › Frequence + Madhive › 6                                                                                                                                                                              |
| Frequence                                                                       | Provided technical direction for 30+ engineers/QAs across architecture, testing strategy, design systems, PR standards, offshore coordination, & product breakdown.                                               | Part I › Frequence + Madhive › 7                                                                                                                                                                              |
| TicketSocket & IceCreamSocial — Lead Full Stack Developer (Jun 2017 – Dec 2020) | Migrated AngularJS to React + TypeScript, improving architecture, testability, design-system reuse, and product/design collaboration via Storybook.                                                               | Part I › TicketSocket › 11                                                                                                                                                                                    |
| TicketSocket                                                                    | Built configurable dashboards for events, inventory, influencer campaigns, ticketing operations, and white-label partner workflows.                                                                               | Part I › TicketSocket › 12; Part II › chapter 5 (Auth0, payment processors); Part III › 9 › TicketSocket — white-label SSO, tenant identity and merchant payment processing                                   |
| TicketSocket                                                                    | Optimized PostgreSQL data flows with indexing, stored procedures, triggers, webhooks, and transactional event processing.                                                                                         | Part I › TicketSocket › 13; Part III › 9 › TicketSocket (signed webhook verification, out-of-order webhooks, idempotent payment flow)                                                                         |
| TicketSocket                                                                    | Re-architected AWS ticketing services, scaling from 350 to 10,000+ concurrent users with JWT-based service allocation.                                                                                            | Part I › TicketSocket › 14; Part II › chapter 6 (waiting room, admission tokens, sessions); Part III › 9 › TicketSocket (SSO redirect flow, safe JWT handling, tenant isolation after SSO)                    |
| TicketSocket                                                                    | Raised test coverage from near-zero to 70% across a 90,000+ line codebase and created Redocly/Swagger API docs for partner onboarding.                                                                            | Part I › TicketSocket › 15                                                                                                                                                                                    |
| VISA — Full Stack Engineer (Jun 2016 – May 2017)                                | Built Angular/D3.js risk dashboards with data science teams to surface infrastructure exposure across Visa’s network, reducing incidents by 30%+.                                                                 | Part I › Visa › 16                                                                                                                                                                                            |
| VISA                                                                            | Developed a real-time Angular/Node vendor portal, cutting third-party tool approval cycles by 80%+.                                                                                                               | Part I › Visa › 17                                                                                                                                                                                            |
| Triptive — Full Stack Developer (Sep 2015 – May 2016)                           | Built booking travel app and admin (Django, Python, Javascript, JQuery)                                                                                                                                           | **Not covered** by the question bank. Prepare a two-minute summary (data model, booking flow, admin, what you would change today).                                                                            |
| Personal project — Agentic Engine (June 2025 – current)                         | Workflow engine compiling goals into DAGs using LLM critics/evals, strict JSON schemas, graph search, MCP, RAG, TypeScript, Node, Python.                                                                         | Part I › Current project › areas 19–20 (the critic/evaluator loop and memory as they exist today) plus the reference block “Personal Project — Agentic Engine” for the DAG/graph-search wording               |
| Personal project — System Design Graph (May 2026 – Present)                     | Built graph-based system design tooling with intelligent architecture components and LLM critic/evaluation pipelines, enabling iterative design feedback and analysis of scalability and architectural tradeoffs. | Part I › Current project › area 22 Q1 (the Studio) and area 19                                                                                                                                                |
| Personal project — Browser-Session Automation (January 2026 – Present)          | Developed Playwright-based browser automation integrated with agentic workflows to execute multi-step interactions and validate application behavior across browser sessions.                                     | Part I › Current project › area 22 Q2                                                                                                                                                                         |

# Appendix D — Rehearsal script: every spoken answer in one place

The first-person answers from Parts I and III and the current-project section, in document order, so they can be rehearsed aloud without paging. Each is labelled with the section and question it answers; read the full answer there when a line needs its evidence.

**Gala Games & Entertainment — Lead Full Stack SE › 1. Full-stack engineering across Vue, React Native TV, APIs, and blockchain › Q1. “Draw the end-to-end architecture for one of those Gala product flows.”**

> “I separated the system into client presentation, application/domain services, off-chain application state, and blockchain state. Vue and React Native TV were clients rather than authoritative stores. NestJS APIs normalized access to user state, collectible metadata, entitlement information, and blockchain workflows. MongoDB handled application-oriented state where fast application queries were more appropriate than querying the blockchain directly. Blockchain calls were isolated behind an integration layer because chain interactions have very different latency and failure semantics from ordinary database calls.”

**Gala Games & Entertainment — Lead Full Stack SE › 1. Full-stack engineering across Vue, React Native TV, APIs, and blockchain › Q2. “How did you divide responsibilities between the frontend, backend and blockchain?”**

> “I tried to keep each layer responsible for the type of state it was best suited to own. The frontend owned presentation and transient UX state. Backend services owned application workflows, authorization, metadata, caching and integration orchestration. Blockchain was used for state that actually needed blockchain guarantees—for example digital ownership or blockchain-native transactions. I specifically would not have the client directly decide that a user owned an asset based on client state.”

**Gala Games & Entertainment — Lead Full Stack SE › 1. Full-stack engineering across Vue, React Native TV, APIs, and blockchain › Q2. “How did you divide responsibilities between the frontend, backend and blockchain?”**

> “The blockchain was a system of record for blockchain-native state, but it was not the optimal read model for every user-facing screen.”

**Gala Games & Entertainment — Lead Full Stack SE › 1. Full-stack engineering across Vue, React Native TV, APIs, and blockchain › Q3. “How did you deal with eventual consistency between blockchain state and application state?”**

> “The main issue is that successful submission is not the same as final blockchain confirmation. I would persist the transaction identifier and internal operation state, expose a pending state to the client, and reconcile chain state asynchronously. The UI could optimistically show ‘processing,’ but I would not show final ownership until the confirmation criteria were met.”

**Gala Games & Entertainment — Lead Full Stack SE › 1. Full-stack engineering across Vue, React Native TV, APIs, and blockchain › Q4. “How did you keep Vue and React Native TV from duplicating domain logic?”**

> “I would share API contracts, domain types, state definitions and reusable business rules where they were genuinely platform-independent, but I would not force web UI components into TV. TV has completely different focus navigation, remote-input and playback UX requirements.”

**Gala Games & Entertainment — Lead Full Stack SE › 1. Full-stack engineering across Vue, React Native TV, APIs, and blockchain › Q5. “Tell me about an architecture decision another senior engineer disagreed with.”**

> “The decision was X. The competing design was Y. I compared them using scalability, implementation complexity, failure isolation, developer velocity and migration risk. We prototyped or measured Z. I ultimately recommended X because ____. The important part was that I documented the tradeoff and changed my position where the other design had better evidence.”

**Gala Games & Entertainment — Lead Full Stack SE › 1. Full-stack engineering across Vue, React Native TV, APIs, and blockchain › Follow-up: “You keep saying we. What did YOU own?”**

> “The broader product was obviously a team effort. My personal ownership was at the architecture and implementation boundaries I can defend in detail. For example, I personally worked on [VERIFY: specific NestJS service/API], [VERIFY: specific Vue/TV flow], and [VERIFY: blockchain/CMS integration]. I can walk through the code-level design of those pieces separately from work done by the rest of the team.”

**Gala Games & Entertainment — Lead Full Stack SE › 2. Gala Film creator-to-fan media, ownership and rewards › Q2. “Where do video, metadata and ownership live?”**

> “I would use specialized stores. Large immutable video blobs belong in object storage/CDN. Editorial metadata belongs in a CMS or application database. Blockchain-native ownership belongs on-chain, while a query-optimized application projection can make entitlement checks fast.”

**Gala Games & Entertainment — Lead Full Stack SE › 2. Gala Film creator-to-fan media, ownership and rewards › Q2. “Where do video, metadata and ownership live?”**

> “Databases are optimized for structured records and queries, not cost-effective delivery of multi-gigabyte media assets.”

**Gala Games & Entertainment — Lead Full Stack SE › 2. Gala Film creator-to-fan media, ownership and rewards › Q3. “How do you efficiently determine NFT entitlement?”**

> “The cache can accelerate the decision, but its provenance must ultimately trace back to authoritative ownership state.”

**Gala Games & Entertainment — Lead Full Stack SE › 2. Gala Film creator-to-fan media, ownership and rewards › Q5. “Media says watched, blockchain unavailable. How do you eventually issue exactly one reward?”**

> “I don't immediately submit another reward. I reconcile whether the first operation succeeded.”

**Gala Games & Entertainment — Lead Full Stack SE › 3. Gala NestJS/AWS/GCP/MongoDB at 10,000+ concurrency › Q2. “What was the bottleneck at 350, 1k, 5k, 10k?”**

> “I wouldn't claim that every concurrency level corresponded to a unique bottleneck unless I had measurements. We diagnosed bottlenecks through load testing and production telemetry rather than guessing.”

**Gala Games & Entertainment — Lead Full Stack SE › 3. Gala NestJS/AWS/GCP/MongoDB at 10,000+ concurrency › Q3. “How were NestJS services deployed? Stateless?”**

> “The goal for the request-serving NestJS layer was statelessness: authenticated identity and durable domain state lived outside the process, so instances could be added or removed behind the load balancer.”

**Gala Games & Entertainment — Lead Full Stack SE › 3. Gala NestJS/AWS/GCP/MongoDB at 10,000+ concurrency › Q4. “How was MongoDB modeled and indexed?”**

> “I started from the read/write access pattern, not from document aesthetics.”

**Gala Games & Entertainment — Lead Full Stack SE › 3. Gala NestJS/AWS/GCP/MongoDB at 10,000+ concurrency › Q4. “How was MongoDB modeled and indexed?”**

> “The leftmost fields support equality predicates and the trailing field supports the requested sort.”

**Gala Games & Entertainment — Lead Full Stack SE › 3. Gala NestJS/AWS/GCP/MongoDB at 10,000+ concurrency › Q5. “How did you verify 10,000 concurrent?”**

> “Concurrency is not the same thing as requests per second. I would explain exactly what the 10,000 figure represented—simultaneously connected or active users—and distinguish that from throughput.”

**Gala Games & Entertainment — Lead Full Stack SE › 3. Gala NestJS/AWS/GCP/MongoDB at 10,000+ concurrency › Follow-up: “Why MongoDB instead of PostgreSQL?”**

> “I don't think of Mongo versus Postgres as a religion. I choose based on access patterns and consistency requirements. For highly relational financial/order state I generally prefer relational storage; for application-oriented document state with flexible nested structures, Mongo can be a better fit.”

**Gala Games & Entertainment — Lead Full Stack SE › 3. Gala NestJS/AWS/GCP/MongoDB at 10,000+ concurrency › “Why AWS and GCP?”**

> “The architecture was multi-cloud because different product capabilities existed in different providers—not because multi-cloud itself was a goal. For example, application infrastructure could run in AWS while GCP was used for services such as Vision. I would avoid duplicating equivalent core infrastructure across providers unless there were a concrete reliability or business reason.”

**Gala Games & Entertainment — Lead Full Stack SE › 3. Gala NestJS/AWS/GCP/MongoDB at 10,000+ concurrency › “What state prevented NestJS from being completely stateless?”**

> “A NestJS process can be stateless at the service-instance level even though the overall system is stateful. Durable state lives in MongoDB, blockchain state, caches or other stores. The instance still has ephemeral process state such as connection pools and in-flight requests, but no business-critical state should disappear if the instance is terminated.”

**Gala Games & Entertainment — Lead Full Stack SE › 4. Vision API + vector search + Sanity › Q1. “Walk me through the pipeline.”**

> “Vision and vector retrieval solved different parts of the problem. Vision extracted semantic information from visual assets. Vector search let us compare candidate assets against content context semantically rather than relying on exact filenames or tags.”

**Gala Games & Entertainment — Lead Full Stack SE › 4. Vision API + vector search + Sanity › Q2. “What exactly did you send to Vision?”**

> “We passed the media assets or their accessible representation to Vision and normalized the returned visual metadata into our processing pipeline. I don't want to invent the exact Vision feature if I don't remember it; the architectural role was automated enrichment of image metadata before ranking/selecting candidates.”

**Gala Games & Entertainment — Lead Full Stack SE › 4. Vision API + vector search + Sanity › Q3. “Where did vector search enter?”**

> “Vector search was for semantic retrieval/ranking. The system converted the relevant textual/visual context into an embedding representation and searched an indexed corpus of candidate assets. Rather than ‘does this image have an exact tag?’ the question became ‘which assets are semantically closest to the content context?’”

**Gala Games & Entertainment — Lead Full Stack SE › 4. Vision API + vector search + Sanity › Q4. “Which model and vector DB?”**

> “I remember the architecture and my responsibilities clearly, but I want to distinguish that from vendor-specific details I don't remember. The implementation used [actual provider/store]. Architecturally, we required an embedding model, persisted vectors with asset IDs/metadata, approximate nearest-neighbor retrieval, and a top-K ranking stage.”

**Gala Games & Entertainment — Lead Full Stack SE › 4. Vision API + vector search + Sanity › Q5. “How did you prevent a wrong thumbnail from automatically publishing?”**

> “I would not make semantic similarity equivalent to correctness. The vector score is a candidate-generation signal. I would layer deterministic rules, confidence thresholds, asset eligibility, content status and—where the impact warranted it—human review before publication.”

**Gala Games & Entertainment — Lead Full Stack SE › 5. Token / ICO launch flows › Q3. “DB or blockchain as source of truth?”**

> “For actual on-chain ownership, blockchain is authoritative. But application state still needs to track the lifecycle of the user's operation. I would separate ‘canonical chain ownership’ from ‘application workflow state.’”

**Frequence + Madhive — Lead Senior SE › 6. Platform execution / engineering maturity › Q1. “What did engineering maturity concretely mean?”**

> “I would define maturity by measurable engineering properties: predictable releases, reusable architecture, automated regression coverage, consistent review standards, observability and a framework that multiple teams could extend without repeatedly rebuilding the same patterns.”

**Frequence + Madhive — Lead Senior SE › 6. Platform execution / engineering maturity › Q2. “Draw omnichannel architecture.”**

> “Product variation belonged in configuration and extension points rather than hundreds of hard-coded `if product === ...` branches.”

**Frequence + Madhive — Lead Senior SE › 6. Platform execution / engineering maturity › Q3. “What makes AdTech workflow systems difficult to scale?”**

> “At Frequence, ‘scale’ was not only requests per second. Configuration complexity and safe extensibility were major scaling problems.”

**Frequence + Madhive — Lead Senior SE › 6. Platform execution / engineering maturity › Q4. “What did you personally contribute?”**

> “My strongest personal contributions were around the shared frontend framework, widget architecture, test automation, design-system/PR standards and engineering direction. For example, I worked with configurable geography, audience and product-selection workflows and helped create automation around product-specific workflow paths.”

**Frequence + Madhive — Lead Senior SE › 6. Platform execution / engineering maturity › Q5. “What would an acquisition technical diligence team examine?”**

> “I wouldn't claim my work caused the acquisition, but the areas I contributed to—repeatable testing, shared framework architecture, documented engineering standards and product infrastructure—are exactly the kinds of technical-risk areas that matter during scaling and diligence.”

**Frequence + Madhive — Lead Senior SE › 7. Technical direction across 30+ engineers/QAs › Q1. “How can you influence 30+ engineers?”**

> “The goal was to make the right architecture the easiest architecture to follow. I used shared patterns, examples, code review standards and delegated ownership rather than requiring every implementation decision to come through me.”

**Frequence + Madhive — Lead Senior SE › 7. Technical direction across 30+ engineers/QAs › Q2. “How were architecture decisions proposed and enforced?”**

> “Policy enforced only through human memory does not scale.”

**Frequence + Madhive — Lead Senior SE › 7. Technical direction across 30+ engineers/QAs › Q3. “What PR standard changed quality?”**

> “A PR needed to explain the user/system behavior being changed, testing evidence, risk area and any architectural implications—not just contain code. For critical changes, we required regression coverage.”

**Frequence + Madhive — Lead Senior SE › 7. Technical direction across 30+ engineers/QAs › Q4. “What belongs in a shared design system?”**

> “Reuse should occur at the correct abstraction level; premature generalization is just another form of coupling.”

**Frequence + Madhive — Lead Senior SE › 7. Technical direction across 30+ engineers/QAs › Follow-up: “How did you handle disagreement?”**

> “I tried to convert disagreement into explicit competing constraints. If two engineers disagree, I ask what each design optimizes for—latency, extensibility, delivery time, isolation, operational cost—and then use evidence or a small prototype where necessary.”

**Frequence + Madhive — Lead Senior SE › 7. Technical direction across 30+ engineers/QAs › “How did you prevent yourself becoming the bottleneck?”**

> “I standardized repeatable decisions and reserved direct involvement for high-blast-radius architectural decisions.”

**Frequence + Madhive — Lead Senior SE › 8. Angular widget framework › Q1. “What was a widget?”**

> “A widget was an extensible domain UI unit used inside configurable workflow states. Geography might represent geofence/location configuration, Audience represented demographic/segment selection, and Product Selection controlled products such as CTV or Radio.”

**Frequence + Madhive — Lead Senior SE › 8. Angular widget framework › Q5. “How would you migrate it to React?”**

> “A good domain architecture should outlive the frontend framework.”

**Frequence + Madhive — Lead Senior SE › 9. Playwright/Jest/Claude/Datadog testing › Q3. “Why AI instead of normal assertions?”**

> “I would never replace a deterministic assertion with an LLM when a deterministic check is reliable. AI was useful only where correctness was semantic or visual and difficult to encode as a stable selector/value assertion.”

**Frequence + Madhive — Lead Senior SE › 9. Playwright/Jest/Claude/Datadog testing › Q5. “Explain 50% bug reduction and 60% manual QA reduction.”**

> “I would define the metrics before presenting them. Production bug reduction was based on [VERIFY exact tracking source/time period]. Manual QA reduction was based on [VERIFY QA execution time / number of manually executed scenarios]. The important point is that I don't claim those percentages from intuition; they came from comparing the prior process to the automated process.”

**TicketSocket & IceCreamSocial — Lead Full Stack SE › 11. AngularJS → React + TypeScript › Q2. “How did AngularJS and React coexist?”**

> “The important architectural decision was to choose clear migration boundaries so the two frameworks didn't continuously reach into each other's component internals.”

**TicketSocket & IceCreamSocial — Lead Full Stack SE › 11. AngularJS → React + TypeScript › Q4. “What did TypeScript materially improve?”**

> “TypeScript's biggest value in a migration wasn't catching syntax errors; it was making cross-module contracts explicit so we could refactor legacy assumptions safely.”

**TicketSocket & IceCreamSocial — Lead Full Stack SE › 11. AngularJS → React + TypeScript › Follow-up: “Why not modern Angular?”**

> “That was a valid alternative. The decision should consider migration path, team skills, desired component ecosystem and product direction. Modern Angular is not inherently incapable. The key was selecting an architecture that reduced legacy coupling and allowed incremental delivery.”

**TicketSocket & IceCreamSocial — Lead Full Stack SE › 13. PostgreSQL, stored procedures, triggers, webhooks, transactions › Q1. “Give me a real query/index improvement.”**

> “I would confirm improvement with `EXPLAIN ANALYZE`, comparing scan type, rows examined, sort behavior and execution time before and after.”

**TicketSocket & IceCreamSocial — Lead Full Stack SE › 14. AWS ticketing scaling 350 → 10,000+ › Q5. “How validate 10,000 concurrent?”**

> “I didn't consider a test successful simply because the service stayed up; it needed to meet latency and error SLOs under load.”

**TicketSocket & IceCreamSocial — Lead Full Stack SE › 15. Testing to 70% + Redocly/Swagger › Q3. “Global threshold or changed code?”**

> “I prefer ratcheting. Don't allow the codebase to get worse while gradually improving the baseline.”

**TicketSocket & IceCreamSocial — Lead Full Stack SE › 15. Testing to 70% + Redocly/Swagger › Follow-up: “Why 70% instead of 100%?”**

> “Coverage is a risk signal, not the goal. 100% can incentivize low-value tests. I cared more that business-critical branches and integration boundaries were exercised than that getters and trivial plumbing increased a percentage.”

**Visa — Full Stack Engineer › 16. Angular/D3 risk dashboard › Q5. “How did dashboard reduce incidents by 30%?”**

> “I would avoid claiming pure causality if other improvements were happening simultaneously. The dashboard contributed by surfacing exposure earlier; the measured incident reduction during the relevant period was 30%+.”

**Visa — Full Stack Engineer › 16. Angular/D3 risk dashboard › Follow-up: “Would 15-minute stale risk data be acceptable?”**

> “I would derive freshness from the operational decision. If this is strategic risk posture, 15 minutes may be fine. If it's active incident response, it may be unacceptable.”

**Enfav LLC and the personal projects — the current project: the quality-loop engine and agentic memory › 19. The quality loop: one shared AI core (producer → critics → evaluators → controller → trace) › Q1. “Draw the quality loop end to end.”**

> “My models only ever hand me evidence — enumerated findings and per-criterion results — never a number. Every figure comes from a policy I declared and every decision from a synchronous controller over a ledger of ids and counts. A request opens a row and gets a 202; the loop runs detached, publishes its standing after every iteration, and closes with a dump and one transaction. I run sixteen pipelines on this one core, and the core branches on none of them.”

**Enfav LLC and the personal projects — the current project: the quality-loop engine and agentic memory › 19. The quality loop: one shared AI core (producer → critics → evaluators → controller → trace) › Q2. “Why separate critics, evaluators and a controller?”**

> “Critics diagnose, evaluators measure, validators verify, the controller decides, memory learns. A single judge gives me a number I cannot count agreement over, cannot locate, cannot replay and cannot keep independent of what it was shown. With three roles the coupling is a declaration, and I measured it both ways: under agreement-based vetoes an evaluator shown confirmed defects judged better; under corroboration-based vetoes an evaluator shown one critic's claim became its echo.”

**Enfav LLC and the personal projects — the current project: the quality-loop engine and agentic memory › 19. The quality loop: one shared AI core (producer → critics → evaluators → controller → trace) › Q3. “How is a pipeline defined?”**

> “A pipeline is a folder of data — a definition that names its vocabularies, prices them in a policy and points at personas kept as markdown — plus the one piece of code it must bring, an output shape that locates and renders the artifact. I add a domain with a folder and one registry line; the engine reads what the definition declares and never asks who is calling. Boot validates every declaration, so a kind nobody judges or weights that do not sum to one fail before a run exists.”

**Enfav LLC and the personal projects — the current project: the quality-loop engine and agentic memory › 19. The quality loop: one shared AI core (producer → critics → evaluators → controller → trace) › Q4. “How does the controller decide?”**

> “Models give me enums; the policy prices them; the controller consults gates in a declared order and the first to settle wins. A veto sits before the threshold, so a 77 can be refused. Reject exists for an unfixable blocker only; the floor retries. The decide call is synchronous by type, so I can replay every recorded ledger under a candidate controller for free and read a floor off the lowest dimension the standard one accepted.”

**Enfav LLC and the personal projects — the current project: the quality-loop engine and agentic memory › 19. The quality loop: one shared AI core (producer → critics → evaluators → controller → trace) › Q5. “How do you keep bad LLM output from corrupting a run?”**

> “A model can neither hand me a number nor cite an id that does not exist: every schema is built per request over this run's ids. Every string and list has a declared target and ceiling, and an overrun is kept and recorded, never thrown away. Retries live inside one call, and a lost sample lowers that lens's bar instead of silencing it. A defect counts only when one lens saw it in minHits of its own samples; under cited corroboration a veto also needs the evaluator, judging apart, to fail a criterion it cites.”

**Enfav LLC and the personal projects — the current project: the quality-loop engine and agentic memory › 19. The quality loop: one shared AI core (producer → critics → evaluators → controller → trace) › Q6. “What is a run record, and how do you replay?”**

> “A run record is a Postgres row kept alive by a heartbeat plus a dump written once at close: every prompt, every raw sample, the ledger and the decision with its gate trace. Because the controller is a pure function of ledger and policy, I re-decide every recorded iteration under a candidate controller with no model call; over three pipelines' complete runs the standard and floor controllers disagreed once, a recall pack accepted at 75.5 with coverage 40.9, and that is how I read a floor off evidence instead of guessing one.”

**Enfav LLC and the personal projects — the current project: the quality-loop engine and agentic memory › 19. The quality loop: one shared AI core (producer → critics → evaluators → controller → trace) › Q7. “What did you measure, and what did you change because of a measurement?”**

> “I never tune a judge by feel. When the browser session died on a blank page, three ‘the model is weak’ hypotheses were put forward and measurement killed all three: one sample of one critic was vetoing a correct navigate, so I made a veto need a cited criterion the evaluator itself failed, and let a cut refuse the actions it names and nothing before them while the lenses still judge the whole plan. The next day's audit found the evaluator echoing the critic it had been shown; the fix was one declaration, consumes: [], plus a boot check that forbids the shape in any pipeline that declares cited corroboration. And a 2.22% call-failure rate looked like a slow path until I counted 118 findings thrown away because a sample was lost — a grading bug.”

**Enfav LLC and the personal projects — the current project: the quality-loop engine and agentic memory › 19. The quality loop: one shared AI core (producer → critics → evaluators → controller → trace) › Follow-up: “What are the loop limits, and what happens when they are hit?”**

> “The limits belong to the driver, not the controller: the controller sees one ledger and decides what the artifact deserves, and the loop owns how many times it may ask and when to stop. Each pipeline declares them on its policy — maxIterations, plateauAfter, concurrency and lostProduces — so a browser step gets one iteration because a fresh observation beats a blind revise, a digest gets two and a design gets three. A terminal decision stops the loop at once; otherwise it stops at plateau or at max-iterations with the best iteration still crowned and nothing discarded. A produce that answers nothing is still decided on the record, never takes the crown and never counts toward the plateau; I ask again with the refusals named and stop produce-lost only once more produces are lost than the policy allows. Around the loop sit limits of other kinds — a 64,000-byte goal budget, maxTokens doubling as the call's time limit, eight calls in flight per process, and a janitor that fails a run whose heartbeat has gone stale.”

**Enfav LLC and the personal projects — the current project: the quality-loop engine and agentic memory › 19. The quality loop: one shared AI core (producer → critics → evaluators → controller → trace) › Follow-up: “How do lessons get stored, and who reads them?”**

> “Two things are called a lesson. The engine's is deterministic: after each iteration I compare consecutive judged ledgers and record persisted or resolved per finding and improved or regressed per criterion; it sits on the trace and feeds back to no producer. The memory tier's lesson is model-proposed and judged before it is stored: a finished coach run is reduced to engine facts, a producer proposes at most eight memories, three critics and one evaluator judge them, and the survivors become one chunk each in Qdrant, replacing the source run's earlier chunks. Only a producer that declares it consumes memories can be handed them — the studio recalls for coach runs only, so a grade rests on the prompt alone — and the curated recall briefs that producer under one heading the deriver, critics and evaluators never see. Whether recall helps is not established: plus 0.5 with a margin of about 9 over five pairs.”

**Enfav LLC and the personal projects — the current project: the quality-loop engine and agentic memory › 19. The quality loop: one shared AI core (producer → critics → evaluators → controller → trace) › Follow-up: “What is an orchestrator versus a pipeline?”**

> “A pipeline answers one question about one artifact; an orchestrator answers a question that needs several quality runs — does this run go better if it remembers, which judge does this brief belong to, would I get this number again — and it is data over registered pipelines. A definition declares its steps, each with what it needs, the pipelines it may run and an adapter that turns earlier outputs into a run input and reads the child back; one generic runner executes any of them and names no step. Nine are registered, and the record is flushed whole on every transition, so a process that dies leaves a row that explains itself. The panel pair is the sharpest illustration: calibration runs the same pipeline on the same brief N times and reconciles under alignment produced, second-opinion holds one artifact fixed and reconciles under alignment provided, and the difference is one declared word. Reconcile reports spreads, tallies and contested findings but never judges, because a threshold there would be policy, and policy lives on a pipeline.”

**Enfav LLC and the personal projects — the current project: the quality-loop engine and agentic memory › 20. Memory: digest and recall › Q1. “Design the memory system”**

> Memory in my engine is a judged write path and a scoped read path over two stores. Everything that enters is proposed by a model but admitted by code: a digest is itself a quality-loop run, and a memory is stored only if no confirmed finding of a withholding type names it. Every point carries provenance back to the run and iteration it was learned from, so I can retract by run, re-embed a lesson run without asking a model again, and explain any recalled line. Reads are built from the goal and the run's own open defects, fused across two vectors, curated by a pipeline, and shown to one reader only. The job assistant's memory runs on a separate runtime where Postgres is the truth and the vector index is a projection. And I measured whether any of it helps rather than assuming it does.

**Enfav LLC and the personal projects — the current project: the quality-loop engine and agentic memory › 20. Memory: digest and recall › Q2. “Why digest through the quality loop?”**

> I digest through the loop because raw text stores words and a digest stores checked claims: each memory separates its condition from its lesson, declares a kind and cites the engine's own Index, so a critic can fault it by location. What gets withheld is declared per finding type, never decided by a model: a confirmed finding of a withholding type removes exactly the memories it names. The test I apply is whether the defect makes the item false or merely weaker, which is why vagueness and duplicates are priced but never withheld. The one time a check voided a whole artifact was a 400-character statement bound sized on the wrong pipelines, so I made the bound a per-pipeline declaration under a contract ceiling and recorded a missing rubric as what it is, not as a verdict.

**Enfav LLC and the personal projects — the current project: the quality-loop engine and agentic memory › 20. Memory: digest and recall › Q3. “Postgres plus Qdrant: what lives where?”**

> Postgres is my truth and Qdrant is what I search: a lesson point is rebuilt from its digest trace with no model call and an agentic record is re-projected by the sweep, while document and knowledge points today need a re-ingest or re-digest, so losing the vector store costs embeddings for two tiers and one model pass for the third, a gap I know and have not closed. Kinds are a closed, declared list composed from each pipeline's own kinds, and every writer names the kinds it owns and replaces only those. In the loop tier, one owner's isolation is by payload, scope and unit key, enforced in the search filter; in the agentic tier tenancy is by construction, with the tenant as the first policy scope key, visibility by jsonb containment in Postgres, and a Qdrant filter built from the policy's keys rather than the request's. The store is small and I say so: hundreds to a thousand points, nothing measured at millions.

**Enfav LLC and the personal projects — the current project: the quality-loop engine and agentic memory › 20. Memory: digest and recall › Q4. “How does recall work, and who sees it?”**

> Recall starts from the bare goal and the run's own open defects, never from text a memory already added, so memory cannot compound on itself. I embed several probes, search both named vectors, fuse by reciprocal rank and, when the recall revises a judged answer, screen out what that answer already knows from lineage on the payload. A curator pipeline keeps at most eight and says what each serves; only the coach's producer reads them, so grades stay auditable. There is no similarity floor because I measured the store's geometry but have not yet recorded whether a dropped candidate would have helped, and a floor tuned to the briefs on disk is the fitting the engine forbids. With five pairs the effect on grades is +0.5 against about 9 points of noise, so my honest claim is reliability, scoping and isolation, not a grade lift yet.

**Enfav LLC and the personal projects — the current project: the quality-loop engine and agentic memory › 20. Memory: digest and recall › Q5. “Admission, duplicates, retraction and unit scoping”**

> I admit per memory, not per run: I read the digest's verdict as data and drop only the memories a confirmed withholding finding names, because a run-level gate once froze my store at six points. I never merge at write time; a re-write of the same memory is idempotent by point id, a twin from another run collapses at read by content hash, and reinforcement is a judged support row rather than a cosine rule. Every writer I ship declares the kinds it owns and replaces only those, so written is always a subset of owned and no writer can erase a neighbour. I retract by run or by point and fix the source, because a re-ingest would otherwise restate the fact. Unit facts carry a normalised unit key, and my store's filter, never a model, keeps them out of every other unit's search.

**Enfav LLC and the personal projects — the current project: the quality-loop engine and agentic memory › 20. Memory: digest and recall › Q6. “The agentic-memory runtime and the job assistant's migration”**

> The loop's memory module remembers the loop's own runs; an agent needs memory as a product, with registers, a lifecycle, tenancy and recall by key and time as well as meaning, so I built that as a separate runtime over ports and used the loop only to judge. A space is a strategy compiled under a policy and bound by name; kinds are declared behaviors, and since the 2026-10-30 migration the database holds no list of them. Postgres is the truth and the vector index a projection a sweep can rebuild. The browser session talks to a six-verb BrainPort, so the job assistant moved by adding an adapter behind it, verifying offline on a throwaway tenant with zero leaks, and flipping one config word. The rollback is that word back, and the old path still exists at HEAD until I delete it.

**Enfav LLC and the personal projects — the current project: the quality-loop engine and agentic memory › 20. Memory: digest and recall › Follow-up: “What is the consistency model of the memory store?”**

> I give two answers because there are two tiers, but one principle holds across both: Postgres is the truth, Qdrant is derived from it, and nothing is served that Postgres would contradict. In the loop tier the unit of write is one digest run: the replace step deletes the run's points of the kinds the writer owns and then upserts, both waited on, so the caller gets read-your-writes; the two calls are not one transaction, so a concurrent reader can see that run's lessons absent for a moment, which I accept for advisory memory because point ids are deterministic and the same write replayed converges. Every store step is recorded in the orchestration ledger as complete with counts, skipped with a reason or failed with the error, so a lost write is visible and never silent. In the agentic tier records are strongly consistent: one Postgres transaction closes the superseded version by compare-and-set and inserts the new one, and a lost race is refused as a conflict; the vector index is eventually consistent, projected at once when it can be and otherwise retried by the sweep. Reads repair: a semantic hit is served only after Postgres confirms the record is still current, unexpired and visible to the request, while exact and temporal recall read Postgres only and are never behind.

**Enfav LLC and the personal projects — the current project: the quality-loop engine and agentic memory › 20. Memory: digest and recall › Follow-up: “Qdrant is down in the middle of a digest. What happens?”**

> My design principle is that the store's absence never costs model work and never blocks the target. The orchestration snapshots the store's availability once at the start: if Qdrant is already down, recall is skipped as store-unavailable and the target runs anyway, the digest still runs when embeddings are enabled, and the store step skips with the same reason, so the digest's trace is in Postgres and nothing is lost; a memory-orchestrator run is re-indexed later from that trace by re-embedding, and a document or knowledge digest is rebuilt by re-ingest or re-digest. If Qdrant dies during the write, the step catches the client error and ends failed with the reason and the error text in the ledger; because replace is delete-then-upsert, the worst case is that this one run's points of the kinds it owns are absent until the re-index, and no other run's points are touched. A document ingest is safe by construction: a chunk is recorded as covered only by a digest that stored, and make-before-break retracts the previous digests only after every chunk of the new plan is stored, so an outage leaves the old facts standing rather than a half-replaced document. In the agentic tier the memories still commit to Postgres, the write answers projected false, the sweep retries every 60 seconds a page at a time, and recall by key and by time keep working while recall by meaning reports index_failed as its reason. What does not happen is a retry storm, a silent success, or a model call repeated to recover a store write.

**Enfav LLC and the personal projects — the current project: the quality-loop engine and agentic memory › 20. Memory: digest and recall › Follow-up: “How do you re-index safely?”**

> I have six rules, each with a reason in the repository's history. First, a re-index is a re-embed and never a re-digest: I rebuild a lesson run's points from its stored digest trace under today's admission rule, because a replay that asked a model again could answer differently, and since replace deletes before it writes, it would destroy what it meant to migrate. Second, I replace only what I own: the delete is scoped to the run and the kinds the writer owns, so a lessons re-index cannot erase the knowledge orchestrator's items under the same run. Third, a model or width change is a new collection, never an in-place rewrite; the name carries the generation, model and dimensions, the old collection stays readable, and in the agentic tier the sweep backfills the new one from Postgres a page at a time. Fourth, payload indexes are ensured on every boot and not only on create, because I found a store that would never have indexed a facet declared after the collection already held the corpus. Fifth, documents re-ingest make-before-break under a manifest and a lock, and sixth, I know what a re-index resurrects: a one-fact retraction is a point deletion, so I correct the source as well, or the next re-ingest restates the fact.

**Enfav LLC and the personal projects — the current project: the quality-loop engine and agentic memory › 21. Platform, delivery, security and observability › Q1. “Draw the deployment topology.”**

> “One monorepo, one engine in the middle. Eight Nest services on 3000 and 3003 to 3009, three Next clients on 4200 to 4202, Postgres and Qdrant in compose. The same two containers serve `pnpm stack:up` and `tilt up`, so either launcher shows the same runs. CI rebuilds the stack from service containers on a disposable test database. Nothing is in the cloud yet except the static site, and I would rather say that before you ask.”

**Enfav LLC and the personal projects — the current project: the quality-loop engine and agentic memory › 21. Platform, delivery, security and observability › Q2. “CI/CD: what gates a change?”**

> “I made everything that can be a mechanical rule a spec that fails the build: file size, inert exports, every bound declared once and sized from measured runs, no clock or environment inside the engine core, tests that can only ever empty a database named as disposable. I let the AI reviewer add findings; the rules and the exit code are code I own.”

**Enfav LLC and the personal projects — the current project: the quality-loop engine and agentic memory › 21. Platform, delivery, security and observability › Q3. “Security: model access, secrets, tenancy, trust.”**

> “One door to the model: the Claude Code subscription, checked at boot before any call, with the API-key variables stripped from every spawned process, so there is no API-key route. Config names files and variables, never keys, so what is committed can select a credential but never hold one. Two stores, two tenancy rules: the memory runtime requires a tenant on every request and shows a record only to a scope that contains its own; the loop's store is scoped by kind, pipeline, run and unit. And I trust nothing a model, a request body, a PR title or a terminal operator says until code has validated or classified it.”

**Enfav LLC and the personal projects — the current project: the quality-loop engine and agentic memory › 21. Platform, delivery, security and observability › Q4. “Observability: what did a run do, and is the loop healthy?”**

> “A run is a row plus a folder: the row is written as the run goes, on a queue the loop never awaits, and the folder is the complete record, every prompt and reply included. Liveness is a heartbeat, never a status: a ticker beats independently of model calls, and a janitor fails only what has stopped beating. Health reports the loop's own numbers, so a client judges staleness by the server's threshold rather than a copied constant. There is no APM yet: stdout logs, a health endpoint that probes no store, and a dead run can read as running for about six minutes.”

**Enfav LLC and the personal projects — the current project: the quality-loop engine and agentic memory › 21. Platform, delivery, security and observability › Q5. “A production failure and what you changed.”**

> “The failure I would lead with raised no error: a dropped call made a grader look lenient. The fix was not a retry alone but making a lost sample unable to change what a lens can veto, measured before and after. The other three taught me that a long-lived process holds the environment it was born with, and that a laptop is not a server.”

**Enfav LLC and the personal projects — the current project: the quality-loop engine and agentic memory › 21. Platform, delivery, security and observability › Follow-up: “How would you scale this to many tenants and concurrent runs?”**

> “I would start from what already scales: a run is a row owned by a heartbeat, so a second loop replica can share the run tables today, the controller is a pure function of ledger and policy, every consumer pulls, and the memory runtime is already partitioned by declared scope keys. What blocks, in order of pain: the model door is one subscription account, the in-flight gate is per process, the bus wakes pulls in-process, runs and the loop's own memory store carry no tenant, and Telegram allows one poller per bot token. So the next step is N stateless loop replicas behind a shared admission store, LISTEN/NOTIFY to wake pulls across replicas, a tenant on every run row and every memory point, and per-tenant quotas. A Studio grade has taken 2 to 16 minutes and a browser session runs for hours, so none of it is request-response: it is a worker pool pulling runs, with ECS on Fargate and RDS as the smallest step.”

**Enfav LLC and the personal projects — the current project: the quality-loop engine and agentic memory › 21. Platform, delivery, security and observability › Follow-up: “What would you change first to make it a production multi-tenant service?”**

> “Five changes, in this order, each because the one before makes it safe. First, authentication and authorization at every HTTP edge: today the services are reachable only through Tilt port-forwards or localhost, the Gmail and Calendar endpoints have no login, and the loop has none either. Second, a tenant on every row and every vector point in the loop's store, with the Qdrant filter and the run list reading it; the memory runtime already has this shape, so it is the model to copy. Third, observability that is not a row: a trace per run with a span per exchange, and metrics for the rates the records already carry, with the vendor exporter as configuration. Fourth, hosted stores and containers with scheduled backups, because there is no backup today and every Studio record before 2 Oct 2026 was lost to a test run. Fifth, push `main` so the CI runs on the remote again — and I would say plainly that none of the five is built.”

**Enfav LLC and the personal projects — the current project: the quality-loop engine and agentic memory › 22. The same engine behind the Studio and browser automation; ownership and evidence › Q1. “How does the Studio grade a canvas with this engine?”**

> “The Studio owns structure and storage and never judges: one port to the grader, one grading slot per session, one pipeline whose controller can only say revise, because a retry would replace a person's canvas with the model's. The loop returns findings with references; the Studio joins them onto the canvas and counts verdicts per competency, never rescaling.”

**Enfav LLC and the personal projects — the current project: the quality-loop engine and agentic memory › 22. The same engine behind the Studio and browser automation; ownership and evidence › Q2. “How does a browser session become a quality-loop run?”**

> “The browser session decides nothing of its own: a mission is declared data, every step is a run the loop can replay, and a forbidden company is cut by a validator, not by a model. A form is answered from memory scoped to the tenant and the hashed employer, and what the owner answers on Telegram becomes a fact the next form can use. The engine never learns which site it is on.”

**Enfav LLC and the personal projects — the current project: the quality-loop engine and agentic memory › 22. The same engine behind the Studio and browser automation; ownership and evidence › Q3. “What did you personally own, and what evidence backs the numbers?”**

> “I designed, built and measured it alone, with Claude Code as a pair; the commit history shows that honestly. Every number I give you has a date and a place it is written down, and when a measurement came out null — recall’s effect at n=5 — I say null. If you ask about my personal project, it is this engine: pipelines as data, a controller that is code, and a memory that is digested, scoped and retractable. The habit I would bring to your team: mark what you cannot confirm instead of rounding it up.”

**Personal Project — Agentic Engine (the résumé's DAG / graph-search wording, kept for reference) › 18. Agentic Engine › Q3. “Where do critics/evals enter?”**

> “Planning evaluation and execution evaluation are separate problems.”

**Personal Project — Agentic Engine (the résumé's DAG / graph-search wording, kept for reference) › 18. Agentic Engine › Q6. “XState vs DAG?”**

> “The DAG represents dependency structure between pieces of work. XState represents lifecycle/control state.”

**The 10 cross-cutting questions they can ask about any bullet › 2. “What did you personally own?”**

> “I personally designed X, implemented Y, led/reviewed Z, and the broader team owned W.”

**The 10 cross-cutting questions they can ask about any bullet › 3. “Why that technology?”**

> “The requirements were A/B/C. I considered X and Y. X optimized for __, Y optimized for __. We chose X because the dominant requirement was __. The tradeoff was __.”

**The 10 cross-cutting questions they can ask about any bullet › 10. “How do you know your resume metric is true?”**

> “Coverage is straightforward: the test tooling reported repository coverage after the initiative. For business metrics such as defect reduction, I would identify the exact issue-tracking baseline and comparison period rather than implying the number was subjective.”

**The answer structure I recommend memorizing**

> “Tell me about the TicketSocket scaling work.”
