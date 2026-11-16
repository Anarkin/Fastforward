import { packFormats, packLevels, zipCiphers } from '../shared/packing';
import { sides, type Side } from '../shared/sides';
import type { CommanderSource, PackForm } from './commanderState';
import {
  fieldsOf,
  flagOf,
  keptTypedOf,
  listOf,
  oneOf,
  textOf,
  type Fields,
} from './keptFields';
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

export function dialogsOf(state: CommanderSource, tab: string): Dialogs {
  const dialogs: Dialogs = { ...state.parked.get(tab) };
  for (const slot of dialogSlots) {
    if (state[slot]?.tab === tab) {
      Object.assign(dialogs, { [slot]: state[slot] });
    }
  }
  return withoutSecrets(dialogs);
}

function formOf(value: unknown): PackForm | undefined {
  const fields = fieldsOf(value);
  const format = oneOf(packFormats, fields?.('format'));
  const archive = textOf(fields?.('archive'));
  const level = oneOf(packLevels, fields?.('level'));
  const zipCipher = oneOf(zipCiphers, fields?.('zipCipher'));
  const volume = textOf(fields?.('volume'));
  return fields === undefined ||
    format === undefined ||
    archive === undefined ||
    level === undefined ||
    zipCipher === undefined ||
    volume === undefined
    ? undefined
    : {
        format,
        archive,
        level,
        password: '',
        shown: flagOf(fields('shown')) === true,
        encryptNames: flagOf(fields('encryptNames')) === true,
        zipCipher,
        splitting: flagOf(fields('splitting')) === true,
        testing: flagOf(fields('testing')) !== false,
        volume,
      };
}

interface Placed {
  readonly tab: string;
  readonly side: Side;
  readonly folder: string;
}

const names = (fields: Fields) => listOf(fields('names'), textOf);

export function dialogsDecoded(tab: string, value: unknown): Dialogs {
  const all = fieldsOf(value);
  const placed = (slot: string): [Fields, Placed] | undefined => {
    const fields = fieldsOf(all?.(slot));
    const side = oneOf(sides, fields?.('side'));
    const folder = textOf(fields?.('folder'));
    return fields === undefined || side === undefined || folder === undefined
      ? undefined
      : [fields, { tab, side, folder }];
  };
  const prompt = (slot: string) => {
    const found = placed(slot);
    if (found === undefined) {
      return undefined;
    }
    const [fields, place] = found;
    const typed = keptTypedOf(fields('typed'));
    return { fields, place: typed === undefined ? place : { ...place, typed } };
  };
  const dialogs: {
    -readonly [K in keyof Dialogs]: Dialogs[K];
  } = {};
  const deleting = placed('deleting');
  const deleted = deleting && names(deleting[0]);
  const permanently = deleting && flagOf(deleting[0]('permanently'));
  if (deleting && deleted && permanently !== undefined) {
    const archive = textOf(deleting[0]('archive'));
    dialogs.deleting = {
      ...deleting[1],
      names: deleted,
      permanently,
      ...(flagOf(deleting[0]('binOff')) === true && { binOff: true }),
      ...(archive !== undefined && { archive }),
    };
  }
  const transferring = placed('transferring');
  const moved = transferring && names(transferring[0]);
  const target = transferring && textOf(transferring[0]('target'));
  const move = transferring && flagOf(transferring[0]('move'));
  if (transferring && moved && target !== undefined && move !== undefined) {
    const existing = listOf(transferring[0]('existing'), textOf);
    dialogs.transferring = {
      ...transferring[1],
      names: moved,
      target,
      move,
      ...(existing !== undefined && { existing }),
    };
  }
  const makingFolder = prompt('makingFolder')?.place;
  if (makingFolder !== undefined) {
    dialogs.makingFolder = makingFolder;
  }
  const makingFile = prompt('makingFile')?.place;
  if (makingFile !== undefined) {
    dialogs.makingFile = makingFile;
  }
  const goingTo = prompt('goingTo')?.place;
  if (goingTo !== undefined) {
    dialogs.goingTo = goingTo;
  }
  const renaming = prompt('renaming');
  const renamed = renaming && textOf(renaming.fields('name'));
  if (renaming && renamed !== undefined) {
    dialogs.renaming = { ...renaming.place, name: renamed };
  }
  const marking = prompt('markingPattern');
  const mark = marking && flagOf(marking.fields('mark'));
  const initial = marking && textOf(marking.fields('initial'));
  if (marking && mark !== undefined && initial !== undefined) {
    dialogs.markingPattern = { ...marking.place, mark, initial };
  }
  const packing = placed('packing');
  const packed = packing && names(packing[0]);
  const into = packing && textOf(packing[0]('target'));
  if (packing && packed && into !== undefined) {
    const form = formOf(packing[0]('form'));
    dialogs.packing = {
      ...packing[1],
      names: packed,
      target: into,
      ...(form !== undefined && { form }),
    };
  }
  return dialogs;
}
