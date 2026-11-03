Provide best practices in software engineering and system design flows for both authentication and authorization
A strong system-design answer starts by keeping the two concerns separate:

Authentication = who are you?
Authorization = what are you allowed to do?

They often happen in the same request path, but they should not be treated as the same thing.

A good modern architecture looks like this:

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
The key principle is that authentication usually happens at the boundary, while authorization must still happen at the service/domain layer.

Authentication flow
For a typical web application using OIDC/OAuth:

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
The access token might contain claims such as:

{
  "sub": "user-123",
  "iss": "https://auth.example.com",
  "aud": "orders-api",
  "roles": ["customer"],
  "scope": "orders:read orders:create",
  "exp": 1790000000
}

The API should validate:

signature
issuer
audience
expiration
token type
required scopes
With asymmetric signing:

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
The public key is not secret. The private signing key must be protected.

A common production design is:

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
That avoids calling the auth server on every API request.

Authorization flow
Authentication only proves:

user = user-123
Authorization asks something more specific:

Can user-123 refund order-456?
A strong authorization flow is:

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
For example:

DELETE /orders/456
JWT:

{
  "sub": "user-123",
  "roles": ["customer"],
  "scope": "orders:read"
}

The service checks:

Does token have orders:delete?
        ↓
       no
        ↓
   403 Forbidden
Or suppose scope is allowed, but the order belongs to another user:

authenticated user = 123
order.owner_id = 999
Then:

403 Forbidden
That second check must happen in the service because the gateway usually does not know resource ownership.

Best-practice split between gateway and service
Use the gateway for coarse-grained access control:

API Gateway
-------------
validate JWT
validate issuer/audience
reject expired tokens
check broad scopes
rate limit
reject guests
Use the service for domain authorization:

Order Service
-------------
does user own order?
is order refundable?
does merchant have permission?
is user in correct tenant?
is operation valid in current state?
This is much safer than relying only on the gateway.

A useful rule:

Gateway answers “Can this caller reach this API?”
Service answers “Can this caller perform this action on this resource?”

RBAC vs ABAC
The two most common authorization models are RBAC and ABAC.

RBAC:

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
Good for simple organizational permissions.

ABAC adds contextual rules:

user.role = manager
resource.tenant_id = user.tenant_id
resource.amount < refund_limit
request.region = allowed_region
Then authorization can express:

Manager may refund
IF same tenant
AND amount < $500
AND order status = COMPLETED
For large SaaS systems, a hybrid is common:

RBAC
+
resource ownership
+
tenant boundaries
+
contextual policy
Multi-tenant security
For white-label or SaaS systems, tenant isolation is critical.

Bad:

GET /orders?tenant_id=merchant-b
where the client chooses the tenant.

Better:

JWT
{
  sub: user123,
  tenant_id: merchantA
}
Then backend binds:

SELECT *
FROM orders
WHERE tenant_id = :authenticatedTenant
  AND user_id = :authenticatedUser;

Never trust:

tenant_id from request body
over:

tenant_id from authenticated context
This prevents cross-tenant access.

Sessions vs JWTs
A session-based system typically works like:

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
JWT-based authentication:

Browser
 │
 │ JWT
 ▼
API
 │
 │ verify locally
 ▼
user123
JWT advantages:

stateless verification
easy horizontal scaling
good for distributed APIs
Session advantages:

easy logout/revocation
centralized control
smaller client token
A common pattern is:

browser session
+
short-lived access tokens
rather than extremely long-lived JWTs.

Token lifetimes
Access tokens should usually be short-lived:

5–15 minutes
or another reasonably short duration based on risk.

Refresh token:

longer lived
more sensitive
stored carefully
rotated
Flow:

access token expires
      │
      ▼
refresh token
      │
      ▼
new access token
Best practice:

refresh-token rotation
Meaning every refresh produces a new refresh token and invalidates the previous one.

This helps detect token theft.

Cookies
For browser applications, sensitive session/refresh credentials are often safer in secure cookies:

Set-Cookie:
session=...
Secure;
HttpOnly;
SameSite=Lax
Secure means HTTPS only.

HttpOnly prevents JavaScript from reading the cookie.

SameSite helps reduce CSRF risk.

Avoid storing highly sensitive long-lived tokens in:

localStorage
when a secure HttpOnly cookie architecture is available, because XSS can read localStorage.

CSRF vs XSS
Authentication design should account for both.

With cookies:

CSRF
becomes an important concern because browsers automatically send cookies.

Mitigations:

SameSite
CSRF token
Origin/Referer validation
With bearer tokens stored in JavaScript:

XSS
is especially dangerous because malicious JS may steal them.

