import {
  count,
  flag,
  oneOf,
  optional,
  record,
  text,
} from '../../../lib/shared/schema';
import { focusSchema } from '../../../lib/page/viewFocus';
import { textEncodings } from '../../../components/encodings/shared/textEncodings';
import { searchSchema } from '../../../lib/shared/searchOptions';
import { mostKeptText } from './tabSelection';

const offset = count();

const place = record({
  start: count({ min: 0, integer: true }),
  char: count({ min: 0, integer: true }),
});

const choicesSchema = record({
  mode: optional(oneOf(['text', 'hex', 'preview'])),
  encoding: optional(oneOf(['auto', 'bytes', ...textEncodings])),
  language: optional(text()),
});

export const viewerViewSchema = record({
  choices: optional(choicesSchema),
  place: optional(count({ min: 0, integer: true })),
  finding: optional(flag()),
  search: optional(searchSchema),
  current: optional(count({ min: 0, integer: true })),
  focus: optional(focusSchema),
  sideways: optional(record({ body: text(), left: offset, column: offset })),
  preview: optional(
    record({
      top: offset,
      left: offset,
      block: optional(count({ min: 0, integer: true })),
      offset,
    }),
  ),
  pdfFind: optional(
    record({
      search: searchSchema,
      current: count({ min: 0, integer: true }),
    }),
  ),
  markdownFind: optional(
    record({
      search: searchSchema,
      current: count({ min: 0, integer: true }),
    }),
  ),
  selected: optional(
    record({
      body: text(),
      version: optional(text()),
      anchor: place,
      focus: place,
      text: text({ max: mostKeptText }),
    }),
  ),
});
