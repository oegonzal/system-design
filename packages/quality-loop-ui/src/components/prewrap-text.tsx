import styled from '@emotion/styled';
import { Heading, Stack } from '@sysdesign/design-system';

const Pre = styled.pre`
  margin: 0;
  padding: ${({ theme }) => theme.space[4]}px;
  max-height: 32rem;
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-family: ${({ theme }) => theme.font.family.mono};
  font-size: ${({ theme }) => theme.font.size.sm};
  line-height: 1.5;
  color: ${({ theme }) => theme.color.text.primary};
  background: ${({ theme }) => theme.color.bg.subtle};
  border: 1px solid ${({ theme }) => theme.color.border.subtle};
  border-radius: ${({ theme }) => theme.radius.sm};
`;

export interface PrewrapTextProps {
  label: string;
  text: string;
}

/**
 * Markdown and rendered artifacts shown as they are: no markdown renderer,
 * so the `[component.2]` ids a finding points at stay visible verbatim.
 */
export function PrewrapText({ label, text }: PrewrapTextProps) {
  return (
    <Stack gap={2}>
      <Heading level={3}>{label}</Heading>
      <Pre aria-label={label}>{text}</Pre>
    </Stack>
  );
}
