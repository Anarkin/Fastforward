import type { Entry } from '../shared/protocol';
import type { FileColor } from '../shared/settings';

export type FileColorsByExtension = ReadonlyMap<string, string>;

export const noFileColors: FileColorsByExtension = new Map();

export function fileColorsByExtension(
  groups: readonly FileColor[],
): FileColorsByExtension {
  const byExtension = new Map<string, string>();
  for (const { extensions, colors } of groups) {
    for (const extension of extensions) {
      const key = extension.replace(/^\./, '').toLowerCase();
      if (!byExtension.has(key)) {
        byExtension.set(key, `light-dark(${colors.light}, ${colors.dark})`);
      }
    }
  }
  return byExtension;
}

export function fileColorOf(
  entry: Entry,
  byExtension: FileColorsByExtension,
): string | undefined {
  const dot = entry.name.lastIndexOf('.');
  if (entry.folder || dot <= 0) {
    return undefined;
  }
  return byExtension.get(entry.name.slice(dot + 1).toLowerCase());
}
