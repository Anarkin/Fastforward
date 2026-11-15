export function folderKey(
  folder: string,
  platform: string | undefined,
): string {
  return platform === 'win32' || platform === 'darwin'
    ? folder.toLowerCase()
    : folder;
}
