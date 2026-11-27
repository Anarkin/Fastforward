import {
  count,
  list,
  optional,
  record,
  text,
} from '../../../lib/shared/schema';
import { typedSchema } from '../../../lib/page/viewFocus';

export const canvasViewSchema = record({
  origin: optional(record({ column: count(), row: count() })),
  zoom: optional(count({ min: -1000, max: 1000, integer: true })),
  selected: optional(list(text({ max: 256 }), { max: 10_000 })),
  typing: optional(
    record({
      id: text({ max: 256 }),
      anchor: count({ min: 0, integer: true }),
      head: count({ min: 0, integer: true }),
    }),
  ),
  coloring: optional(
    record({
      nodes: list(text({ max: 256 }), { max: 10_000 }),
      edges: list(text({ max: 256 }), { max: 10_000 }),
      typed: optional(typedSchema),
    }),
  ),
});
