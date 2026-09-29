import type { Direction } from '../shared/protocol';

export interface Navigation {
  readonly back: readonly string[];
  readonly forward: readonly string[];
}

export const noNavigation: Navigation = { back: [], forward: [] };

const maxSteps = 100;

export function visit(
  navigation: Navigation,
  from: string | undefined,
  to: string,
  replace = false,
): Navigation {
  if (from === to) {
    return navigation;
  }
  if (replace || from === undefined) {
    return navigation.forward.length === 0
      ? navigation
      : { back: navigation.back, forward: [] };
  }
  return { back: [...navigation.back, from].slice(-maxSteps), forward: [] };
}

export function reachable(
  steps: readonly string[],
  current: string | undefined,
  exists: (hash: string) => boolean,
): string[] {
  const kept = steps.filter(exists);
  return kept.filter(
    (hash, index) =>
      hash !== (index === kept.length - 1 ? current : kept[index + 1]),
  );
}

export function step(
  navigation: Navigation,
  current: string | undefined,
  direction: Direction,
  steps: number,
  exists: (hash: string) => boolean,
): { navigation: Navigation; target: string } | undefined {
  const back = reachable(navigation.back, current, exists);
  const forward = reachable(navigation.forward, current, exists);
  const [from, to] = direction === 'back' ? [back, forward] : [forward, back];
  const count = Math.min(Math.max(1, steps), from.length);
  if (count === 0) {
    return undefined;
  }
  const passed = from.slice(-count);
  const [target] = passed;
  const rest = from.slice(0, -count);
  const other = [
    ...to,
    ...(current === undefined ? [] : [current]),
    ...passed.slice(1).toReversed(),
  ];
  return {
    navigation:
      direction === 'back'
        ? { back: rest, forward: other }
        : { back: other, forward: rest },
    target,
  };
}
