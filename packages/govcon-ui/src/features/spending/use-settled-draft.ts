import { useEffect, useRef, useState } from 'react';

/**
 * A draft whose typed fields settle before they are handed on, while its
 * chosen fields are handed on at once — for a form whose owner writes the
 * value somewhere slow, such as the address. `type` echoes a keystroke
 * locally and starts the pause; `commit` hands the merged draft on now, as
 * a chip or a select does; `settle` — a field left — hands on what is still
 * pending. The echo covers the value until a commit or a settle, so the
 * owner's normalized spelling never changes the text under the typing.
 */
export function useSettledDraft<T extends object>(
  value: T,
  onChange: (next: T) => void,
  delayMs: number,
) {
  const [echo, setEcho] = useState<Partial<T> | null>(null);
  const latest = useRef({ value, onChange, echo });
  useEffect(() => {
    latest.current = { value, onChange, echo };
  });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancel = (): boolean => {
    if (timer.current === null) return false;
    clearTimeout(timer.current);
    timer.current = null;
    return true;
  };
  // Unmounting hands nothing on: a pause that never ended is dropped.
  useEffect(
    () => () => {
      cancel();
    },
    [],
  );

  const handOn = (patch: Partial<T>): void => {
    const { value: current, onChange: emit, echo: typed } = latest.current;
    emit({ ...current, ...typed, ...patch });
  };
  const type = (patch: Partial<T>): void => {
    setEcho((previous) => ({ ...previous, ...patch }));
    cancel();
    timer.current = setTimeout(() => {
      timer.current = null;
      handOn(patch);
    }, delayMs);
  };
  const commit = (patch: Partial<T>): void => {
    cancel();
    handOn(patch);
    setEcho(null);
  };
  const settle = (): void => {
    if (cancel()) handOn({});
    setEcho(null);
  };
  return { shown: echo === null ? value : { ...value, ...echo }, type, commit, settle };
}
