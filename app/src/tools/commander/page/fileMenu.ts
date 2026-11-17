import { editsImage, type MenuTarget } from '../../../lib/page/fileMenu';
import { parentFolder } from '../shared/protocol';
import type { Row } from './listing';
import { pointedKeys } from './rowKeys';

export function menuTargetOf(
  rows: readonly Row[],
  key: string | undefined,
  marked: ReadonlySet<string> | undefined,
  inRepository: boolean,
): MenuTarget | undefined {
  if (key === undefined || key === parentFolder) {
    return { kind: 'folder', inRepository };
  }
  const names = pointedKeys(rows, key, marked);
  const [only] = names;
  if (only === undefined) {
    return undefined;
  }
  const row =
    names.length === 1 ? rows.find((each) => each.key === only) : undefined;
  if (row?.entry?.folder === true) {
    return {
      kind: 'folder',
      name: only,
      inRepository: row.repository || inRepository,
    };
  }
  if (row !== undefined) {
    return { kind: 'file', name: only, image: editsImage(only) };
  }
  return { kind: 'items', names };
}
