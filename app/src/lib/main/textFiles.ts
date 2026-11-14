import * as fs from 'node:fs';
import * as path from 'node:path';

export function readText(file: string): string | Error | undefined {
  try {
    return fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  } catch (error) {
    return isMissing(error)
      ? undefined
      : error instanceof Error
        ? error
        : new Error(String(error));
  }
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

const renameRetryDelays = [10, 20, 40, 80, 160, 320, 640];

export async function writeAtomically(
  file: string,
  text: string,
  retryDelays: readonly number[] = renameRetryDelays,
): Promise<void> {
  const target = await linkedFile(file);
  const temporary = `${target}.tmp`;
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  try {
    const handle = await fs.promises.open(temporary, 'w');
    try {
      await handle.writeFile(text);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await renameRetrying(temporary, target, retryDelays);
  } catch (error) {
    await fs.promises.rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
}

async function linkedFile(file: string): Promise<string> {
  try {
    return await fs.promises.realpath(file);
  } catch (error) {
    const link = isMissing(error)
      ? await fs.promises.readlink(file).catch(() => undefined)
      : undefined;
    return link === undefined
      ? file
      : linkedFile(path.resolve(path.dirname(file), link));
  }
}

async function renameRetrying(
  from: string,
  to: string,
  retryDelays: readonly number[],
): Promise<void> {
  for (const delay of retryDelays) {
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

function isHeld(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error.code === 'EPERM' ||
      error.code === 'EACCES' ||
      error.code === 'EBUSY')
  );
}

export function writeReadOnly(file: string, text: string): void {
  if (fs.existsSync(file)) {
    fs.chmodSync(file, 0o644);
  }
  fs.writeFileSync(file, text);
  fs.chmodSync(file, 0o444);
}
