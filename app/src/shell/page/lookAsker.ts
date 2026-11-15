import { maxLookedPaths } from '../../lib/shared/partLooks';

export function lookAsker(
  ask: (paths: readonly string[]) => void,
): (path: string) => void {
  const asked = new Set<string>();
  let waiting: string[] = [];
  const flush = () => {
    const paths = waiting;
    waiting = [];
    for (let from = 0; from < paths.length; from += maxLookedPaths) {
      ask(paths.slice(from, from + maxLookedPaths));
    }
  };
  return (path) => {
    if (asked.has(path)) {
      return;
    }
    asked.add(path);
    if (waiting.push(path) === 1) {
      queueMicrotask(flush);
    }
  };
}
