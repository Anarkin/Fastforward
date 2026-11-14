import { languageOf } from '../../../lib/page/languages';
import type { Entry } from '../shared/protocol';
import {
  executablesGroup,
  extensionKey,
  languagesGroup,
  type FileColor,
} from '../shared/settings';

export interface FileColors {
  readonly colors: readonly string[];
  readonly byExtension: ReadonlyMap<string, number>;
  readonly languages: number | undefined;
  readonly executables: number | undefined;
}

export const noFileColors: FileColors = {
  colors: [],
  byExtension: new Map(),
  languages: undefined,
  executables: undefined,
};

const appBundle = 'app';

export function fileColorsOf(groups: readonly FileColor[]): FileColors {
  const byExtension = new Map<string, number>();
  let languages: number | undefined;
  let executables: number | undefined;
  groups.forEach(({ extensions }, group) => {
    if (extensions === languagesGroup) {
      languages ??= group;
      return;
    }
    if (extensions === executablesGroup) {
      executables ??= group;
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
    executables,
  };
}

export function sameGrouping(one: FileColors, other: FileColors): boolean {
  return (
    one.languages === other.languages &&
    one.executables === other.executables &&
    one.byExtension.size === other.byExtension.size &&
    [...one.byExtension].every(
      ([extension, group]) => other.byExtension.get(extension) === group,
    )
  );
}

function extensionOf(name: string): string | undefined {
  const dot = name.lastIndexOf('.');
  return dot <= 0 ? undefined : name.slice(dot + 1).toLowerCase();
}

function groupOfFileNamed(
  name: string,
  { byExtension, languages }: FileColors,
): number | undefined {
  const extension = extensionOf(name);
  const byName =
    extension === undefined ? undefined : byExtension.get(extension);
  if (languages === undefined || (byName !== undefined && byName < languages)) {
    return byName;
  }
  return languageOf(name) === undefined ? byName : languages;
}

export function groupOfEntry(
  entry: Entry,
  fileColors: FileColors,
): number | undefined {
  if (entry.folder) {
    return extensionOf(entry.name) === appBundle
      ? fileColors.byExtension.get(appBundle)
      : undefined;
  }
  const byName = groupOfFileNamed(entry.name, fileColors);
  const { executables } = fileColors;
  return entry.executable === true &&
    executables !== undefined &&
    (byName === undefined || executables < byName)
    ? executables
    : byName;
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
  const group = groupOfEntry(entry, fileColors);
  return group === undefined ? undefined : fileColors.colors[group];
}