Mitigations:

Content Security Policy
output escaping
input sanitization
avoid unsafe DOM APIs
HttpOnly cookies
dependency hygiene
Service-to-service authentication
Internal services should not blindly trust that traffic is internal.

Example:

Order Service
    │
    ▼
Payment Service
Use one of:

mTLS
service identity
short-lived service JWT
cloud IAM identity
OAuth client credentials
For example:

Order Service
    │
    │ service token
    ▼
Payment Service
    │
    ├── verify service identity
    └── verify scope=payments:create
Avoid:

"it's inside the VPC, so it's trusted"
That is weak security design.

Secrets management
Do not put:

DB passwords
OAuth client secrets
payment API keys
JWT private keys
in source code or plain environment files committed to git.

Use:

AWS Secrets Manager
GCP Secret Manager
Vault
KMS
with least-privilege access.

Example:

Payment Service IAM role
      │
      ▼
can read:
merchantA/square-token

Cannot read:
unrelated production secrets
Password storage
If your application manages passwords itself:

Never store:

plaintext password
reversible encryption
simple SHA256(password)
Use a password hashing algorithm:

Argon2id
bcrypt
scrypt
with unique salts.

Also support:

MFA
rate limiting
credential-stuffing detection
password reset tokens
account lockout / throttling
Authorization should be deny-by-default
A good authorization model is:

no explicit permission
→ deny
not:

unknown case
→ allow
For example:

if (!policyAllows(user, action, resource)) {
  throw new ForbiddenException();
}

This is safer than scattering:

if (user.role === 'admin') ...

through controllers.

Centralize policy logic.

Policy layer
For complex applications:

Controller
    │
    ▼
Authorization Policy
    │
    ▼
Business Service
Example conceptual policy:

canRefund(user, order) =
  user.tenantId === order.tenantId &&
  user.permissions.includes('refund') &&
  order.status === 'COMPLETED'

At larger scale, teams may use dedicated policy systems such as OPA-style policy engines, but that is only worth the complexity when authorization rules become sufficiently broad.

API design: 401 vs 403
Use:

401 Unauthorized
when authentication is missing or invalid.

Despite the name, it really means:

authentication required/failed.

Use:

403 Forbidden
when:

identity is known, but permission is denied.

Example:

No token
→ 401

Valid token but wrong role
→ 403
For sensitive resources, some systems intentionally return:

404
instead of revealing that another user's resource exists.

Authorization and database queries
A strong pattern is to bind authorization directly into query shape.

Instead of:

SELECT * FROM orders WHERE id = :orderId;

then later checking user ownership, use:

SELECT *
FROM orders
WHERE id = :orderId
  AND user_id = :authenticatedUser
  AND tenant_id = :authenticatedTenant;

Then unauthorized resources naturally return no row.

This reduces accidental data leaks.

Rate limiting and abuse prevention
Authentication endpoints need stronger rate limiting than ordinary APIs.

Protect:

/login
/password-reset
/MFA
/token refresh
with:

per-IP rate limits
per-account limits
bot detection
progressive delays
CAPTCHA where appropriate
But avoid permanent account lockout solely based on failed login attempts because attackers can weaponize that for denial of service.

Logging and audit
Do log:

login success/failure
token validation failure
authorization denial
privileged action
role change
password reset
API key creation
refund
admin impersonation
Do not log:

passwords
access tokens
refresh tokens
credit card numbers
private keys
Audit log example:

actor_id
tenant_id
action
resource_type
resource_id
timestamp
result
source_ip
trace_id
For sensitive actions, append-only audit logs are valuable.

Distributed tracing
Propagate identity context carefully:

trace_id
user_id or anonymized subject
tenant_id
service identity
But don't dump full JWTs into logs/traces.

Example:

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
Now you can debug authorization failures end-to-end.

CI/CD security
Authentication and authorization changes should be treated as high-risk.

A solid pipeline:

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
Important automated tests:

user can access own resource
user cannot access another user's resource
merchant A cannot access merchant B
expired token rejected
wrong audience rejected
wrong issuer rejected
missing scope rejected
admin permission works
revoked/disabled user behavior correct
Authorization tests are especially important because many security bugs are:

valid authentication + missing authorization check.

Failure behavior
Think through:

IdP unavailable
JWKS endpoint unavailable
token expired
key rotated
Redis/session store unavailable
authorization DB slow
service clock skew
refresh token stolen
user disabled while token valid
Good designs use:

cached JWKS
short token TTL
key rotation overlap
timeouts
circuit breakers
fail-closed authorization
For authorization, default to:

uncertain
→ deny
not:

