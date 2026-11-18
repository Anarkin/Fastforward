import type { Sideways } from './overflow';

export interface SidewaysShown {
  readonly read: () => Sideways | undefined;
  readonly subscribe: (changed: () => void) => () => void;
  readonly set: (view: Sideways | undefined) => void;
}

export function sidewaysShown(first?: Sideways): SidewaysShown {
  let view = first;
  const listeners = new Set<() => void>();
  return {
    read: () => view,
    subscribe: (changed) => {
      listeners.add(changed);
      return () => {
        listeners.delete(changed);
      };
    },
    set: (next) => {
      if (next === view) {
        return;
      }
      view = next;
      for (const changed of listeners) {
        changed();
      }
    },
  };
}
