import koffi from 'koffi';

const apartmentThreaded = 0x2;
const changedMode = 0x80010106 | 0;
const longestPath = 32_768;

type Pointer = unknown;

function native() {
  const ole32 = koffi.load('ole32.dll');
  const shell32 = koffi.load('shell32.dll');
  return {
    initialize: ole32.func(
      'int32_t CoInitializeEx(void *reserved, uint32_t flags)',
    ),
    uninitialize: ole32.func('void CoUninitialize()'),
    freeMemory: ole32.func('void CoTaskMemFree(void *memory)'),
    parseName: shell32.func(
      'int32_t SHParseDisplayName(const char16_t *name, void *context, _Out_ void **list, uint32_t asked, void *attributes)',
    ),
    pathOf: shell32.func(
      'bool SHGetPathFromIDListEx(void *list, void *path, uint32_t length, int32_t options)',
    ),
  };
}

let api: ReturnType<typeof native> | undefined;

function textOf(buffer: Buffer): string {
  const all = buffer.toString('utf16le');
  const end = all.indexOf('\0');
  return end === -1 ? all : all.slice(0, end);
}

export function windowsKnownFolder(name: string): string | undefined {
  api ??= native();
  const started = Number(api.initialize(null, apartmentThreaded));
  const list: Pointer[] = [null];
  try {
    if (Number(api.parseName(name, null, list, 0, null)) < 0) {
      return undefined;
    }
    const found = Buffer.alloc(longestPath * 2);
    return api.pathOf(list[0], found, longestPath, 0) === true
      ? textOf(found)
      : undefined;
  } finally {
    if (list[0] !== null) {
      api.freeMemory(list[0]);
    }
    if (started !== changedMode) {
      api.uninitialize();
    }
  }
}
