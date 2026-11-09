import koffi from 'koffi';
import { recycleBinOff, type Hive, type WindowsRegistry } from './recycleBin';
import { called } from './windowsFileSystem';

const hives: Record<Hive, number> = {
  currentUser: 0x8000_0001 | 0,
  localMachine: 0x8000_0002 | 0,
};
const dwordOnly = 0x10;
const volumeNameLength = 50;
const shortestPath = 260;

function text(buffer: Buffer): string {
  const all = buffer.toString('utf16le');
  const end = all.indexOf('\0');
  return end === -1 ? all : all.slice(0, end);
}

export function windowsRegistry(): WindowsRegistry {
  const kernel32 = koffi.load('kernel32.dll');
  const advapi32 = koffi.load('advapi32.dll');
  const volumePath = kernel32.func(
    'bool GetVolumePathNameW(const char16_t *name, void *path, uint32_t length)',
  );
  const volumeName = kernel32.func(
    'bool GetVolumeNameForVolumeMountPointW(const char16_t *mountPoint, void *name, uint32_t length)',
  );
  const getValue = advapi32.func(
    'int32_t RegGetValueW(intptr_t key, const char16_t *subKey, const char16_t *value, uint32_t flags, void *type, void *data, void *size)',
  );
  return {
    volumeOf: async (folder) => {
      const length = Math.max(folder.length + 2, shortestPath);
      const mountPoint = Buffer.alloc(length * 2);
      if ((await called(volumePath, folder, mountPoint, length)) !== true) {
        return undefined;
      }
      const name = Buffer.alloc(volumeNameLength * 2);
      return (await called(
        volumeName,
        text(mountPoint),
        name,
        volumeNameLength,
      )) === true
        ? text(name)
        : undefined;
    },
    number: (hive, key, name) => {
      const data = Buffer.alloc(4);
      const size = Buffer.alloc(4);
      size.writeUInt32LE(data.length);
      return Number(
        getValue(hives[hive], key, name, dwordOnly, null, data, size),
      ) === 0
        ? data.readUInt32LE()
        : undefined;
    },
  };
}

let registry: WindowsRegistry | undefined;

export function windowsRecycleBinOff(folder: string): Promise<boolean> {
  registry ??= windowsRegistry();
  return recycleBinOff(registry, folder);
}
