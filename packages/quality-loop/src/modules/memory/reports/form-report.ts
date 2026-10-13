/**
 * What a form page's recall would retrieve for its fields, and why — the
 * form path's measurement seam. It runs exactly what the `form-memory`
 * orchestrator's recall step runs (the fields' own questions as probes, both
 * named vectors, the budget the field's kind of control takes, each field
 * fused on its own, the evidence dealt out under the cap) and reports every
 * intermediate the step keeps to itself: each vector's ranking with its
 * cosines, each field's fused list, and which of it the page would carry.
 * No pipeline runs. Null when embeddings are unavailable, for the service to
 * refuse by name.
 */
import {
  fieldTypeOf,
  reportFieldSpec,
  type FormRetrievalField,
  type FormRetrievalFieldDto,
  type FormRetrievalReportDto,
  type RetrievalHitDto,
} from '@sysdesign/contracts';

import {
  evidenceItems,
  fieldEvidence,
  fieldProbes,
  hitsFor,
  probeLists,
  searchProbes,
} from '../../../orchestrators/form-memory/probes';
import {
  VECTOR_NAMES,
  type MemoryHit,
  type MemoryPorts,
} from '../../../orchestrators/memory/ports';
import { fuse } from '../../../orchestrators/memory/recall/fusion';

/** A hit as a report lists it: where it is stored, how close it came, what it says. */
export const asHit = (hit: MemoryHit): RetrievalHitDto => ({
  runId: hit.source.runId,
  ref: hit.source.ref,
  score: hit.score,
  text: hit.text,
});

const pointKey = (point: { runId: string; ref: string }): string => `${point.runId}|${point.ref}`;

export async function formRetrievalReport(
  ports: Pick<MemoryPorts, 'embeddings' | 'store'>,
  given: readonly FormRetrievalField[],
): Promise<FormRetrievalReportDto | null> {
  const store = await ports.store.verify();
  const fields = given.map(reportFieldSpec);
  const probes = fieldProbes(fields);
  const unasked = (field: (typeof fields)[number]): FormRetrievalFieldDto => ({
    ref: field.ref,
    type: fieldTypeOf(field),
    probe: null,
    limit: hitsFor(field),
    ranked: [],
    fused: [],
  });
  if (probes.texts.length === 0) return { store, fields: fields.map(unasked), evidence: [] };

  const embedded = await ports.embeddings.embed(probes.texts);
  if (embedded === null) return null;
  const ranked = await ports.store.searchMany(searchProbes(embedded.vectors, probes.limits));
  const evidence = evidenceItems(fieldEvidence(probes, ranked));
  const aliases = new Map(evidence.map((item) => [pointKey(item.source), item.alias]));
  return {
    store,
    evidence,
    fields: fields.map((field, position) => {
      const probe = probes.byField[position];
      if (probe === null || probe === undefined) return unasked(field);
      const lists = probeLists(ranked, probe);
      const limit = probes.limits[probe] ?? hitsFor(field);
      return {
        ref: field.ref,
        type: fieldTypeOf(field),
        probe: probes.texts[probe] ?? null,
        limit,
        ranked: VECTOR_NAMES.map((using, index) => ({
          using,
          hits: (lists[index] ?? []).map(asHit),
        })),
        fused: fuse(lists, limit).map((hit) => ({
          ...asHit(hit),
          alias: aliases.get(pointKey(hit.source)) ?? null,
        })),
      };
    }),
  };
}