dependency failed
→ allow
Key rotation
Identity provider:

old private key
      ↓
new private key
JWKS temporarily exposes:

public key A
public key B
JWT header includes:

{
  "kid": "key-B"
}

Verifier chooses the appropriate public key.

Keep old verification keys until tokens signed with them expire.

A strong interview system-design answer
If an interviewer asks:

“How would you design authentication and authorization for this system?”

You can say:

“I separate authentication from authorization. Authentication is centralized through an identity provider using OIDC/OAuth, which issues short-lived signed access tokens. At the edge or API gateway I verify signature, issuer, audience, expiration and broad scopes, using cached JWKS keys so request validation stays local and scalable. I then propagate the authenticated identity to downstream services. Authorization remains enforced inside each domain service because that layer understands resource ownership and business rules—for example whether this user owns this order, belongs to this tenant, and has permission to refund it. I prefer deny-by-default policies, tenant-bound database queries, least-privilege service identities, secure secret storage and audit logging. For browsers I protect session or refresh credentials with Secure, HttpOnly, SameSite cookies, and I use short access-token lifetimes plus refresh-token rotation. Service-to-service calls are independently authenticated with service identity or mTLS rather than trusting the network. Finally, I test negative authorization paths in CI and monitor auth failures, privilege changes and suspicious login activity in production.”

The shortest mental model to keep is:

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
And the most important security rule is:

Authenticate once at the boundary, but authorize every sensitive operation at the domain boundary.











Yes. I would add a dedicated **“Security, Identity & Authorization” reference section near the front of your interview-prep document**, then cross-reference it from the Gala, Frequence, and TicketSocket sections. That gives you a vocabulary lookup plus concrete architectures tied to things you can actually discuss from your career.

One distinction matters throughout this section: some implementation details are explicitly supported by your resume/current descriptions, while others are the **lead-level architecture I recommend you use to explain how such a system should be designed**. Where the exact historical implementation matters and we have not established it, I mark it **[VERIFY]** rather than inventing experience.

---

# Security & Identity — quick-reference catalog

