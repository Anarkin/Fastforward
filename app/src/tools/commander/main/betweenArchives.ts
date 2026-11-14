import * as fs from 'node:fs';
import * as path from 'node:path';
import { sentencesOf, strings } from '../../../lib/shared/strings';
import { movedOut, presentIn } from './unpacking';
import { itemsAt } from './archiveFiles';
import type {
  ArchiveAccess,
  OpenedArchive,
  Packing,
  PackOptions,
} from './archives';
import type { ArchiveBranch } from './archiveTree';

export interface ItemsOfArchive {
  readonly archive: OpenedArchive;
  readonly paths: readonly string[];
  readonly depth: number;
  readonly withoutFolders: boolean;
  readonly files: number;
  readonly bytes: number;
  readonly roots: readonly ArchiveBranch[];
  readonly platform: NodeJS.Platform;
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
        warning: sentencesOf([added.warning, strings.commander.originalsKept]),
      };
    }
    const name = path.basename(from.archive.file);
    const { paths: moved, unmatched } = movedOut(
      from.roots,
      await presentIn(extracted.folder, from.platform),
      new Set(),
      from.withoutFolders,
      from.platform,
    );
    const kept =
      unmatched > 0
        ? strings.commander.keptUnmatched(name, unmatched)
        : undefined;
    if (moved.length === 0) {
      return kept === undefined ? added : { kind: 'packed', warning: kept };
    }
    const removed = await archives.remove(
      from.archive,
      moved,
      signal === undefined ? {} : { signal },
    );
    if (removed.kind === 'refused') {
      return {
        kind: 'packed',
        warning: strings.commander.movedOutKept(name, removed.reason),
      };
    }
    return kept === undefined ? added : { kind: 'packed', warning: kept };
  } finally {
    await fs.promises
      .rm(extracted.folder, { recursive: true, force: true, maxRetries: 3 })
      .catch(() => undefined);
  }
}
