import {
  count,
  flag,
  keyed,
  list,
  never,
  oneOf,
  optional,
  record,
  text,
  type Infer,
} from '../../../lib/shared/schema';
import { focusSchema, typedSchema } from '../../../lib/page/viewFocus';
import { searchOptionsSchema } from '../../../lib/shared/searchOptions';
import { packFormats, packLevels, zipCiphers } from '../shared/packing';
import { sides } from '../shared/sides';
import { layouts } from './layouts';

const side = oneOf(sides);

const names = list(text(), { whole: true });

const placed = { side, folder: text() };

const prompted = { ...placed, typed: optional(typedSchema) };

const formSchema = record({
  format: oneOf(packFormats),
  archive: text(),
  level: oneOf(packLevels),
  password: never<string>(),
  shown: optional(flag()),
  encryptNames: optional(flag()),
  zipCipher: oneOf(zipCiphers),
  splitting: optional(flag()),
  testing: optional(flag()),
  volume: text(),
});

const dialogsSchema = record({
  deleting: optional(
    record({
      ...placed,
      names,
      permanently: flag(),
      binOff: optional(oneOf([true])),
      archive: optional(text()),
    }),
  ),
  transferring: optional(
    record({
      ...placed,
      names,
      target: text(),
      move: flag(),
      existing: optional(names),
    }),
  ),
  makingFolder: optional(record(prompted)),
  makingFile: optional(record(prompted)),
  goingTo: optional(record(prompted)),
  renaming: optional(record({ ...prompted, name: text() })),
  copyingAs: optional(record({ ...prompted, name: text(), target: text() })),
  markingPattern: optional(
    record({ ...prompted, mark: flag(), initial: text() }),
  ),
  packing: optional(
    record({ ...placed, names, target: text(), form: optional(formSchema) }),
  ),
});

const marksSchema = record({
  folder: text(),
  selected: optional(text()),
  marked: optional(list(text())),
});

const filterSchema = record({
  folder: optional(text()),
  query: text(),
  options: searchOptionsSchema,
});

export const commanderViewSchema = record({
  active: optional(side),
  share: optional(count({ min: Number.MIN_VALUE, max: 1 - Number.EPSILON })),
  focus: optional(focusSchema),
  layouts: optional(
    record({
      left: optional(oneOf(layouts)),
      right: optional(oneOf(layouts)),
    }),
  ),
  panes: optional(
    record({ left: optional(marksSchema), right: optional(marksSchema) }),
  ),
  filters: optional(
    record({ left: optional(filterSchema), right: optional(filterSchema) }),
  ),
  scrolls: optional(keyed(text(), count({ min: 0 }))),
  dialogs: optional(dialogsSchema),
});

export type SidesView = Infer<typeof commanderViewSchema>;

export type KeptDialogs = Infer<typeof dialogsSchema>;
