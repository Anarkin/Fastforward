import koffi from 'koffi';

export type Pointer = unknown;

const apartmentThreaded = 0x2;
const changedMode = 0x80010106 | 0;

export const pointerSize = 8;

export function guid(text: string): Buffer {
  const hex = text.replaceAll('-', '');
  const bytes = Buffer.alloc(16);
  bytes.writeUInt32LE(Number.parseInt(hex.slice(0, 8), 16), 0);
  bytes.writeUInt16LE(Number.parseInt(hex.slice(8, 12), 16), 4);
  bytes.writeUInt16LE(Number.parseInt(hex.slice(12, 16), 16), 6);
  Buffer.from(hex.slice(16), 'hex').copy(bytes, 8);
  return bytes;
}

function created() {
  const ole32 = koffi.load('ole32.dll');
  return {
    initialize: ole32.func(
      'int32_t CoInitializeEx(void *reserved, uint32_t flags)',
    ),
    uninitialize: ole32.func('void CoUninitialize()'),
    release: koffi.proto('uint32_t __stdcall ShellMenuRelease(void *self)'),
  };
}

type Native = ReturnType<typeof created>;

let loaded: Native | undefined;

function native(): Native {
  loaded ??= created();
  return loaded;
}

export function comMethod(
  object: Pointer,
  index: number,
  proto: ReturnType<typeof koffi.proto>,
) {
  const table: unknown = koffi.decode(object, 'void *');
  const called: unknown = koffi.decode(table, index * pointerSize, 'void *');
  return (...args: unknown[]): unknown =>
    koffi.call(called, proto, object, ...args);
}

export function release(object: Pointer): void {
  if (object !== null) {
    comMethod(object, 2, native().release)();
  }
}

export function succeeded(result: unknown): boolean {
  return Number(result) >= 0;
}

export function inApartment<T>(apply: () => T): T {
  const api = native();
  const started = Number(api.initialize(null, apartmentThreaded));
  try {
    return apply();
  } finally {
    if (started !== changedMode) {
      api.uninitialize();
    }
  }
}