| Term | Interview definition | Where it matters in your experience |
|---|---|---|
| **Authentication (AuthN)** | Establishes **who the caller is**. | Auth0/TicketSocket SSO, Gala user accounts, Frequence users. |
| **Authorization (AuthZ)** | Determines **what an authenticated caller may do to a particular resource**. | Tenant isolation, refunds, campaign access, NFT/token actions. |
| **Identity Provider (IdP)** | System that authenticates a user and asserts their identity. Auth0 can be an IdP or broker other IdPs. | TicketSocket white-label SSO. |
| **Identity federation** | One system trusts identity established by another organization/system. | A Meow Wolf user signs into the TicketSocket-powered white-label experience without a second set of credentials. |
| **SSO** | User authenticates once and can enter another trusted application without signing in again. | Merchant → TicketSocket handoff. |
| **OAuth 2.0** | Framework for delegated authorization/access to APIs. | Access tokens, payment-provider OAuth. |
| **OIDC** | Authentication protocol built on OAuth 2.0. Adds user identity, ID tokens and discovery. | Auth0 web SSO. |
| **SAML** | XML-based enterprise federation protocol. Common alternative to OIDC for enterprise IdPs. | Possible enterprise TicketSocket clients **[VERIFY actual client protocols]**. |
| **Authorization Code + PKCE** | Preferred browser/mobile OAuth/OIDC flow. Browser receives a temporary code rather than exposing credentials/tokens through URLs. PKCE binds the exchange to the initiating client. | White-label SSO. |
| **JWT** | Signed token format containing claims. JWT is a format, not itself an authentication protocol. | TicketSocket JWT/service allocation; user/service auth. |
| **ID token** | OIDC token describing the authenticated user. Primarily for the client to establish identity. | SSO/login. |
| **Access token** | Credential presented to an API to access protected resources. | `Authorization: Bearer ...`. |
| **Refresh token** | Longer-lived credential used to obtain new access tokens. Highly sensitive. | Long-lived sessions where required. |
| **Claim** | A field in a signed token: `sub`, `tenant_id`, `role`, `scope`, `aud`, etc. | Multi-tenant authorization. |
| **`sub`** | Stable subject/user identifier asserted by the issuer. | Maps authenticated identity to application user. |
| **`iss`** | Token issuer. API verifies that it trusts this issuer. | JWT verification. |
| **`aud`** | Audience: which application/API the token was issued for. | Prevents a token for App A from being reused against API B. |
| **Scope** | Capability granted to a token, e.g. `orders:read`. | API-level authorization. |
| **Role** | User category grouping permissions. | `tenant_admin`, `analyst`, `manager`, etc. |
| **RBAC** | Role-Based Access Control: permissions assigned to roles. | Frequence SaaS, TicketSocket merchant employees. |
| **ABAC** | Attribute-Based Access Control: decisions consider user, tenant, resource, amount, status, geography, etc. | “Manager can refund orders in their tenant up to X.” |
| **Tenant isolation** | Ensures tenant A cannot access tenant B's data. | Frequence and TicketSocket white-label SaaS. |
| **Session** | Logical ongoing authenticated interaction. May be server-side state referenced by a browser cookie. | Web applications. |
| **Cookie** | Small browser-managed value automatically sent to a domain. | Secure browser sessions. |
| **HttpOnly** | Prevents browser JavaScript from reading a cookie. | Helps reduce token theft through XSS. |
| **Secure cookie** | Cookie transmitted only through HTTPS. | Browser auth. |
| **SameSite** | Controls cross-site cookie behavior and helps defend against CSRF. | Browser auth. |
| **MFA** | Requires more than one authentication factor. | High-value Gala account/security operations. |
| **Step-up authentication** | Requires stronger/recent authentication only for a sensitive operation. | Token purchases, wallet changes, refunds. |
| **JWKS** | Endpoint exposing an issuer's public verification keys. | Auth0/OIDC JWT verification. |
| **Key rotation** | Periodically change signing/encryption keys while allowing safe transition from old keys. | JWT infrastructure. |
| **Nonce** | Single-use unpredictable value used to prevent replay. | OIDC and crypto-wallet proof. |
| **`state`** | OAuth parameter correlating authorization request/response and protecting against request forgery. | SSO redirect flow. |
| **Replay attack** | Attacker captures a valid request/signature and submits it again. | Crypto signing, payment webhooks, rewards. |
| **Idempotency** | Repeating the same operation produces no additional side effect. | Payments, refunds, token purchases, webhook retries. |
| **Webhook signature** | Cryptographic evidence that an incoming webhook was generated by the expected provider. | Square/payment-provider events. |
| **Tokenization** | Replace sensitive card data with a provider-generated token. | TicketSocket payment processing / PCI reduction. |
| **Secret manager** | Secure system for API keys, OAuth tokens and credentials. | Merchant-specific processor credentials. |
| **KMS/HSM** | Systems that protect cryptographic keys; an HSM performs sensitive cryptographic operations in hardened hardware. | Signing infrastructure, custodial crypto if applicable. |
| **Least privilege** | Every user/service gets only permissions it actually needs. | IAM, payment service, support roles. |
| **mTLS** | Both sides of a TLS connection authenticate with certificates. | High-security service-to-service communication. |
| **Audit log** | Immutable/append-oriented record of who performed a security-sensitive operation. | Refunds, admin changes, token/merchant actions. |
| **RLS** | PostgreSQL Row-Level Security; DB itself can enforce which rows a tenant/user may access. | Optional defense-in-depth for SaaS. |
| **CORS** | Browser policy governing which origins can call an API. **It is not authentication or authorization.** | White-label web apps. |
| **Frontend route guard** | UX mechanism preventing navigation. **It is not security.** Backend must authorize independently. | Angular/Vue/React apps. |
| **Transaction intent** | Application-specific record/token describing a specific authorized sensitive action. Not a universal protocol. | Useful model for Gala purchases/mints. |
| **Wallet proof** | User proves control of a crypto wallet by signing a server-generated challenge. | Gala/Web3. |

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

# Frequence/Madhive — multi-tenant SaaS security

Your resume establishes that you helped lead Frequence's configurable Angular framework and workflows, provided technical direction across 30+ engineers/QAs, and worked on a large AdTech platform. Oscar Gonzalez - Lead Engineer … Your additional context establishes the white-label/multi-tenant SaaS aspect.

The principal security invariant is:

> **A valid Frequence user from Tenant A must never be able to read or modify Tenant B's campaign, audience, strategy, reporting or configuration data.**

That is stronger than merely saying “users must log in.”

## Lead-level architecture

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

## Layer the tenant isolation

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

## RBAC + ABAC

Do not reduce authorization to:

```text
if role === admin
```

A strong SaaS model combines role with resource context.

Example conceptual matrix:

| Role | Planning | Campaign activation | Reporting | Tenant configuration |
|---|---:|---:|---:|---:|
| Viewer/Analyst | Read | No | Read | No |
| Campaign Manager | Read/write | Allowed | Read | No |
| Tenant Admin | Read/write | Allowed | Read/write | Allowed |
| Platform Support | Explicit scoped access only | Explicit | Explicit | Audited |

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

## Frontend responsibility

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

