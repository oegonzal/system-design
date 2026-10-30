import type { MemoryRecordDto } from '@sysdesign/contracts';

import { renderForget, renderHistory, renderRecall } from './render';
import { SPACE_ID } from './test/fakes';

/** A record as the memory host answers one: Ada's language, current, under the north tenant. */
const record = (overrides: Partial<MemoryRecordDto> = {}): MemoryRecordDto => ({
  id: '3b4c5d6e-7f80-4a1b-9c2d-3e4f5a6b7c8d',
  register: 'semantic_fact',
  kind: 'semantic',
  scope: { tenant: 'north' },
  identity: '["Ada","language"]',
  keys: ['Ada'],
  body: {},
  metadata: {},
  text: 'Ada language   TypeScript',
  status: 'active',
  version: 1,
  supersedesId: null,
  lineageId: 'l-1',
  validFrom: '2026-10-02T12:00:00.000Z',
  validTo: null,
  recordedAt: '2026-10-02T12:00:00.000Z',
  expiresAt: null,
  closedAt: null,
  closeReason: null,
  support: 1,
  provenance: { source: 'memory-ingest:notes', sourceRunId: 'abc', derivedFrom: [] },
  projected: true,
  ...overrides,
});

const addressed = { space: { id: SPACE_ID, name: 'notes-space' }, scope: { tenant: 'north' } };

describe('the space command renders', () => {
  it('[ING-4] renderRecall prints the space and the tenant, what was asked, each memory ranked with its register and day on one line, and the routes with what the budget left out', () => {
    const text = renderRecall({
      ...addressed,
      key: 'Ada',
      text: 'which language',
      register: 'semantic_fact',
      items: [
        {
          record: record(),
          score: 0.91234,
          factors: { similarity: 1, exact: 1, recency: 1, support: 0 },
          routes: ['exact', 'semantic'],
        },
      ],
      routes: [
        { route: 'exact', registers: ['semantic_fact'], hits: 1, dropped: 0, skipped: null },
        { route: 'semantic', registers: ['semantic_fact'], hits: 1, dropped: 1, skipped: null },
      ],
      omitted: 2,
    });
    expect(text).toContain(
      `notes-space (${SPACE_ID}) · tenant north · key "Ada" · text "which language" · register semantic_fact`,
    );
    expect(text).toMatch(/record\s+register\s+since\s+score\s+text/);
    expect(text).toMatch(
      /3b4c5d6e-7f80-4a1b-9c2d-3e4f5a6b7c8d@v1\s+semantic_fact\s+2026-10-02\s+0\.912\s+Ada language TypeScript/,
    );
    expect(text).toContain('routes: exact 1 hit · semantic 1 hit, 1 dropped · omitted 2');
    expect(
      renderRecall({
        ...addressed,
        key: null,
        text: 'q',
        register: null,
        items: [],
        routes: [],
        omitted: 0,
      }),
    ).toContain('(nothing recalled)');
  });

  it('[ING-4] renderHistory prints every version with when it held and how it ended; renderForget prints the record as closed with its reason', () => {
    const closed = record({
      version: 2,
      status: 'invalidated',
      closedAt: '2026-10-14T08:00:00.000Z',
      closeReason: 'stated of someone else',
      validTo: '2026-10-14T08:00:00.000Z',
    });
    const history = renderHistory({
      ...addressed,
      recordId: closed.id,
      versions: [record({ status: 'superseded', validTo: '2026-10-10T00:00:00.000Z' }), closed],
    });
    expect(history).toContain(`notes-space (${SPACE_ID}) · tenant north · record ${closed.id}`);
    expect(history).toMatch(/record\s+status\s+since\s+until\s+closed\s+text/);
    expect(history).toMatch(/@v1\s+superseded\s+2026-10-02\s+2026-10-10\s+Ada language TypeScript/);
    expect(history).toMatch(
      /@v2\s+invalidated\s+2026-10-02\s+2026-10-14\s+stated of someone else\s+Ada language TypeScript/,
    );

    const forget = renderForget({ ...addressed, reason: 'stated of someone else', record: closed });
    expect(forget).toContain(
      `${closed.id}@v2 invalidated at 2026-10-14T08:00:00.000Z: stated of someone else`,
    );
    expect(forget).toContain('Ada language TypeScript');
  });
});
