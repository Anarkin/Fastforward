import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export function tempFolder(name: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `fastforward-${name}-`));
}

const unremoved = new Set<string>();

function tryRemoving(folder: string, maxRetries = 5): unknown {
  try {
    fs.rmSync(folder, {
      recursive: true,
      force: true,
      maxRetries,
      retryDelay: 100,
    });
    return undefined;
  } catch (error) {
    return error;
  }
}

export function removeFolder(
  folder: string,
  remove: (folder: string) => unknown = tryRemoving,
): void {
  if (remove(folder) !== undefined) {
    unremoved.add(folder);
  }
}

export async function assertNoFoldersLeft(): Promise<void> {
  const left = [...unremoved];
  unremoved.clear();
  assert.deepStrictEqual(
    await foldersLeft(left, Date.now() + 7000),
    [],
    'folders left behind',
  );
}

export async function foldersLeft(
  folders: readonly string[],
  until: number,
  remove = (folder: string) => tryRemoving(folder, 0),
): Promise<string[]> {
  const removing = (left: readonly string[]) =>
    left.flatMap((folder) => {
      const error = remove(folder);
      return error === undefined ? [] : [{ folder, error }];
    });
  let left = removing(folders);
  while (left.length > 0 && Date.now() < until) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    left = removing(left.map(({ folder }) => folder));
  }
  return left.map(({ folder, error }) =>
    error instanceof Error ? `${folder}: ${error.message}` : folder,
  );
}