## Frequence CI/CD security flow

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

# Gala — account, wallets, token transactions and scarce digital inventory

Your resume explicitly supports Web3 launch workflows, digital ownership/NFT collectibles, reward-driven experiences, Node/NestJS services, blockchain application paths and production-critical token/ICO launches. Oscar Gonzalez - Lead Engineer …

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

## 1. Gala account authentication

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

# 2. Proving wallet ownership

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

# 3. Sensitive token/collectible transaction

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

# 4. Preventing replay and duplicate token transactions

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

# 5. Protecting collectible/token inventory

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

# 6. Crypto key safety

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

# Gala CI/CD and launch security

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

# TicketSocket — white-label SSO, tenant identity and merchant payment processing

Your resume supports white-label partner workflows, PostgreSQL transactional processing, webhooks, JWT-based service allocation, AWS ticketing scale and partner APIs. Oscar Gonzalez - Lead Engineer … You have also established in this conversation that Auth0 was used and that different merchants integrated their own processors.

This is the company where I would expect your interviewer to test **authentication, tenant isolation, payments, webhooks and inventory all together**.

---

# TicketSocket SSO: existing merchant user → white-label TicketSocket

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

## Full redirect flow

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

# Safe JWT/token handling

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

## Never put bearer tokens in URLs

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

# Tenant isolation after SSO

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

# TicketSocket payment-provider architecture

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

# Merchant payment credentials

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

# Card data/tokenization

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

# Ticket purchase + payment security

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

# Idempotent payment flow

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

# Signed webhook verification

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

# Out-of-order webhook handling

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

# Merchant refund authorization

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

# TicketSocket CI/CD security flow

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

# Gala vs Frequence vs TicketSocket — security comparison

This table is useful to memorize because it lets you tailor your answer to the domain rather than giving the same generic JWT explanation every time.

| Company/use case | Most important security invariant | Primary security patterns |
|---|---|---|
| **Frequence multi-tenant SaaS** | Tenant A must never access Tenant B's business data. | Trusted tenant context, RBAC/ABAC, tenant-scoped DB queries/cache/events, negative isolation testing. |
| **Gala Web3** | Only the authorized account/wallet can perform a valid transaction, and scarce/digital assets cannot be duplicated or replayed. | Account auth, MFA/step-up, wallet challenge/signature, nonce, idempotency, transaction state machine, protected keys, authoritative inventory. |
| **TicketSocket SSO** | Merchant users can seamlessly authenticate without TicketSocket owning/copying the merchant's passwords. | Auth0 federation, OIDC/SAML, authorization code + PKCE, audience-restricted tokens, secure sessions. |
| **TicketSocket multi-tenant** | Merchant A can never see Merchant B's customers/orders/tickets. | JWT/session tenant identity, RBAC, tenant-bound resource queries. |
| **TicketSocket payments** | Only authorized merchant actions can charge/refund through the correct merchant processor, exactly once logically. | Tenant-scoped secrets, tokenization, adapter pattern, idempotency, audit logs. |
| **TicketSocket webhooks** | Only authentic provider events change payment state, and duplicates/out-of-order events cannot corrupt it. | Signature verification, event dedupe, state/version guards, queue, DLQ/reconciliation. |
| **TicketSocket inventory** | One finite seat cannot be sold twice. | Admission control, atomic hold, strong consistency, TTL, payment Saga. |

---

# What “zero trust” means in these systems

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

# Three 60-second interview answers to memorize

### Frequence

> “For Frequence, I think about security primarily as multi-tenant authorization. Authentication establishes the user, but every business operation also needs trusted tenant context and role permissions. I would derive the tenant from authenticated identity rather than a caller-supplied parameter, then bind that tenant throughout the API, database query, cache namespace and asynchronous event path. RBAC handles broad capabilities, while resource and workflow attributes handle fine-grained authorization. Angular guards improve UX but aren't security—the APIs enforce the policy. In CI I'd specifically test negative cross-tenant paths because the highest-severity failure is Tenant A seeing Tenant B's campaign or reporting data.”

### Gala

> “At Gala I separate account identity, wallet ownership and blockchain transaction authorization. A user first authenticates to the application; sensitive operations can require step-up authentication. To establish wallet ownership, the backend generates a short-lived one-time challenge that the wallet signs locally, so the private key never leaves the wallet. For purchases or token operations, the backend validates price, eligibility and inventory, creates an idempotent transaction intent, and tracks the transaction through submitted, pending, confirmed or failed states. Replay prevention, nonces, reconciliation and atomic inventory allocation are important because a blockchain timeout is not necessarily a failed transaction.”

### TicketSocket

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