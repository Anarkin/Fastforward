import type { Entry } from '../shared/protocol';
import { nodeFileSystem } from './nodeFileSystem';

export interface FileSystem {
  list(folder: string): Promise<readonly Entry[]>;
  drives(): Promise<readonly string[]>;
}

export async function fileSystemFor(
  platform: NodeJS.Platform,
): Promise<FileSystem> {
  if (platform !== 'win32') {
    return nodeFileSystem;
  }
  const { windowsFileSystem } = await import('./windowsFileSystem.js');
  return windowsFileSystem();
}
