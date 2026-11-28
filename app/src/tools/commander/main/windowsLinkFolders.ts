import koffi from 'koffi';
import * as path from 'node:path';
import { called } from '../../../lib/main/nativeCalls';
import { directoryAttribute, invalidHandle, isLink } from './windowsDirectory';

const findData = { size: 592, attributes: 0, reparseTag: 36 };

export function windowsLinkFolders(): (item: string) => Promise<boolean> {
  const kernel32 = koffi.load('kernel32.dll');
  const findFirst = kernel32.func(
    'void *FindFirstFileW(const char16_t *name, void *data)',
  );
  const findClose = kernel32.func('bool FindClose(void *handle)');
  return async (item) => {
    const data = Buffer.alloc(findData.size);
    const handle = await called(findFirst, path.toNamespacedPath(item), data);
    if (handle === null || koffi.address(handle) === invalidHandle) {
      return false;
    }
    await called(findClose, handle);
    const attributes = data.readUInt32LE(findData.attributes);
    return (
      (attributes & directoryAttribute) !== 0 &&
      isLink(attributes, data.readUInt32LE(findData.reparseTag))
    );
  };
}
