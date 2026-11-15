import { useCallback, useState } from 'react';

type Motion = 'opening' | 'closing' | 'departing';

export const leaving = (motion: Motion | undefined) =>
  motion === 'closing' || motion === 'departing';

interface Placed<T> {
  readonly tab: T;
  readonly motion?: Motion;
}

function placedTabs<T extends { readonly id: string }>(
  before: readonly Placed<T>[],
  tabs: readonly T[],
  visitor?: string,
  departed?: string,
): Placed<T>[] {
  const staying = new Map(
    before.flatMap((placed) =>
      leaving(placed.motion) ? [] : [[placed.tab.id, placed] as const],
    ),
  );
  const placed: Placed<T>[] = tabs.map((tab) => {
    const motion =
      tab.id === visitor
        ? undefined
        : staying.has(tab.id)
          ? staying.get(tab.id)?.motion
          : before.length > 0
            ? 'opening'
            : undefined;
    return motion ? { tab, motion } : { tab };
  });
  const open = new Set(tabs.map((tab) => tab.id));
  let at = 0;
  for (const shown of before) {
    if (open.has(shown.tab.id)) {
      at = placed.findIndex((item) => item.tab.id === shown.tab.id) + 1;
    } else {
      placed.splice(at, 0, {
        tab: shown.tab,
        motion:
          shown.tab.id === departed || shown.motion === 'departing'
            ? 'departing'
            : 'closing',
      });
      at += 1;
    }
  }
  return placed;
}

function settledTab<T extends { readonly id: string }>(
  placed: readonly Placed<T>[],
  id: string,
): Placed<T>[] {
  return placed.flatMap((item) =>
    item.tab.id !== id || item.motion === undefined
      ? [item]
      : leaving(item.motion)
        ? []
        : [{ tab: item.tab }],
  );
}

function sameList<T>(a: readonly T[], b: readonly T[]): boolean {
  return a.length === b.length && a.every((tab, index) => tab === b[index]);
}

export function usePlacedTabs<T extends { readonly id: string }>(
  tabs: readonly T[],
  visitor: string | undefined,
): {
  placed: readonly Placed<T>[];
  settled: (id: string) => void;
} {
  const [state, setState] = useState(() => ({
    tabs,
    visitor,
    placed: placedTabs([], tabs),
  }));
  let placed = state.placed;
  if (!sameList(state.tabs, tabs) || state.visitor !== visitor) {
    placed = placedTabs(
      state.placed,
      tabs,
      visitor,
      state.visitor === visitor ? undefined : state.visitor,
    );
    setState({ tabs, visitor, placed });
  }
  const settled = useCallback(
    (id: string) =>
      setState((current) => ({
        ...current,
        placed: settledTab(current.placed, id),
      })),
    [],
  );
  return { placed, settled };
}
