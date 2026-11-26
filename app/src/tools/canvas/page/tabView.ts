import { count, optional, record } from '../../../lib/shared/schema';

export const canvasViewSchema = record({
  origin: optional(record({ column: count(), row: count() })),
});
