import { pathParts } from '../shared/paths';
import { baseNameOf } from './naming';

export type Copied = 'paths' | 'names';

function pathIn(
  folder: string,
  key: string,
  platform: string | undefined,
): string {
  return /[\\/]$/.test(folder)
    ? `${folder}${key}`
    : `${folder}${platform === 'win32' ? '\\' : '/'}${key}`;
}

export function copiedText(
  copied: Copied,
  folder: string,
  names: readonly string[],
  platform: string | undefined,
): string {
  const lines =
    names.length === 0
      ? [copied === 'paths' ? folder : (pathParts(folder).at(-1)?.name ?? '')]
      : names.map((name) =>
          copied === 'paths'
            ? pathIn(folder, name, platform)
            : baseNameOf(name, platform),
        );
  return lines.join(platform === 'win32' ? '\r\n' : '\n');
}
