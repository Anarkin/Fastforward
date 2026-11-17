import { createRequire } from 'node:module';
import type { load } from 'koffi';

export type ProcessHolder = (pid: number) => (() => void) | undefined;

const synchronize = 0x0010_0000;
const notInherited = 0;

function windowsProcessHolder(koffi: {
  readonly load: typeof load;
}): ProcessHolder {
  const kernel32 = koffi.load('kernel32.dll');
  const openProcess = kernel32.func(
    'void *OpenProcess(uint32_t access, int inherited, uint32_t pid)',
  );
  const closeHandle = kernel32.func('bool CloseHandle(void *handle)');
  return (pid) => {
    const handle: unknown = openProcess(synchronize, notInherited, pid);
    if (handle === null) {
      return undefined;
    }
    return () => {
      closeHandle(handle);
    };
  };
}

export function processHolderAt(koffi: string | undefined): ProcessHolder {
  let holder: ProcessHolder | undefined;
  return (pid) => {
    if (koffi === undefined) {
      return undefined;
    }
    holder ??= windowsProcessHolder(createRequire(koffi)(koffi));
    return holder(pid);
  };
}
