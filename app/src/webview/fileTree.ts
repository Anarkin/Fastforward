import type { FileChange } from '../shared/protocol';

export interface FolderNode {
  readonly name: string;
  readonly path: string;
  readonly folders: Map<string, FolderNode>;
  readonly files: { name: string; path: string }[];
  changed: boolean;
}

function folder(name: string, path: string): FolderNode {
  return { name, path, folders: new Map(), files: [], changed: false };
}

function pathParts(path: string): string[] {
  const parts = path.replace(/\/$/, '').split('/');
  if (path.endsWith('/')) {
    parts.push(`${parts.pop()}/`);
  }
  return parts;
}

export function buildFileTree(
  paths: readonly string[],
  changes: ReadonlyMap<string, FileChange>,
): FolderNode {
  const root = folder('', '');
  const all = new Set(paths);
  for (const change of changes.values()) {
    all.add(change.path);
  }
  for (const path of all) {
    const parts = pathParts(path);
    const name = parts.pop() ?? path;
    const changed = changes.has(path);
    let node = root;
    for (const part of parts) {
      const childPath = node.path ? `${node.path}/${part}` : part;
      let child = node.folders.get(part);
      if (!child) {
        child = folder(part, childPath);
        node.folders.set(part, child);
      }
      if (changed) {
        child.changed = true;
      }
      node = child;
    }
    node.files.push({ name, path });
  }
  return root;
}

export function foldersOf(path: string): string[] {
  const parts = pathParts(path);
  return parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join('/'));
}
