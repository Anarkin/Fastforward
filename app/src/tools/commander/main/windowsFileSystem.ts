import * as fs from 'node:fs';
import * as path from 'node:path';
import koffi, { type LibraryHandle } from 'koffi';
import type { Entry } from '../shared/protocol';
import type { LocalFileSystem } from './fileSystem';
import {
  backupSemantics,
  closeHandleSignature,
  createFileSignature,
  directoryAttribute,
  eachOnPage,
  fullDirectoryInformation,
  hiddenAttribute,
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

const invalidAttributes = 0xffff_ffff;
const cloudAttributes = 0x1000 | 0x4_0000 | 0x40_0000;

const unixEpochInFileTime = 116_444_736_000_000_000n;
const fileTimeTicksPerMilli = 10_000n;

interface Found {
  readonly name: string;
  readonly attributes: number;
  readonly reparseTag: number;
  readonly size: number;
  readonly modified: number;
}

function foundAt(page: Buffer, start: number): Found {
  return {
    name: nameAt(page, start),
    attributes: page.readUInt32LE(start + record.attributes),
    reparseTag: page.readUInt32LE(start + record.reparseTag),
    size: Number(page.readBigUInt64LE(start + record.size)),
    modified: Number(
      (page.readBigUInt64LE(start + record.modified) - unixEpochInFileTime) /
        fileTimeTicksPerMilli,
    ),
  };
}

function foundOnPage(page: Buffer): Found[] {
  const found: Found[] = [];
  eachOnPage(page, (start) => found.push(foundAt(page, start)));
  return found;
}

async function targetOf(file: string): Promise<fs.Stats | undefined> {
  try {
    return await fs.promises.stat(file);
  } catch {
    return undefined;
  }
}

async function entryOf(folder: string, found: Found): Promise<Entry> {
  const isFolder = (found.attributes & directoryAttribute) !== 0;
  const link = isLink(found.attributes, found.reparseTag);
  const hidden = (found.attributes & hiddenAttribute) !== 0;
  const online = (found.attributes & cloudAttributes) !== 0;
  if (!link) {
    return {
      name: found.name,
      folder: isFolder,
      link,
      hidden,
      size: isFolder ? undefined : found.size,
      modified: found.modified,
      ...(online && !isFolder && { online: true }),
    };
  }
  const target = await targetOf(path.join(folder, found.name));
  return {
    name: found.name,
    folder: target?.isDirectory() ?? isFolder,
    link,
    hidden,
    size:
      target === undefined || target.isDirectory() ? undefined : target.size,
    modified: target?.mtimeMs ?? found.modified,
  };
}

type Native = ReturnType<LibraryHandle['func']>;

export function called(native: Native, ...args: unknown[]): Promise<unknown> {
  return new Promise((resolve, reject) => {
    native.async(...args, (error: unknown, result: unknown) => {
      if (error) {
        reject(
          error instanceof Error ? error : new Error(JSON.stringify(error)),
        );
      } else {
        resolve(result);
      }
    });
  });
}

async function failure(folder: string): Promise<Error> {
  await fs.promises.readdir(folder);
  return new Error(folder);
}

export function windowsFileSystem(): LocalFileSystem {
  const kernel32 = koffi.load('kernel32.dll');
  const ntdll = koffi.load('ntdll.dll');
  const createFile = kernel32.func(createFileSignature);
  const closeHandle = kernel32.func(closeHandleSignature);
  const queryDirectory = ntdll.func(queryDirectorySignature);
  const logicalDrives = kernel32.func('uint32_t GetLogicalDrives()');
  const fileAttributes = kernel32.func(
    'uint32_t GetFileAttributesW(const char16_t *name)',
  );

  async function foundIn(folder: string): Promise<Found[]> {
    const handle = await called(
      createFile,
      path.toNamespacedPath(folder),
      listDirectory,
      shareAll,
      null,
      openExisting,
      backupSemantics,
      null,
    );
    if (handle === null || handle === invalidHandle) {
      throw await failure(folder);
    }
    try {
      const found: Found[] = [];
      const status = Buffer.alloc(16);
      const page = Buffer.alloc(pageSize);
      for (let restart = true; ; restart = false) {
        const result = Number(
          await called(
            queryDirectory,
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
          return found;
        }
        if (result < 0) {
          throw await failure(folder);
        }
        found.push(...foundOnPage(page));
      }
    } finally {
      await called(closeHandle, handle);
    }
  }

  return {
    async list(folder) {
      const found = await foundIn(folder);
      return Promise.all(found.map((each) => entryOf(folder, each)));
    },
    drives() {
      const mask = Number(logicalDrives());
      return Promise.resolve(
        Array.from({ length: 26 }, (_, index) => index)
          .filter((index) => (mask & (1 << index)) !== 0)
          .map((index) => `${String.fromCharCode(65 + index)}:\\`),
      );
    },
    async hidden(file) {
      if (path.dirname(file) === file) {
        return false;
      }
      const attributes = Number(
        await called(fileAttributes, path.toNamespacedPath(file)),
      );
      return (
        attributes !== invalidAttributes && (attributes & hiddenAttribute) !== 0
      );
    },
  };
}
