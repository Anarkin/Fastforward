import * as fs from 'node:fs';
import * as path from 'node:path';
import { strings } from '../../../shared/strings';
import {
  itemsAt,
  type ArchiveAccess,
  type OpenedArchive,
  type Packing,
  type PackOptions,
} from './archives';

export interface ItemsOfArchive {
  readonly archive: OpenedArchive;
  readonly paths: readonly string[];
  readonly depth: number;
  readonly withoutFolders: boolean;
  readonly files: number;
  readonly bytes: number;
}

export async function copiedBetween(
  archives: ArchiveAccess,
  from: ItemsOfArchive,
  into: { readonly archive: OpenedArchive; readonly inner: readonly string[] },
  move: boolean,
  options: PackOptions,
): Promise<Packing> {
  const { signal, onProgress } = options;
  options.onTotals?.({ files: from.files, bytes: from.bytes });
  const extracted = await archives.extract(from.archive, from.paths, {
    withoutFolders: from.withoutFolders,
    ...(signal !== undefined && { signal }),
    ...(onProgress !== undefined && { onProgress }),
  });
  if (extracted.kind === 'refused') {
    if (extracted.needsPassword === true) {
      archives.usePassword(from.archive.file, undefined);
    }
    return {
      kind: 'refused',
      reason: strings.commander.couldNotExtract(extracted.reason),
    };
  }
  try {
    const items = await itemsAt(
      extracted.folder,
      from.withoutFolders ? 0 : from.depth,
    );
    const [first] = items;
    if (first === undefined) {
      return {
        kind: 'refused',
        reason: strings.commander.couldNotExtract(
          strings.commander.nothingTakenOut,
        ),
      };
    }
    const added = await archives.addItems(
      into.archive,
      into.inner,
      path.dirname(first),
      items.map((item) => path.basename(item)),
      options,
    );
    if (!move || added.kind === 'refused') {
      return added;
    }
    if (added.warning !== undefined) {
      return {
        kind: 'packed',
        warning: `${added.warning} ${strings.commander.originalsKept}`,
      };
    }
    const removed = await archives.remove(
      from.archive,
      from.paths,
      signal === undefined ? {} : { signal },
    );
    return removed.kind === 'refused'
      ? {
          kind: 'packed',
          warning: strings.commander.movedOutKept(
            path.basename(from.archive.file),
            removed.reason,
          ),
        }
      : added;
  } finally {
    await fs.promises
      .rm(extracted.folder, { recursive: true, force: true, maxRetries: 3 })
      .catch(() => undefined);
  }
}
