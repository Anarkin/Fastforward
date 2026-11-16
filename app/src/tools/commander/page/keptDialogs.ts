import type { CommanderSource } from './commanderState';
import { dialogSlots, type Dialogs } from './parkedDialogs';

const withoutSecrets = (dialogs: Dialogs): Dialogs =>
  dialogs.packing?.form === undefined
    ? dialogs
    : {
        ...dialogs,
        packing: {
          ...dialogs.packing,
          form: { ...dialogs.packing.form, password: '' },
        },
      };

const dialogsLength = 256 * 1024;

function whole(dialogs: Dialogs): Dialogs {
  const sized = dialogSlots
    .flatMap((slot) => {
      const dialog = dialogs[slot];
      return dialog === undefined
        ? []
        : [{ slot, dialog, length: JSON.stringify(dialog).length }];
    })
    .toSorted((one, other) => one.length - other.length);
  const kept: Dialogs = {};
  let length = 0;
  for (const { slot, dialog, length: size } of sized) {
    if (length + size <= dialogsLength) {
      length += size;
      Object.assign(kept, { [slot]: dialog });
    }
  }
  return kept;
}

export function dialogsOf(state: CommanderSource, tab: string): Dialogs {
  const dialogs: Dialogs = { ...state.parked.get(tab) };
  for (const slot of dialogSlots) {
    if (state[slot]?.tab === tab) {
      Object.assign(dialogs, { [slot]: state[slot] });
    }
  }
  return whole(withoutSecrets(dialogs));
}
