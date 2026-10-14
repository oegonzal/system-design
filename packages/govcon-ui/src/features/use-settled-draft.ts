import { useEffect, useRef, useState } from 'react';

/**
 * A draft over a value its owner writes somewhere slow — the address, say.
 * Every change is echoed at once, so the control never waits on the owner.
 * `settleLater` hands the merged draft on once changes pause, the way typed
 * text or a run of chip presses should reach the owner as one change;
 * `commit` hands it on now, as a select does; `settleNow` — a field left —
 * hands on what is still pending. The echo covers the value until the
 * owner's value next changes after a hand-on, and then gives way to it: the
 * control shows what the owner holds, and an outside change shows through.
 */
export function useSettledDraft<T extends object>(
  value: T,
  onChange: (next: T) => void,
  delayMs: number,
) {
  const [echo, setEcho] = useState<Partial<T> | null>(null);
  /** The owner's value as it stood at the last hand-on; null while nothing was handed on. */
  const [handedOnOver, setHandedOnOver] = useState<string | null>(null);
  const standing = JSON.stringify(value);
  // The owner's value moved after a hand-on: it now says what the echo said, or something newer.
  if (echo !== null && handedOnOver !== null && handedOnOver !== standing) {
    setEcho(null);
    setHandedOnOver(null);
  }

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
    const { value: current, onChange: emit, echo: drafted } = latest.current;
    setHandedOnOver(JSON.stringify(current));
    emit({ ...current, ...drafted, ...patch });
  };
  const drafting = (patch: Partial<T>): void => {
    setEcho((previous) => ({ ...previous, ...patch }));
    setHandedOnOver(null);
    cancel();
  };
  const settleLater = (patch: Partial<T>): void => {
    drafting(patch);
    timer.current = setTimeout(() => {
      timer.current = null;
      handOn(patch);
    }, delayMs);
  };
  const commit = (patch: Partial<T>): void => {
    drafting(patch);
    handOn(patch);
  };
  const settleNow = (): void => {
    if (cancel()) handOn({});
  };
  return {
    shown: echo === null ? value : { ...value, ...echo },
    settleLater,
    commit,
    settleNow,
  };
}
