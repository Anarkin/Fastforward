import type { Entry } from '../shared/protocol';
import { extensionKey, type FileColor } from '../shared/settings';

export type FileColorsByExtension = ReadonlyMap<string, string>;

export const noFileColors: FileColorsByExtension = new Map();

export type FileGroupsByExtension = ReadonlyMap<string, number>;

export const noFileGroups: FileGroupsByExtension = new Map();

export function fileGroupsByExtension(
  groups: readonly FileColor[],
): FileGroupsByExtension {
  const byExtension = new Map<string, number>();
  groups.forEach(({ extensions }, group) => {
    for (const extension of extensions) {
      const key = extensionKey(extension);
      if (!byExtension.has(key)) {
        byExtension.set(key, group);
      }
    }
  });
  return byExtension;
}

export function fileColorsByExtension(
  groups: readonly FileColor[],
): FileColorsByExtension {
  const byExtension = new Map<string, string>();
  for (const { extensions, colors } of groups) {
    for (const extension of extensions) {
      const key = extensionKey(extension);
      if (!byExtension.has(key)) {
        byExtension.set(key, `light-dark(${colors.light}, ${colors.dark})`);
      }
    }
  }
  return byExtension;
}

export function colorOfFileNamed(
  name: string,
  byExtension: FileColorsByExtension,
): string | undefined {
  const dot = name.lastIndexOf('.');
  return dot <= 0
    ? undefined
    : byExtension.get(name.slice(dot + 1).toLowerCase());
}

export function fileColorOf(
  entry: Entry,
  byExtension: FileColorsByExtension,
): string | undefined {
  return entry.folder ? undefined : colorOfFileNamed(entry.name, byExtension);
}
