'use client';

import { useResource } from '@sysdesign/web-kit';
import { useState } from 'react';

import { api } from '../../api/client';
import { IncumbentsPanel } from './incumbents-panel';

export interface IncumbentsLensProps {
  noticeId: string;
  /** The notice's own product service code, when it has one. */
  noticePsc: string | null;
}

/**
 * Who may hold the work one notice is about, read only once asked for: the
 * read goes to the award source, so the page never makes it by itself. The
 * narrowing to the notice's product service code is part of what is asked,
 * so changing it after an answer asks again.
 */
export function IncumbentsLens({ noticeId, noticePsc }: IncumbentsLensProps) {
  const [samePsc, setSamePsc] = useState(true);
  /** What was asked for, and how many times: null until the first ask, and a new count asks again. */
  const [asked, setAsked] = useState<{ samePsc: boolean; count: number } | null>(null);
  const answer = useResource(
    (signal) =>
      asked === null
        ? Promise.resolve(null)
        : api.getIncumbents(noticeId, { samePsc: asked.samePsc }, { signal }),
    [noticeId, asked?.samePsc, asked?.count],
  );
  return (
    <IncumbentsPanel
      noticePsc={noticePsc}
      incumbents={answer.data}
      samePsc={samePsc}
      onSamePscChange={(next) => {
        setSamePsc(next);
        // An answer is in view: the narrowing changed what it should be.
        if (asked !== null) setAsked({ samePsc: next, count: asked.count + 1 });
      }}
      onAsk={() => setAsked({ samePsc, count: (asked?.count ?? 0) + 1 })}
      loading={asked !== null && answer.loading}
      error={asked === null ? null : answer.error}
    />
  );
}
