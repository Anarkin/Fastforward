import * as path from 'node:path';
import type { ArchiveAccess, OpenedArchive } from './archives';
import type { Pane } from './sides';

export function archiveItems(
  archives: ArchiveAccess | undefined,
  pane: Pane,
  names: readonly string[],
):
  | {
      readonly archives: ArchiveAccess;
      readonly archive: OpenedArchive;
      readonly inner: readonly string[];
      readonly paths: readonly string[];
      readonly withoutFolders: boolean;
      readonly files: number;
      readonly bytes: number;
      readonly encrypted: boolean;
    }
  | undefined {
  const inside = archives?.within(pane.folder);
  if (archives === undefined || inside === undefined) {
    return undefined;
  }
  const items = names.flatMap((name) => {
    const parts = name.split(path.sep);
    const last = parts.at(-1) ?? name;
    const inner = [...inside.inner, ...parts.slice(0, -1)];
    const item = inside.archive.tree.item(inner, last);
    return item === undefined ? [] : [{ name, inner, last, ...item }];
  });
  if (items.length !== names.length) {
    return undefined;
  }
  return {
    archives,
    archive: inside.archive,
    inner: inside.inner,
    paths: items.map((item) => item.path),
    withoutFolders: pane.flat !== undefined,
    ...inside.archive.tree.totals(
      items.map((item) => ({ inner: item.inner, name: item.last })),
    ),
  };
}
