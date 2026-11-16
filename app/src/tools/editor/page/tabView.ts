import {
  flag,
  oneOf,
  optional,
  record,
  text,
} from '../../../lib/shared/schema';
import { focusSchema, typedSchema } from '../../../lib/page/keptFocus';
import { searchOptionsSchema } from '../../../lib/shared/searchOptions';
import { textEncodings } from '../../../lib/shared/textEncodings';

export const editorViewSchema = record({
  finding: optional(flag()),
  replacing: optional(flag()),
  query: optional(record({ text: text(), options: searchOptionsSchema })),
  replacement: optional(text()),
  focus: optional(focusSchema),
  goingToLine: optional(typedSchema),
  reopening: optional(oneOf(['auto', ...textEncodings])),
  language: optional(text()),
});
