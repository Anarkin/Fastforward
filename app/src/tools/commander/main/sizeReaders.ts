import * as fs from 'node:fs';
import * as path from 'node:path';
import type { load } from 'koffi';
import type { SizeRead } from './folderSizes';
import {
  backupSemantics,
  closeHandleSignature,
  createFileSignature,
  directoryAttribute,
  eachOnPage,
  fullDirectoryInformation,
  invalidHandle,
  isLink,
  listDirectory,
  nameAt,
  noMoreFiles,
  noSuchFile,
  openExisting,
  pageSize,
  queryDirectorySignature,
  record,
  shareAll,
} from './windowsDirectory';

export type FolderReader = (folder: string) => SizeRead | undefined;

function statsOf(file: string): fs.Stats | undefined {
  try {
    return fs.lstatSync(file);
  } catch {
    return undefined;
  }
}

export function nodeSizeReader(): FolderReader {
  return (folder) => {
    let found: fs.Dirent[];
    try {
      found = fs.readdirSync(folder, { withFileTypes: true });
    } catch {
      return undefined;
    }
    let bytes = 0;
    const folders: string[] = [];
    for (const each of found) {
      const inside = path.join(folder, each.name);
      if (each.isDirectory()) {
        folders.push(inside);
      } else if (!each.isSymbolicLink()) {
        const stats = statsOf(inside);
        if (stats?.isDirectory() === true) {
          folders.push(inside);
        } else if (stats !== undefined && !stats.isSymbolicLink()) {
          bytes += stats.size;
        }
      }
    }
    return { bytes, folders };
  };
}

export function windowsSizeReader(koffi: {
  readonly load: typeof load;
}): FolderReader {
  const kernel32 = koffi.load('kernel32.dll');
  const ntdll = koffi.load('ntdll.dll');
  const createFile = kernel32.func(createFileSignature);
  const closeHandle = kernel32.func(closeHandleSignature);
  const queryDirectory = ntdll.func(queryDirectorySignature);
  const status = Buffer.alloc(16);
  const page = Buffer.alloc(pageSize);
  return (folder) => {
    const handle: unknown = createFile(
      path.toNamespacedPath(folder),
      listDirectory,
      shareAll,
      null,
      openExisting,
      backupSemantics,
      null,
    );
    if (handle === null || handle === invalidHandle) {
      return undefined;
    }
    try {
      let bytes = 0;
      const folders: string[] = [];
      for (let restart = true; ; restart = false) {
        const result = Number(
          queryDirectory(
            handle,
            null,
            null,
            null,
            status,
            page,
            page.length,
            fullDirectoryInformation,
            false,
            null,
            restart,
          ),
        );
        if (result === noMoreFiles || result === noSuchFile) {
          return { bytes, folders };
        }
        if (result < 0) {
          return undefined;
        }
        eachOnPage(page, (start) => {
          const attributes = page.readUInt32LE(start + record.attributes);
          if (
            isLink(attributes, page.readUInt32LE(start + record.reparseTag))
          ) {
            return;
          }
          if ((attributes & directoryAttribute) !== 0) {
            folders.push(path.join(folder, nameAt(page, start)));
          } else {
            bytes += Number(page.readBigUInt64LE(start + record.size));
          }
        });
      }
    } finally {
      closeHandle(handle);
    }
  };
}
