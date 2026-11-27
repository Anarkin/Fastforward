import { codeOf, hasCode } from '../shared/errors';
import { randomBytes } from 'node:crypto';
import { fs } from './files';
import type { FileHandle, Stats } from './files';
import * as path from 'node:path';

export type ReplaceFile = (
  replaced: string,
  replacement: string,
) => Promise<boolean>;

export interface Saving {
  readonly replaceFile?: ReplaceFile;
  readonly overwriteReadOnly?: boolean;
  readonly freeBytes?: (folder: string) => Promise<number>;
  readonly heldRetries?: readonly number[];
}

export function isHeld(error: unknown): boolean {
  return hasCode(error, 'EBUSY', 'EPERM', 'EACCES');
}

async function renamed(
  from: string,
  to: string,
  { heldRetries = [] }: Saving,
): Promise<void> {
  for (const delay of heldRetries) {
    try {
      await fs.promises.rename(from, to);
      return;
    } catch (error) {
      if (!isHeld(error)) {
        throw error;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  await fs.promises.rename(from, to);
}

export type Saved = 'replaced' | 'inPlace' | 'created';

export class ReadOnlyFile extends Error {}

export class NoRoomToSave extends Error {}

export class KeptBeside extends Error {
  constructor(
    readonly beside: string,
    cause: unknown,
  ) {
    super(beside, { cause });
  }
}

const refusesFiles = (error: unknown) =>
  hasCode(error, 'EACCES', 'EPERM', 'EROFS');

async function linkedTarget(file: string): Promise<string> {
  try {
    return await fs.promises.realpath(file);
  } catch (error) {
    if (!hasCode(error, 'ENOENT')) {
      throw error;
    }
    const link = await fs.promises.readlink(file).catch(() => undefined);
    return link === undefined
      ? file
      : linkedTarget(path.resolve(path.dirname(file), link));
  }
}

async function statOf(file: string): Promise<Stats | undefined> {
  try {
    return await fs.promises.stat(file);
  } catch (error) {
    if (hasCode(error, 'ENOENT')) {
      return undefined;
    }
    throw error;
  }
}

async function writable(file: string): Promise<boolean> {
  try {
    await fs.promises.access(file, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

const ownedByAnother = (stat: Stats) => {
  const user = process.getuid?.();
  return user !== undefined && user !== 0 && stat.uid !== user;
};

async function writeAll(handle: FileHandle, bytes: Uint8Array) {
  for (let at = 0; at < bytes.length;) {
    const { bytesWritten } = await handle.write(
      bytes,
      at,
      bytes.length - at,
      at,
    );
    at += bytesWritten;
  }
}

const savingName = (target: string) =>
  path.join(
    path.dirname(target),
    `.${path.basename(target)}.saving-${randomBytes(6).toString('hex')}`,
  );

async function writtenBeside(
  target: string,
  bytes: Uint8Array,
): Promise<string | undefined> {
  for (let tries = 0; ; tries++) {
    const beside = savingName(target);
    let handle: FileHandle;
    try {
      handle = await fs.promises.open(beside, 'wx');
    } catch (error) {
      if (codeOf(error) === 'EEXIST' && tries < 3) {
        continue;
      }
      if (refusesFiles(error)) {
        return undefined;
      }
      throw error;
    }
    try {
      await writeAll(handle, bytes);
      await handle.sync();
    } catch (error) {
      await handle.close();
      await fs.promises.rm(beside, { force: true });
      throw error;
    }
    await handle.close();
    return beside;
  }
}

async function freeBytesOf(folder: string): Promise<number> {
  const { bavail, bsize } = await fs.promises.statfs(folder);
  return bavail * bsize;
}

async function writtenInPlace(
  target: string,
  stat: Stats,
  bytes: Uint8Array,
  saving: Saving,
): Promise<Saved> {
  const more = bytes.length - stat.size;
  if (
    more > 0 &&
    (await (saving.freeBytes ?? freeBytesOf)(path.dirname(target))) < more
  ) {
    throw new NoRoomToSave(target);
  }
  const handle = await fs.promises.open(target, 'r+');
  try {
    await writeAll(handle, bytes);
    await handle.truncate(bytes.length);
    await handle.sync();
  } finally {
    await handle.close();
  }
  return 'inPlace';
}

const stillThere = (file: string) =>
  fs.promises.stat(file).then(
    () => true,
    () => false,
  );

async function inPlaceOfMoved(target: string, beside: string): Promise<Saved> {
  try {
    await fs.promises.rename(beside, target);
  } catch (error) {
    throw new KeptBeside(beside, error);
  }
  return 'replaced';
}

async function replaced(
  target: string,
  stat: Stats,
  bytes: Uint8Array,
  saving: Saving,
): Promise<Saved> {
  if (stat.nlink > 1 || ownedByAnother(stat)) {
    return writtenInPlace(target, stat, bytes, saving);
  }
  const beside = await writtenBeside(target, bytes);
  if (beside === undefined) {
    return writtenInPlace(target, stat, bytes, saving);
  }
  try {
    if (saving.replaceFile !== undefined) {
      if (await saving.replaceFile(target, beside)) {
        return 'replaced';
      }
      if (!(await stillThere(target))) {
        return await inPlaceOfMoved(target, beside);
      }
      await fs.promises.rm(beside, { force: true });
      return await writtenInPlace(target, stat, bytes, saving);
    }
    await fs.promises.chmod(beside, stat.mode & 0o7777);
    await renamed(beside, target, saving);
    return 'replaced';
  } catch (error) {
    if (!(error instanceof KeptBeside)) {
      await fs.promises.rm(beside, { force: true });
    }
    throw error;
  }
}

async function created(
  target: string,
  bytes: Uint8Array,
  saving: Saving,
): Promise<Saved> {
  const beside = await writtenBeside(target, bytes);
  if (beside === undefined) {
    await fs.promises.writeFile(target, bytes, { flag: 'wx' });
    return 'created';
  }
  try {
    await renamed(beside, target, saving);
  } catch (error) {
    await fs.promises.rm(beside, { force: true });
    throw error;
  }
  return 'created';
}

export async function saveFile(
  file: string,
  bytes: Uint8Array,
  saving: Saving = {},
): Promise<Saved> {
  const target = await linkedTarget(file);
  const stat = await statOf(target);
  if (stat === undefined) {
    return created(target, bytes, saving);
  }
  const readOnly = !(await writable(target));
  if (readOnly && !saving.overwriteReadOnly) {
    throw new ReadOnlyFile(target);
  }
  if (!readOnly) {
    return replaced(target, stat, bytes, saving);
  }
  await fs.promises.chmod(target, (stat.mode | 0o200) & 0o7777);
  let saved: Saved;
  try {
    saved = await replaced(target, stat, bytes, saving);
  } catch (error) {
    if (!(error instanceof KeptBeside)) {
      await fs.promises.chmod(target, stat.mode & 0o7777);
    }
    throw error;
  }
  await fs.promises.chmod(target, stat.mode & 0o7777);
  return saved;
}
