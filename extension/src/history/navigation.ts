import type { Direction } from '../shared/protocol';

// A tab's history of the commits it showed, like a browser's back and forward;
// in both lists the last one is the nearest
export interface Navigation {
  readonly back: readonly string[];
  readonly forward: readonly string[];
}

export const noNavigation: Navigation = { back: [], forward: [] };

// Older steps are forgotten, like a browser does eventually
const maxSteps = 100;

// Going from one commit to another, which the back button returns from; a
// replaced step, like moving through the list with the arrow keys, doesn't
// add one; either way the steps forward are gone, as in a browser
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

// Steps back or forward, several at once from the history's dropdown; steps
// whose commit is gone, like after a rebase, are skipped and forgotten
export function step(
  navigation: Navigation,
  current: string | undefined,
  direction: Direction,
  steps: number,
  exists: (hash: string) => boolean,
): { navigation: Navigation; target: string } | undefined {
  const back = navigation.back.filter(exists);
  const forward = navigation.forward.filter(exists);
  const [from, to] = direction === 'back' ? [back, forward] : [forward, back];
  const count = Math.min(Math.max(1, steps), from.length);
  if (count === 0) {
    return undefined;
  }
  // The steps passed, farthest first; the others go to the other side,
  // nearest last
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
