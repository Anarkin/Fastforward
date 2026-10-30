import * as fs from 'node:fs';
import * as path from 'node:path';
import koffi, { type LibraryHandle } from 'koffi';
import type { Entry } from '../shared/protocol';
import type { FileSystem } from './fileSystem';

const listDirectory = 0x1;
const shareAll = 0x7;
const openExisting = 3;
const backupSemantics = 0x02000000;
const invalidHandle = 0xffff_ffff_ffff_ffffn;

const fullDirectoryInformation = 2;
const noMoreFiles = 0x8000_0006 | 0;
const noSuchFile = 0xc000_000f | 0;
const pageSize = 64 * 1024;

const hiddenAttribute = 0x2;
const directoryAttribute = 0x10;
const reparsePointAttribute = 0x400;
const linkTags: ReadonlySet<number> = new Set([
  0xa000_000c, 0xa000_0003, 0xa000_001d,
]);

const unixEpochInFileTime = 116_444_736_000_000_000n;
const fileTimeTicksPerMilli = 10_000n;

const record = {
  next: 0,
  modified: 24,
  size: 40,
  attributes: 56,
  nameLength: 60,
  reparseTag: 64,
  name: 68,
};

interface Found {
  readonly name: string;
  readonly attributes: number;
  readonly reparseTag: number;
  readonly size: number;
  readonly modified: number;
}

function foundAt(page: Buffer, start: number): Found {
  const nameStart = start + record.name;
  return {
    name: page.toString(
      'utf16le',
      nameStart,
      nameStart + page.readUInt32LE(start + record.nameLength),
    ),
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
  for (let start = 0; ;) {
    const each = foundAt(page, start);
    if (each.name !== '.' && each.name !== '..') {
      found.push(each);
    }
    const next = page.readUInt32LE(start + record.next);
    if (next === 0) {
      return found;
    }
    start += next;
  }
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
  const link =
    (found.attributes & reparsePointAttribute) !== 0 &&
    linkTags.has(found.reparseTag);
  const hidden = (found.attributes & hiddenAttribute) !== 0;
  if (!link) {
    return {
      name: found.name,
      folder: isFolder,
      link,
      hidden,
      size: isFolder ? undefined : found.size,
      modified: found.modified,
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

function called(native: Native, ...args: unknown[]): Promise<unknown> {
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

export function windowsFileSystem(): FileSystem {
  const kernel32 = koffi.load('kernel32.dll');
  const ntdll = koffi.load('ntdll.dll');
  const createFile = kernel32.func(
    'void *CreateFileW(const char16_t *name, uint32_t access, uint32_t share, void *security, uint32_t disposition, uint32_t flags, void *template)',
  );
  const closeHandle = kernel32.func('bool CloseHandle(void *handle)');
  const queryDirectory = ntdll.func(
    'int32_t NtQueryDirectoryFile(void *handle, void *event, void *apc, void *context, void *status, void *page, uint32_t length, int kind, bool single, void *name, bool restart)',
  );
  const logicalDrives = kernel32.func('uint32_t GetLogicalDrives()');

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
  };
}
