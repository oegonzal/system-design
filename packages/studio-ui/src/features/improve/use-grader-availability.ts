'use client';

import { useEffect, useState } from 'react';

import { api } from '../../api/client';
import { CHECKING, reachable, UNREACHABLE, type GraderAvailability } from './grader-availability';

/**
 * Whether the grader — and so the coach — can run at all, asked once on
 * mount. A booted loop always has a model; a 503 (or no answer) is
 * "unreachable".
 */
export function useGraderAvailability(): GraderAvailability {
  const [availability, setAvailability] = useState<GraderAvailability>(CHECKING);

  useEffect(() => {
    let disposed = false;
    void api
      .gradingAvailability()
      .then((report) => {
        if (!disposed) setAvailability(reachable(report));
      })
      .catch(() => {
        if (!disposed) setAvailability(UNREACHABLE);
      });
    return () => {
      disposed = true;
    };
  }, []);

  return availability;
}
