import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import koffi from 'koffi';
import type { TestContext } from 'vitest';
import { textOf } from '../../lib/main/nativeCalls';
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

export function junctionByVolumeName(target: string, link: string): void {
  const kernel32 = koffi.load('kernel32.dll');
  const volumePath = kernel32.func(
    'bool GetVolumePathNameW(const char16_t *name, _Out_ char16_t *path, uint32_t length)',
  );
  const volumeName = kernel32.func(
    'bool GetVolumeNameForVolumeMountPointW(const char16_t *mount, _Out_ char16_t *name, uint32_t length)',
  );
  const mount = Buffer.alloc(1024);
  assert.ok(volumePath(target, mount, 512));
  const name = Buffer.alloc(1024);
  assert.ok(volumeName(textOf(mount), name, 512));
  fs.symlinkSync(
    path.join(textOf(name), path.relative(textOf(mount), target)),
    link,
    'junction',
  );
}
