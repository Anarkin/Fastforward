import type { Entry } from '../shared/protocol';
import { nodeFileSystem } from './nodeFileSystem';

export interface FileSystem {
  list(folder: string): Promise<readonly Entry[]>;
  drives(): Promise<readonly string[]>;
}

export interface LocalFileSystem extends FileSystem {
  hidden(file: string): Promise<boolean>;
}

export async function fileSystemFor(
  platform: NodeJS.Platform,
): Promise<LocalFileSystem> {
  if (platform !== 'win32') {
    return nodeFileSystem;
  }
  const { windowsFileSystem } = await import('./windowsFileSystem.js');
  return windowsFileSystem();
}
