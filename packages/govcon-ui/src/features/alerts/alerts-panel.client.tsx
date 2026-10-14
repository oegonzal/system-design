'use client';

import { DEFAULT_ALERTS_LIMIT } from '@sysdesign/contracts';
import { Alert, Spinner } from '@sysdesign/design-system';
import { useResource } from '@sysdesign/web-kit';
import { useState } from 'react';

import { api } from '../../api/client';
import { AlertList } from './alert-list';

/** The raised alerts, a page at a time; the page shown stays while the next loads. Reading them costs no request to any source. */
export function AlertsPanel() {
  const [offset, setOffset] = useState(0);
  const page = useResource(
    (signal) => api.listAlerts({ limit: DEFAULT_ALERTS_LIMIT, offset }, { signal }),
    [offset],
  );
  if (page.data === null) {
    return page.error ? (
      <Alert tone="danger">{page.error}</Alert>
    ) : (
      <Spinner label="Loading the alerts" />
    );
  }
  return (
    <>
      {page.error ? <Alert tone="danger">{page.error}</Alert> : null}
      <AlertList
        alerts={page.data.data}
        total={page.data.meta.total}
        limit={page.data.meta.limit}
        offset={page.data.meta.offset}
        onPage={setOffset}
        loading={page.loading}
      />
    </>
  );
}
