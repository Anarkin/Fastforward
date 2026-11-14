import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  ArchiveItem,
  ArchiveListing,
  ArchiveReader,
} from '../../../../../tools/commander/main/archives';

export function item(
  itemPath: string,
  more: Partial<ArchiveItem> = {},
): ArchiveItem {
  return {
    path: itemPath,
    folder: false,
    size: 1,
    modified: 5,
    hiddenAttribute: false,
    link: false,
    encrypted: false,
    ...more,
  };
}

export const notPacked = () =>
  Promise.reject(new Error('Nothing is packed here.'));

export function readerOf(listings: Record<string, ArchiveListing>) {
  const asked: string[] = [];
  const reader: ArchiveReader = {
    pack: notPacked,
    test: notPacked,
    rename: notPacked,
    add: notPacked,
    remove: notPacked,
    list: (file) => {
      asked.push(`list ${path.basename(file)}`);
      return Promise.resolve(
        listings[path.basename(file)] ?? { kind: 'refused', reason: 'no' },
      );
    },
    extract: async (file, paths, into) => {
      asked.push(`extract ${path.basename(file)} ${paths.join(' ')}`);
      for (const each of paths) {
        await fs.promises.writeFile(path.join(into, each), each);
      }
      return undefined;
    },
  };
  return { reader, asked };
}
