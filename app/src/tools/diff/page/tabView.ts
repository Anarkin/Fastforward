import { optional, record, text, flag } from '../../../lib/shared/schema';
import { searchSchema } from '../../../lib/shared/searchOptions';
import { focusSchema } from '../../../lib/page/keptFocus';
import { diffPlaceSchema } from '../../../lib/page/diffPlace';

export const diffViewSchema = record({
  find: optional(record({ finding: flag(), search: searchSchema })),
  place: optional(diffPlaceSchema),
  language: optional(text({ max: 256 })),
  focus: optional(focusSchema),
});
