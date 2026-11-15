import * as fs from 'node:fs';
import * as path from 'node:path';
import type { TestContext } from 'vitest';
import { removeFolder, tempFolder } from './tempFolders';

export function createsAnewThroughJunctions(): boolean {
  const folder = tempFolder('junction');
  try {
    const target = path.join(folder, 'target');
    const link = path.join(folder, 'link');
    fs.mkdirSync(target);
    fs.symlinkSync(target, link, 'junction');
    fs.closeSync(fs.openSync(path.join(link, 'lock'), 'wx'));
    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'EEXIST') {
      return false;
    }
    throw error;
  } finally {
    removeFolder(folder);
  }
}

export function symlinkOrSkip(
  context: TestContext,
  target: string,
  link: string,
): void {
  try {
    fs.symlinkSync(target, link);
  } catch (error) {
    if (!(
      error instanceof Error &&
      'code' in error &&
      error.code === 'EPERM'
    )) {
      throw error;
    }
    context.skip();
  }
}
