import * as fs from 'node:fs';
import * as path from 'node:path';

export async function itemsAt(
  folder: string,
  depth: number,
): Promise<string[]> {
  let at = folder;
  for (let level = 0; level < depth; level++) {
    const [only] = await fs.promises.readdir(at).catch(() => []);
    if (only === undefined) {
      return [];
    }
    at = path.join(at, only);
  }
  const found = await fs.promises.readdir(at).catch(() => []);
  return found.map((name) => path.join(at, name));
}
