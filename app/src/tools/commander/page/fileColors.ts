import { languageOf } from '../../../ui/languages';
import type { Entry } from '../shared/protocol';
import {
  extensionKey,
  languagesGroup,
  type FileColor,
} from '../shared/settings';

export interface FileColors {
  readonly colors: readonly string[];
  readonly byExtension: ReadonlyMap<string, number>;
  readonly languages: number | undefined;
}

export const noFileColors: FileColors = {
  colors: [],
  byExtension: new Map(),
  languages: undefined,
};

export function fileColorsOf(groups: readonly FileColor[]): FileColors {
  const byExtension = new Map<string, number>();
  let languages: number | undefined;
  groups.forEach(({ extensions }, group) => {
    if (extensions === languagesGroup) {
      languages ??= group;
      return;
    }
    for (const extension of extensions) {
      const key = extensionKey(extension);
      if (!byExtension.has(key)) {
        byExtension.set(key, group);
      }
    }
  });
  return {
    colors: groups.map(
      ({ colors }) => `light-dark(${colors.light}, ${colors.dark})`,
    ),
    byExtension,
    languages,
  };
}

export function sameGrouping(one: FileColors, other: FileColors): boolean {
  return (
    one.languages === other.languages &&
    one.byExtension.size === other.byExtension.size &&
    [...one.byExtension].every(
      ([extension, group]) => other.byExtension.get(extension) === group,
    )
  );
}

export function groupOfFileNamed(
  name: string,
  { byExtension, languages }: FileColors,
): number | undefined {
  const dot = name.lastIndexOf('.');
  const byName =
    dot <= 0 ? undefined : byExtension.get(name.slice(dot + 1).toLowerCase());
  if (languages === undefined || (byName !== undefined && byName < languages)) {
    return byName;
  }
  return languageOf(name) === undefined ? byName : languages;
}

export function colorOfFileNamed(
  name: string,
  fileColors: FileColors,
): string | undefined {
  const group = groupOfFileNamed(name, fileColors);
  return group === undefined ? undefined : fileColors.colors[group];
}

export function fileColorOf(
  entry: Entry,
  fileColors: FileColors,
): string | undefined {
  return entry.folder ? undefined : colorOfFileNamed(entry.name, fileColors);
}
