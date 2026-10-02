'use client';

import styled from '@emotion/styled';

/**
 * A one-column page's reading measure, centred inside the frame. The frame is
 * sized for the widest page; a page narrower than that says so here rather
 * than by constraining everything else.
 */
export const Measure = styled.div`
  width: 100%;
  max-width: 1100px;
  margin: 0 auto;
`;
