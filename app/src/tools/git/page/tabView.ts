import {
  count,
  flag,
  keyed,
  list,
  oneOf,
  optional,
  record,
  text,
  type Infer,
} from '../../../lib/shared/schema';
import { searchSchema } from '../../../lib/shared/searchOptions';
import { focusSchema } from '../../../lib/page/viewFocus';
import { diffPlaceSchema } from '../../../components/diff/page/place';
import { diffViewFields } from '../../../components/diff/page/slice';
import { columnOrder } from './activeColumn';
import { mostWorktrees } from './tabWorktrees';

export const mostPlaces = 20;

export const mostNamed = 1000;

const names = list(text(), { max: mostNamed, whole: true });

export const worktreeViewSchema = record({
  commitsHidden: optional(oneOf([true])),
  column: optional(oneOf(columnOrder)),
  filter: optional(searchSchema),
  commitFilter: optional(searchSchema),
  folders: optional(
    record({ view: optional(text()), open: names, closed: names }),
  ),
  folds: optional(record({ view: text(), searched: text(), closed: names })),
  cursor: optional(
    record({ key: text(), from: optional(text()), view: text() }),
  ),
  pin: optional(record({ hash: text(), byKey: flag() })),
  filesScrolls: optional(keyed(text(), count(), { max: mostPlaces })),
  find: diffViewFields.find,
  focus: optional(focusSchema),
  places: optional(keyed(text(), diffPlaceSchema, { max: mostPlaces })),
  language: optional(record({ key: text(), language: text() })),
});

export type WorktreeView = Infer<typeof worktreeViewSchema>;

export const gitViewSchema = record({
  worktrees: keyed(text(), worktreeViewSchema, { max: mostWorktrees }),
});
