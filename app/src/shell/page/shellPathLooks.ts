import type { StoreApi } from 'zustand';
import {
  knownWith,
  newlyKnown,
  type PathLooksSource,
} from '../../lib/page/pathLooks';
import type { ShellState } from './shellState';

export function shellPathLooks(store: StoreApi<ShellState>): PathLooksSource {
  return {
    subscribe: (changed) => store.subscribe(changed),
    fileColors: () => store.getState().fileColors,
    known: () => store.getState().partLooks,
    ask: (path) => store.getState().askLooks(path),
    know: (path, looks) => {
      const known = store.getState().partLooks;
      if (newlyKnown(known, path, looks)) {
        store.setState({
          partLooks: knownWith(known, [{ path, parts: looks }]),
        });
      }
    },
  };
}
