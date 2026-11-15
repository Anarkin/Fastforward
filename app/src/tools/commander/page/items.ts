import { strings } from '../../../lib/shared/strings';
import type { Value } from '../../../lib/shared/sentences';

export function whatOf(items: number, name: string | undefined): Value {
  return items === 1 && name !== undefined
    ? { name }
    : { text: strings.commander.items(items) };
}
