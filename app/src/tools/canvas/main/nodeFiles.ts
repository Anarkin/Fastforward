import * as path from 'node:path';
import { decodedText } from '../../../components/encodings/main/encodingDetection';
import type { TextEncoding } from '../../../components/encodings/shared/textEncodings';
import type { Board } from '../shared/board';
import type { NodeFile } from '../shared/protocol';

export const headBytes = 16 * 1024;

const mostLines = 500;

const vaultMark = '.obsidian';

export interface FileAccess {
  readonly isFolder: (file: string) => Promise<boolean>;
  readonly readHead: (file: string, bytes: number) => Promise<Buffer>;
  readonly codePage: () => Promise<TextEncoding>;
}

export async function vaultOf(
  canvas: string,
  isFolder: FileAccess['isFolder'],
): Promise<string> {
  const start = path.dirname(canvas);
  for (let folder = start; ; folder = path.dirname(folder)) {
    if (await isFolder(path.join(folder, vaultMark))) {
      return folder;
    }
    if (path.dirname(folder) === folder) {
      return start;
    }
  }
}

export function pathIn(root: string, file: string): string | undefined {
  const at = path.resolve(root, file);
  const inside = path.relative(root, at);
  return inside === '' ||
    inside === '..' ||
    inside.startsWith(`..${path.sep}`) ||
    path.isAbsolute(inside)
    ? undefined
    : at;
}

export function fileIn(root: string, file: string): string | undefined {
  const inside = path.relative(root, file);
  return inside === '' ||
    inside === '..' ||
    inside.startsWith(`..${path.sep}`) ||
    path.isAbsolute(inside)
    ? undefined
    : inside.split(path.sep).join('/');
}

export function shownText(
  bytes: Buffer,
  whole: boolean,
  codePage: TextEncoding,
): string | undefined {
  const decoded = decodedText(bytes, codePage);
  if (decoded === undefined) {
    return undefined;
  }
  const lines = decoded.text.split(/\r\n|\r|\n/);
  const kept = whole || lines.length === 1 ? lines : lines.slice(0, -1);
  return kept.slice(0, mostLines).join('\n');
}

async function nodeFileOf(
  at: string,
  access: FileAccess,
  codePage: TextEncoding,
): Promise<NodeFile> {
  try {
    if (await access.isFolder(at)) {
      return { path: at };
    }
    const bytes = await access.readHead(at, headBytes + 1);
    const text = shownText(
      bytes.subarray(0, headBytes),
      bytes.length <= headBytes,
      codePage,
    );
    return text === undefined ? { path: at } : { path: at, text };
  } catch {
    return { path: at };
  }
}

export async function nodeFilesOf(
  canvas: string,
  board: Board,
  access: FileAccess,
): Promise<Record<string, NodeFile>> {
  const named = new Set(
    board.nodes.flatMap((node) => (node.type === 'file' ? [node.file] : [])),
  );
  if (named.size === 0) {
    return {};
  }
  const root = await vaultOf(canvas, access.isFolder);
  const codePage = await access.codePage();
  const read = await Promise.all(
    [...named].map(async (file) => {
      const at = pathIn(root, file);
      return at === undefined
        ? []
        : [[file, await nodeFileOf(at, access, codePage)] as const];
    }),
  );
  return Object.fromEntries(read.flat());
}
