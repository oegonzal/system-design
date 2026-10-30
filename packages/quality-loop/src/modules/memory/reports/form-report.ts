/**
 * What a form page's recall would retrieve for its fields, and why — the
 * form path's measurement seam. It runs exactly what the `form-memory`
 * orchestrator's recall step runs (the fields' own questions as probes, both
 * named vectors, the budget the field's kind of control takes, the unit of
 * work the page names, each field fused on its own, the evidence dealt out
 * under the cap) and reports every intermediate the step keeps to itself:
 * each vector's ranking with its cosines, each field's fused list, and which
 * of it the page would carry — every hit with the kind, scope and unit the
 * store holds it under. No pipeline runs. Null when embeddings are
 * unavailable, for the service to refuse by name.
 */
import {
  fieldProbes,
  fieldTypeOf,
  hitsFor,
  reportFieldSpec,
  type FormRetrievalField,
  type FormRetrievalFieldDto,
  type FormRetrievalHitDto,
  type FormRetrievalReportDto,
  type RetrievalHitDto,
} from '@sysdesign/contracts';

import {
  evidenceItems,
  evidenceRef,
  fieldEvidence,
  HITS_PER_FIELD_TYPE,
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

/** A hit as the form report lists it: as any report does, with the kind, scope and unit the store holds it under. */
const asFormHit = (hit: MemoryHit): FormRetrievalHitDto => ({
  ...asHit(hit),
  kind: hit.source.kind,
  scope: hit.scope ?? null,
  unitKey: hit.unitKey ?? null,
});

export async function formRetrievalReport(
  ports: Pick<MemoryPorts, 'embeddings' | 'store'>,
  given: readonly FormRetrievalField[],
  /** The unit of work the page names, as a form goal's index would; absent for a page naming none. */
  unitKey: string | undefined,
): Promise<FormRetrievalReportDto | null> {
  const store = await ports.store.verify();
  const fields = given.map(reportFieldSpec);
  const probes = fieldProbes(fields, HITS_PER_FIELD_TYPE);
  const unasked = (field: (typeof fields)[number]): FormRetrievalFieldDto => ({
    ref: field.ref,
    type: fieldTypeOf(field),
    probe: null,
    limit: hitsFor(field, HITS_PER_FIELD_TYPE),
    ranked: [],
    fused: [],
  });
  if (probes.texts.length === 0) return { store, fields: fields.map(unasked), evidence: [] };

  const embedded = await ports.embeddings.embed(probes.texts);
  if (embedded === null) return null;
  const ranked = await ports.store.searchMany(
    searchProbes(embedded.vectors, probes.limits, unitKey),
  );
  const evidence = evidenceItems(fieldEvidence(probes, ranked));
  const aliases = new Map(evidence.map((item) => [item.source.ref, item.alias]));
  return {
    store,
    evidence,
    fields: fields.map((field, position) => {
      const probe = probes.byField[position];
      if (probe === null || probe === undefined) return unasked(field);
      const lists = probeLists(ranked, probe);
      const limit = probes.limits[probe] ?? hitsFor(field, HITS_PER_FIELD_TYPE);
      return {
        ref: field.ref,
        type: fieldTypeOf(field),
        probe: probes.texts[probe] ?? null,
        limit,
        ranked: VECTOR_NAMES.map((using, index) => ({
          using,
          hits: (lists[index] ?? []).map(asFormHit),
        })),
        fused: fuse(lists, limit).map((hit) => ({
          ...asFormHit(hit),
          alias: aliases.get(evidenceRef(hit.source)) ?? null,
        })),
      };
    }),
  };
}
