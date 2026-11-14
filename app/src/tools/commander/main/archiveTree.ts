import type { Entry } from '../shared/protocol';
import { ArchiveItem } from './archives';

export interface ArchiveNode {
  readonly entry: Entry;
  readonly path: string;
  readonly encrypted: boolean;
}

export interface ArchiveBranch {
  readonly path: string;
  readonly parts: readonly string[];
  readonly folder: boolean;
  readonly children: readonly ArchiveBranch[];
}

function childKey(folder: string, name: string): string {
  return folder === '' ? name : `${folder}/${name}`;
}

export function entryParts(entry: string): string[] {
  return entry
    .split('/')
    .filter((part) => part !== '' && part !== '.' && part !== '..');
}

export class ArchiveTree {
  private readonly folders = new Map<string, Map<string, ArchiveNode>>([
    ['', new Map()],
  ]);

  constructor(items: readonly ArchiveItem[], platform: NodeJS.Platform) {
    for (const item of items) {
      const parts = entryParts(item.path);
      const name = parts.at(-1);
      if (name === undefined) {
        continue;
      }
      const parent = this.folderOf(parts.slice(0, -1), platform);
      if (item.folder) {
        this.folderOf(parts, platform);
      } else if (parent.get(name)?.entry.folder === true) {
        continue;
      }
      parent.set(name, {
        entry: {
          name,
          folder: item.folder,
          link: item.link,
          hidden:
            platform === 'win32' ? item.hiddenAttribute : name.startsWith('.'),
          size: item.size,
          modified: item.modified,
        },
        path: item.path,
        encrypted: item.encrypted,
      });
    }
    this.sizeFolders();
  }

  private sizeFolders(): void {
    const sizes = new Map<string, number>();
    const sizeOf = (key: string): number => {
      const known = sizes.get(key);
      if (known !== undefined) {
        return known;
      }
      let bytes = 0;
      for (const [name, node] of this.folders.get(key) ?? []) {
        bytes += node.entry.folder
          ? sizeOf(childKey(key, name))
          : (node.entry.size ?? 0);
      }
      sizes.set(key, bytes);
      return bytes;
    };
    for (const [key, folder] of this.folders) {
      for (const [name, node] of folder) {
        if (node.entry.folder) {
          folder.set(name, {
            ...node,
            entry: { ...node.entry, size: sizeOf(childKey(key, name)) },
          });
        }
      }
    }
  }

  private folderOf(
    parts: readonly string[],
    platform: NodeJS.Platform,
  ): Map<string, ArchiveNode> {
    let folder = this.folders.get('') ?? new Map<string, ArchiveNode>();
    for (const [at, name] of parts.entries()) {
      const key = parts.slice(0, at + 1).join('/');
      const inner = this.folders.get(key);
      if (inner !== undefined) {
        folder = inner;
        continue;
      }
      if (folder.get(name)?.entry.folder !== true) {
        folder.set(name, {
          entry: {
            name,
            folder: true,
            link: false,
            hidden: platform !== 'win32' && name.startsWith('.'),
            size: undefined,
            modified: undefined,
          },
          path: key,
          encrypted: false,
        });
      }
      const made = new Map<string, ArchiveNode>();
      this.folders.set(key, made);
      folder = made;
    }
    return folder;
  }

  entries(inner: readonly string[]): readonly Entry[] | undefined {
    const folder = this.folders.get(inner.join('/'));
    return folder && [...folder.values()].map((node) => node.entry);
  }

  totals(
    items: readonly {
      readonly inner: readonly string[];
      readonly name: string;
    }[],
  ): {
    readonly files: number;
    readonly bytes: number;
    readonly encrypted: boolean;
  } {
    let files = 0;
    let bytes = 0;
    let encrypted = false;
    const add = (folder: string, name: string) => {
      const node = this.folders.get(folder)?.get(name);
      if (node === undefined) {
        return;
      }
      if (!node.entry.folder) {
        files++;
        bytes += node.entry.size ?? 0;
        encrypted ||= node.encrypted;
        return;
      }
      const key = childKey(folder, name);
      for (const inside of this.folders.get(key)?.keys() ?? []) {
        add(key, inside);
      }
    };
    for (const { inner, name } of items) {
      add(inner.join('/'), name);
    }
    return { files, bytes, encrypted };
  }

  item(
    inner: readonly string[],
    name: string,
  ): { readonly path: string; readonly encrypted: boolean } | undefined {
    const node = this.folders.get(inner.join('/'))?.get(name);
    return node && { path: node.path, encrypted: node.encrypted };
  }

  branch(inner: readonly string[], name: string): ArchiveBranch | undefined {
    const node = this.folders.get(inner.join('/'))?.get(name);
    if (node === undefined) {
      return undefined;
    }
    const parts = [...inner, name];
    const children = node.entry.folder
      ? [...(this.folders.get(parts.join('/'))?.keys() ?? [])].flatMap(
          (child) => this.branch(parts, child) ?? [],
        )
      : [];
    return { path: node.path, parts, folder: node.entry.folder, children };
  }
}
