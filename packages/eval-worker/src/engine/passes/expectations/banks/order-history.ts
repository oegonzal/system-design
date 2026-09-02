/**
 * The order-history archetype bank: expectations OUTSIDE the product
 * dimension that grade this prompt family's own bullets — per-customer
 * authorization on the serving path, and a read model that survives its
 * sources. The product bank owns workflow coverage; these own the PDF's
 * security and availability story, structurally.
 */
import type { Archetype } from '@sysdesign/contracts';

import { sortById } from '../../../rules/shared';
import { judgeGraphWorkflow, verdictById } from '../../../workflows';
import type { Expectation } from '../types';
import { met, unmet } from '../types';

const ORDER_HISTORY: readonly Archetype[] = ['order-history-integration'];

const ownOrdersScoped: Expectation = {
  id: 'exp.ohi.own-orders-scoped',
  dimension: 'security',
  weight: 2,
  severityIfUnmet: 'high',
  nfrKind: 'security',
  minDifficulty: 'intro',
  archetypes: ORDER_HISTORY,
  title: 'Nothing scopes the history to its owner',
  teach: () =>
    'A signed-in customer sees only their own orders and a guest sees none — which means every path from a client to the component serving the history must pass an authenticating gateway. The scoping cannot live in the page: by the time a row reaches an unauthenticated caller, the requirement is already broken.',
  satisfiedBy: ({ facts, index }) => {
    const report = judgeGraphWorkflow(index, facts.workflow);
    if (!report) return unmet();
    const map = verdictById(report);

    // The serving components: nodes whose declared ops fulfil the spec's
    // query contracts. Without one, per-customer scoping has no subject.
    const queryIds = new Set(
      (facts.workflow?.operations ?? []).filter((op) => op.kind === 'query').map((op) => op.id),
    );
    const serving = sortById(
      index
        .nodes()
        .filter((node) =>
          (node.operations ?? []).some(
            (op) => op.fulfills !== undefined && queryIds.has(op.fulfills),
          ),
        ),
    );
    const anyServed = [...queryIds].some((id) => map.get(id)?.status === 'corroborated');
    if (serving.length === 0 || !anyServed) {
      return unmet(sortById(index.clients()).map((node) => node.id));
    }

    // The MECHANISM_EVIDENCE.authentication reading: a stated mode that is
    // not 'none'. Absence is absence, not denial — but here the requirement
    // demands the front door actually authenticate, so absence is unmet.
    const gateways = sortById(index.byKind('gateway'));
    const authed = gateways.filter((gateway) => {
      const mode = gateway.config?.['authMode'];
      return typeof mode === 'string' && mode !== 'none';
    });
    if (authed.length === 0) {
      return unmet(serving.map((node) => node.id));
    }

    const exposed = sortById(index.clients()).filter((client) =>
      serving.some((node) => index.pathExists(client.id, node.id, { avoidKinds: ['gateway'] })),
    );
    if (exposed.length > 0) {
      return unmet(exposed.map((node) => node.id));
    }
    return met([...authed, ...serving].map((node) => node.id).sort());
  },
};

const readThroughOutage: Expectation = {
  id: 'exp.ohi.read-through-outage',
  dimension: 'reliability',
  weight: 1,
  severityIfUnmet: 'medium',
  nfrKind: 'availability',
  minDifficulty: 'intro',
  archetypes: ORDER_HISTORY,
  title: 'The history page is a proxy to its sources',
  teach: () =>
    'Stale beats down: when either source system is unreachable, customers should still read yesterday’s history. That requires an owned read model — a store the ingest paths write and the page reads — with no client-reachable path into the external systems. A design that fetches from the source on page load inherits every outage the source has.',
  satisfiedBy: ({ index }) => {
    const clients = sortById(index.clients());
    const externals = sortById(index.byKind('external-api'));
    const proxied = clients.filter((client) =>
      externals.some((external) => index.pathExists(client.id, external.id)),
    );
    if (proxied.length > 0) {
      return unmet(
        proxied.map((node) => node.id),
        [],
        'A client-reachable path leads into an external system — the history read inherits its outages. Serve reads from an owned store the ingests keep fresh.',
      );
    }
    const stores = sortById([
      ...index.byKind('database'),
      ...index.byKind('kv-store'),
      ...index.byKind('search-index'),
    ]).filter((store) => clients.some((client) => index.pathExists(client.id, store.id)));
    if (stores.length === 0) return unmet(clients.map((node) => node.id));
    return met(stores.map((node) => node.id));
  },
};

export const orderHistoryExpectations: Expectation[] = [ownOrdersScoped, readThroughOutage];
