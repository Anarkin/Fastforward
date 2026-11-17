import { strings } from '../../../lib/shared/strings';
import { namedItem, type Value } from '../../../lib/shared/sentences';
import { joinedPath } from '../../../lib/page/pathLooks';

export function whatOf(
  items: number,
  name: string | undefined,
  folder?: string,
): Value {
  return items === 1 && name !== undefined
    ? namedItem(joinedPath(folder, name))
    : { text: strings.commander.items(items) };
}
