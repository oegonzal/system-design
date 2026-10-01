import styled from '@emotion/styled';

/**
 * A list of results under filters — prompts, stories. While the rows for a
 * changed filter are on their way (`aria-busy`), the rows on screen dim, so
 * results that may no longer match never read as the answer.
 */
export const ResultList = styled.ul`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[3]}px;
  margin: 0;
  padding: 0;
  list-style: none;
  transition: opacity ${({ theme }) => theme.motion.duration.fast}
    ${({ theme }) => theme.motion.easing.standard};

  &[aria-busy='true'] {
    opacity: 0.6;
  }
`;
