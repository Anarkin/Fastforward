import { otherSide, type Side } from '../shared/sides';
import type { CommanderSource, ParkedDialogs } from './commanderState';
import type { CommanderView } from './view';

export const dialogSlots = [
  'deleting',
  'transferring',
  'makingFolder',
  'makingFile',
  'renaming',
  'goingTo',
  'markingPattern',
  'packing',
] as const;

type DialogSlot = (typeof dialogSlots)[number];

export type Dialogs = ParkedDialogs;

type Parking = { -readonly [K in DialogSlot]?: CommanderSource[K] };

interface Placed {
  readonly tab: string;
  readonly side: Side;
  readonly folder: string;
  readonly target?: string;
}

function gone(view: CommanderView, dialog: Placed, targeted: boolean) {
  const pane = view.panes[dialog.side];
  const other = view.panes[otherSide(dialog.side)];
  return (
    (pane !== undefined && pane.folder !== dialog.folder) ||
    (targeted && other !== undefined && other.folder !== dialog.target)
  );
}

export function settledDialogs(
  state: CommanderSource,
): Partial<CommanderSource> | undefined {
  const { view } = state;
  const back: Dialogs =
    view.tab === undefined ? {} : (state.parked.get(view.tab) ?? {});
  const parkings = new Map<string, Parking>();
  const parkingOf = (tab: string) => {
    const known = parkings.get(tab);
    if (known !== undefined) {
      return known;
    }
    const made: Parking = { ...state.parked.get(tab) };
    parkings.set(tab, made);
    return made;
  };
  const settle = <D extends Placed>(
    shown: D | undefined,
    parked: D | undefined,
    park: (parking: Parking, dialog: D) => void,
    targeted = false,
  ): D | undefined => {
    const dialog = shown ?? parked;
    if (dialog === undefined) {
      return undefined;
    }
    if (dialog.tab !== view.tab) {
      park(parkingOf(dialog.tab), dialog);
      return undefined;
    }
    return gone(view, dialog, targeted) ? undefined : dialog;
  };
  const settled: Dialogs = {
    deleting: settle(state.deleting, back.deleting, (parking, dialog) => {
      parking.deleting = dialog;
    }),
    transferring: settle(
      state.transferring,
      back.transferring,
      (parking, dialog) => {
        parking.transferring = dialog;
      },
      true,
    ),
    makingFolder: settle(
      state.makingFolder,
      back.makingFolder,
      (parking, dialog) => {
        parking.makingFolder = dialog;
      },
    ),
    makingFile: settle(state.makingFile, back.makingFile, (parking, dialog) => {
      parking.makingFile = dialog;
    }),
    renaming: settle(state.renaming, back.renaming, (parking, dialog) => {
      parking.renaming = dialog;
    }),
    goingTo: settle(state.goingTo, back.goingTo, (parking, dialog) => {
      parking.goingTo = dialog;
    }),
    markingPattern: settle(
      state.markingPattern,
      back.markingPattern,
      (parking, dialog) => {
        parking.markingPattern = dialog;
      },
    ),
    packing: settle(state.packing, back.packing, (parking, dialog) => {
      parking.packing = dialog;
    }),
  };
  const unchanged =
    dialogSlots.every((slot) => settled[slot] === state[slot]) &&
    parkings.size === 0 &&
    (view.tab === undefined || !state.parked.has(view.tab));
  if (unchanged) {
    return undefined;
  }
  const parked = new Map(state.parked);
  if (view.tab !== undefined) {
    parked.delete(view.tab);
  }
  for (const [tab, parking] of parkings) {
    parked.set(tab, parking);
  }
  return { ...settled, parked };
}

export function withoutParked(
  parked: CommanderSource['parked'],
  tab: string,
): CommanderSource['parked'] {
  if (!parked.has(tab)) {
    return parked;
  }
  const left = new Map(parked);
  left.delete(tab);
  return left;
}
