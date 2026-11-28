import { windowsLinkFolders } from './windowsLinkFolders';

export type LinkFolder = (item: string) => Promise<boolean>;

export function linkFolderTest(
  platform: NodeJS.Platform = process.platform,
): LinkFolder {
  return platform === 'win32' ? windowsLinkFolders() : async () => false;
}
