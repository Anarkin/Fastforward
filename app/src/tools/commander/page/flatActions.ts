import { type CommanderToWebviewOf } from '../shared/protocol';
import { plainSearch } from '../../../lib/shared/searchOptions';
import { sides } from '../shared/sides';
import type { CommanderActions } from './commanderState';
import type { StoreParts } from './dialogActions';
import {
  FlatLists,
  flatPanesOf,
  type FlatTiming,
  type FlatWorker,
} from './flatLists';
import { filterKey, filterOf } from './sideFilters';
import { reduceView } from './view';

export function startFlatWorker(): FlatWorker {
  return new Worker(new URL('flatWorker.js', location.href), {
    type: 'module',
  });
}

export interface FlatOptions {
  readonly worker: () => FlatWorker;
  readonly timing?: FlatTiming;
}

type FlatActions = Pick<CommanderActions, 'flat' | 'stopReading'>;

export function flatActions(
  { set, get, post, onTab }: StoreParts,
  flatOptions: FlatOptions,
): {
  readonly actions: FlatActions;
  readonly heard: (message: CommanderToWebviewOf<'flatFiles'>) => void;
  readonly reconcile: () => void;
} {
  const flats = new FlatLists(
    flatOptions.worker,
    () => reconcileFlats(),
    flatOptions.timing,
  );
  const reconcileFlats = () => {
    const state = get();
    const { view } = state;
    const live = flatPanesOf(view);
    for (const pane of flats.panes()) {
      if (!live.has(pane)) {
        flats.drop(pane);
      }
    }
    const { tab, panes } = view;
    if (tab === undefined) {
      return;
    }
    for (const side of sides) {
      const pane = panes[side];
      const flat = pane?.flat;
      if (pane === undefined || flat === undefined) {
        continue;
      }
      const key = filterKey(tab, side);
      flats.ensure(key, flat.walk, pane.parent, {
        sort: pane.sort,
        showHidden: view.showHidden,
        fileColors: view.fileColors,
        query: filterOf(state, side)?.query ?? '',
        options: filterOf(state, side)?.options ?? plainSearch,
      });
      const built = flats.built(key, flat.walk);
      if (
        built !== undefined &&
        (built.rows !== pane.rows || built.shown !== flat.shown)
      ) {
        set((now) => ({
          view: reduceView(now.view, {
            type: 'flatRows',
            tab,
            side,
            walk: flat.walk,
            rows: built.rows,
            shown: built.shown,
            complete: built.complete,
          }),
        }));
      }
    }
  };
  return {
    heard: (message) => {
      const { tab, panes } = get().view;
      const pane = panes[message.side];
      if (
        tab === message.tab &&
        pane?.flat?.walk === message.walk &&
        pane.folder === message.folder
      ) {
        flats.files(
          filterKey(message.tab, message.side),
          message.walk,
          message.folders,
        );
      }
    },
    reconcile: reconcileFlats,
    actions: {
      flat: (side) =>
        onTab((tab) =>
          post({
            type: 'flat',
            tab,
            side,
            flat: get().view.panes[side]?.flat === undefined,
          }),
        ),
      stopReading: (side) =>
        onTab((tab) => post({ type: 'stopReading', tab, side })),
    },
  };
}
