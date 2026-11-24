import koffi from 'koffi';
import type { ElectronApplication } from 'playwright-core';
import {
  comMethod,
  guid,
  inApartment,
  release,
  succeeded,
} from '../../tools/commander/main/windowsCom';
import { protoOnce } from '../../lib/main/koffiTypes';

const propertyStore = '886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99';

const appUserModelId = {
  format: '9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3',
  id: 5,
};

const wideString = 31;

const getValueAt = 5;

function propertyKey(): Buffer {
  const key = Buffer.alloc(20);
  guid(appUserModelId.format).copy(key, 0);
  key.writeUInt32LE(appUserModelId.id, 16);
  return key;
}

export function windowHandles(app: ElectronApplication): Promise<number[][]> {
  return app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .filter((window) => window.isVisible())
      .map((window) => [...window.getNativeWindowHandle()]),
  );
}

export function appIdsOf(handles: readonly number[][]): (string | undefined)[] {
  const shell32 = koffi.load('shell32.dll');
  const ole32 = koffi.load('ole32.dll');
  const storeOf = shell32.func(
    'int32_t SHGetPropertyStoreForWindow(void *window, void *iid, _Out_ void **store)',
  );
  const clear = ole32.func('int32_t PropVariantClear(void *value)');
  const getValue = protoOnce(
    'int32_t __stdcall WindowAppIdGetValue(void *self, void *key, void *value)',
  );
  return inApartment(() =>
    handles.map((handle) => {
      const window: unknown = koffi.decode(Buffer.from(handle), 'void *');
      const store: unknown[] = [null];
      if (!succeeded(storeOf(window, guid(propertyStore), store))) {
        return undefined;
      }
      const [object] = store;
      const value = Buffer.alloc(24);
      try {
        if (
          !succeeded(
            comMethod(object, getValueAt, getValue)(propertyKey(), value),
          ) ||
          value.readUInt16LE(0) !== wideString
        ) {
          return undefined;
        }
        const text: unknown = koffi.decode(
          koffi.decode(value, 8, 'void *'),
          'char16_t',
          -1,
        );
        return typeof text === 'string' ? text : undefined;
      } finally {
        clear(value);
        release(object);
      }
    }),
  );
}
