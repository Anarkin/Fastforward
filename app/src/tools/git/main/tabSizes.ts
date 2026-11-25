import * as path from 'node:path';
import { editorConfigOf, fileTabSizeOf } from '../../../lib/main/editorConfig';
import { fs } from '../../../lib/main/files';

const mostFiles = 2000;

export async function tabSizesOf(
  root: string,
  paths: readonly string[],
): Promise<Record<string, number>> {
  const read = new Map<string, Promise<string | undefined>>();
  const reading = (config: string) => {
    let content = read.get(config);
    if (content === undefined) {
      content = fs.promises.readFile(config, 'utf8').catch(() => undefined);
      read.set(config, content);
    }
    return content;
  };
  const sizes: Record<string, number> = {};
  for (const file of paths.slice(0, mostFiles)) {
    const size = fileTabSizeOf(
      await editorConfigOf(path.join(root, file), reading),
    )?.size;
    if (size !== undefined) {
      sizes[file] = size;
    }
  }
  return sizes;
}
