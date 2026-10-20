# Decide who may do what in a multi-tenant workspace

**Archetype:** permission-model · **Difficulty:** standard

## Scenario

You own permissions for a business product where each customer runs several workspaces. Workspace admins grant roles, share single documents with a person or a group, and bring in contractors who must lose every access on a date. Support staff may act as a customer, with that customer's consent, and the audit team wants to know who granted what and when. Every request the product serves asks one question first: may this principal do this action on this resource? Design the model and the decision service that answer it.

## Functional requirements

1. An admin assigns a role to a person within one workspace, and the role's permissions apply to every resource of that workspace.
2. A person shares one document with another person or a group, granting a narrower set of actions than the role gives.
3. A grant may carry an expiry; after it, every access it gave is gone without anyone acting.
4. Every request resolves "may this principal do this action on this resource" to allow or deny, with the reason.
5. The audit team lists who granted what to whom, when, and whether the grant is still in force.

## Domain and data

- Tenant, workspace and resource form a hierarchy; a grant attaches at one level and applies below it.
- A principal is a person, a group or a service account; a group's members change without touching its grants.
- A grant records its grantor, its scope, its actions and its expiry; a grant never outlives its grantor's own right to give it.
- Impersonation is a grant of its own, recorded with the consent that allowed it.

## Interfaces

- The decision operation is idempotent and answers deny with a machine-readable reason, so a caller can tell "no such resource" from "not permitted".
- Grants, revocations and expiries are published as events so downstream caches and audit stores follow without polling.
- The decision operation is versioned: a change to what a role means never changes an answer a caller already relies on without notice.

## Non-functional requirements

| Kind        | Requirement                                         | Target                      |
| ----------- | --------------------------------------------------- | --------------------------- |
| security    | A principal never sees or acts across tenants       | zero cross-tenant decisions |
| consistency | A revoked grant stops working everywhere it applied | within one minute           |
| durability  | The grant history is kept for the audit team        | retained for seven years    |

## Decisions to make

- Resolve the effective permission at request time, or materialise it when grants change — and what each costs when a group of ten thousand members changes.
- Deny overrides, or the most specific grant wins, when a role allows and a share forbids.
- Where an impersonation is recorded so that the audit reads the person, not the customer they acted as.

## Constraints

- An existing identity provider owns login; the system never sees a password.
- Legal requires that no row be readable across tenants, however the storage is shared.
