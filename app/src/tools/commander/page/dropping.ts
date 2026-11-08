import { parentFolder } from '../shared/protocol';
import { pathParts } from '../shared/paths';

export function dropTargetOf(
  folder: string,
  into: string | undefined,
  platform: string | undefined,
): string {
  if (into === undefined) {
    return folder;
  }
  if (into === parentFolder) {
    return pathParts(folder).at(-2)?.path ?? folder;
  }
  const separator = platform === 'win32' ? '\\' : '/';
  return /[\\/]$/.test(folder)
    ? `${folder}${into}`
    : `${folder}${separator}${into}`;
}
