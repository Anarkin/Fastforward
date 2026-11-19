import { useLayoutEffect, useRef } from 'react';

export type RowKey = string | number | bigint;

export type RowSlots = ReadonlyMap<RowKey, number>;

const noSlots: RowSlots = new Map();

export function nextSlots(
  previous: RowSlots,
  keys: readonly RowKey[],
): RowSlots {
  const kept = keys.some((key) => previous.has(key));
  const left = kept ? [] : [...previous.values()];
  let fresh = Math.max(-1, ...previous.values()) + 1;
  return new Map(
    keys.map((key, index) => [
      key,
      (kept ? previous.get(key) : left[index]) ?? fresh++,
    ]),
  );
}

export function useRowSlots(): (keys: readonly RowKey[]) => RowSlots {
  const committed = useRef(noSlots);
  const last = useRef(noSlots);
  useLayoutEffect(() => {
    committed.current = last.current;
  });
  return (keys) => {
    const slots = nextSlots(committed.current, keys);
    last.current = slots;
    return slots;
  };
}
