import koffi from 'koffi';
import { textOf } from './nativeCalls';
import { inApartment, type Pointer } from './windowsCom';

const longestPath = 32_768;

function native() {
  const ole32 = koffi.load('ole32.dll');
  const shell32 = koffi.load('shell32.dll');
  return {
    freeMemory: ole32.func('void CoTaskMemFree(void *memory)'),
    parseName: shell32.func(
      'int32_t SHParseDisplayName(const char16_t *name, void *context, _Out_ void **list, uint32_t asked, void *attributes)',
    ),
    pathOf: shell32.func(
      'bool SHGetPathFromIDListEx(void *list, void *path, uint32_t length, int32_t options)',
    ),
  };
}

let loaded: ReturnType<typeof native> | undefined;

export function windowsKnownFolder(name: string): string | undefined {
  loaded ??= native();
  const api = loaded;
  return inApartment(() => {
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
    }
  });
}
