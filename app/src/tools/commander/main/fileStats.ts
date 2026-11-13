import * as fs from 'node:fs';

export async function isFolder(folder: string): Promise<boolean> {
  try {
    return (await fs.promises.stat(folder)).isDirectory();
  } catch {
    return false;
  }
}

export async function isFile(file: string): Promise<boolean> {
  try {
    return (await fs.promises.stat(file)).isFile();
  } catch {
    return false;
  }
}
