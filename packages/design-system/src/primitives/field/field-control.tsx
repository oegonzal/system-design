import styled from '@emotion/styled';

/**
 * The one look every form field shares: a stacked label over a control that
 * reads only semantic theme roles. Internal to the field primitives; each
 * public field composes these.
 */

export const FieldRoot = styled.label`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[2]}px;
  font-family: ${({ theme }) => theme.font.family.base};
`;

export const FieldLabel = styled.span`
  font-size: ${({ theme }) => theme.font.size.sm};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.text.secondary};
`;

/** The one control recipe every field shares. */
const controlCss = `
  width: 100%;
  box-sizing: border-box;
  font: inherit;
`;

export const Input = styled.input`
  ${controlCss}
  padding: ${({ theme }) => `${theme.space[3]}px ${theme.space[4]}px`};
  font-size: ${({ theme }) => theme.font.size.md};
  color: ${({ theme }) => theme.color.text.primary};
  background: ${({ theme }) => theme.color.bg.surface};
  border: 1px solid ${({ theme }) => theme.color.border.default};
  border-radius: ${({ theme }) => theme.radius.sm};

  &::placeholder {
    color: ${({ theme }) => theme.color.text.muted};
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.border.focus};
    outline-offset: 1px;
  }

  &:disabled {
    background: ${({ theme }) => theme.color.bg.subtle};
    cursor: not-allowed;
  }
`;

export const Area = Input.withComponent('textarea');
export const SelectControl = Input.withComponent('select');

export const CheckboxRoot = styled.label`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]}px;
  font-family: ${({ theme }) => theme.font.family.base};
  font-size: ${({ theme }) => theme.font.size.md};
  color: ${({ theme }) => theme.color.text.primary};
  cursor: pointer;
`;

export const CheckboxInput = styled.input`
  width: 15px;
  height: 15px;
  margin: 0;
  accent-color: ${({ theme }) => theme.color.accent.default};

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.border.focus};
    outline-offset: 1px;
  }
`;
