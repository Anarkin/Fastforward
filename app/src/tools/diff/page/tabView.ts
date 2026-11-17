import { optional, record } from '../../../lib/shared/schema';
import { focusSchema } from '../../../lib/page/viewFocus';
import { diffViewFields } from '../../../components/diff/page/slice';

export const compareViewSchema = record({
  ...diffViewFields,
  focus: optional(focusSchema),
});

export function languageKeyOf(tab: string): string {
  return JSON.stringify([tab]);
}
