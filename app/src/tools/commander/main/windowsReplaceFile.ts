import * as path from 'node:path';
import koffi from 'koffi';
import type { ReplaceFile } from './fileSaving';
import { called } from './windowsFileSystem';

const writeThrough = 0x1;

export function windowsReplaceFile(): ReplaceFile {
  const kernel32 = koffi.load('kernel32.dll');
  const replaceFile = kernel32.func(
    'bool ReplaceFileW(const char16_t *replaced, const char16_t *replacement, const char16_t *backup, uint32_t flags, void *exclude, void *reserved)',
  );
  return async (replaced, replacement) =>
    Boolean(
      await called(
        replaceFile,
        path.toNamespacedPath(replaced),
        path.toNamespacedPath(replacement),
        null,
        writeThrough,
        null,
        null,
      ),
    );
}
