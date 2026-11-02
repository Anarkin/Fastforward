import koffi from 'koffi';

export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

const apartmentThreaded = 0x2;
const changedMode = 0x80010106 | 0;
const extendedVerbs = 0x100;
const firstCommand = 1;
const lastCommand = 0x7fff;
const verbWide = 0x4;
const verbLength = 256;
const returnCommand = 0x100;
const rightButton = 0x2;
const unicodeMask = 0x4000;
const pointMask = 0x20000000;
const shiftMask = 0x10000000;
const showNormal = 1;
const nullMessage = 0;
const popupStyle = 0x80000000;
const menuMessages = new Set([0x2b, 0x2c, 0x117, 0x120]);
const windowClass = 'FastforwardShellMenu';

function guid(text: string): Buffer {
  const hex = text.replaceAll('-', '');
  const bytes = Buffer.alloc(16);
  bytes.writeUInt32LE(Number.parseInt(hex.slice(0, 8), 16), 0);
  bytes.writeUInt16LE(Number.parseInt(hex.slice(8, 12), 16), 4);
  bytes.writeUInt16LE(Number.parseInt(hex.slice(12, 16), 16), 6);
  Buffer.from(hex.slice(16), 'hex').copy(bytes, 8);
  return bytes;
}

const shellFolderId = guid('000214E6-0000-0000-C000-000000000046');
const contextMenuId = guid('000214E4-0000-0000-C000-000000000046');
const contextMenu3Id = guid('BCFCE0A0-EC17-11D0-8D10-00A0C90F2719');

type Pointer = unknown;

function created() {
  const ole32 = koffi.load('ole32.dll');
  const shell32 = koffi.load('shell32.dll');
  const user32 = koffi.load('user32.dll');
  const kernel32 = koffi.load('kernel32.dll');
  const invokeInfo = koffi.struct('CMINVOKECOMMANDINFOEX', {
    cbSize: 'uint32_t',
    fMask: 'uint32_t',
    hwnd: 'void *',
    lpVerb: 'uintptr_t',
    lpParameters: 'void *',
    lpDirectory: 'void *',
    nShow: 'int',
    dwHotKey: 'uint32_t',
    hIcon: 'void *',
    lpTitle: 'void *',
    lpVerbW: 'uintptr_t',
    lpParametersW: 'void *',
    lpDirectoryW: 'const char16_t *',
    lpTitleW: 'void *',
    ptInvoke: koffi.struct({ x: 'int32_t', y: 'int32_t' }),
  });
  const windowProcedure = koffi.proto(
    'intptr_t __stdcall ShellMenuWindowProcedure(void *window, uint32_t message, uintptr_t w, intptr_t l)',
  );
  const windowClassInfo = koffi.struct('ShellMenuWindowClass', {
    cbSize: 'uint32_t',
    style: 'uint32_t',
    lpfnWndProc: koffi.pointer(windowProcedure),
    cbClsExtra: 'int',
    cbWndExtra: 'int',
    hInstance: 'void *',
    hIcon: 'void *',
    hCursor: 'void *',
    hbrBackground: 'void *',
    lpszMenuName: 'void *',
    lpszClassName: 'const char16_t *',
    hIconSm: 'void *',
  });
  return {
    invokeInfo,
    windowProcedure,
    windowClassInfo,
    initialize: ole32.func(
      'int32_t CoInitializeEx(void *reserved, uint32_t flags)',
    ),
    uninitialize: ole32.func('void CoUninitialize()'),
    freeMemory: ole32.func('void CoTaskMemFree(void *memory)'),
    parseName: shell32.func(
      'int32_t SHParseDisplayName(const char16_t *name, void *context, _Out_ void **list, uint32_t asked, void *attributes)',
    ),
    bindToParent: shell32.func(
      'int32_t SHBindToParent(void *list, const void *iid, _Out_ void **parent, _Out_ void **last)',
    ),
    createMenu: user32.func('void *CreatePopupMenu()'),
    destroyMenu: user32.func('bool DestroyMenu(void *menu)'),
    itemCount: user32.func('int GetMenuItemCount(void *menu)'),
    itemId: user32.func('uint32_t GetMenuItemID(void *menu, int position)'),
    track: user32.func(
      'int TrackPopupMenuEx(void *menu, uint32_t flags, int x, int y, void *window, void *params)',
    ),
    bringForward: user32.func('bool SetForegroundWindow(void *window)'),
    postMessage: user32.func(
      'bool PostMessageW(void *window, uint32_t message, uintptr_t w, intptr_t l)',
    ),
    registerClass: user32.func(
      `uint16_t RegisterClassExW(const ${windowClassInfo.name} *info)`,
    ),
    createWindow: user32.func(
      'void *CreateWindowExW(uint32_t exStyle, const char16_t *className, const char16_t *title, uint32_t style, int x, int y, int width, int height, void *parent, void *menu, void *instance, void *param)',
    ),
    destroyWindow: user32.func('bool DestroyWindow(void *window)'),
    defaultProcedure: user32.func(
      'intptr_t DefWindowProcW(void *window, uint32_t message, uintptr_t w, intptr_t l)',
    ),
    moduleHandle: kernel32.func('void *GetModuleHandleW(const char16_t *name)'),
    release: koffi.proto('uint32_t __stdcall ShellMenuRelease(void *self)'),
    queryInterface: koffi.proto(
      'int32_t __stdcall ShellMenuQueryInterface(void *self, const void *iid, _Out_ void **object)',
    ),
    uiObjectOf: koffi.proto(
      'int32_t __stdcall ShellMenuGetUIObjectOf(void *self, void *window, uint32_t count, void *items, const void *iid, void *reserved, _Out_ void **object)',
    ),
    queryMenu: koffi.proto(
      'int32_t __stdcall ShellMenuQueryContextMenu(void *self, void *menu, uint32_t index, uint32_t first, uint32_t last, uint32_t flags)',
    ),
    invoke: koffi.proto(
      `int32_t __stdcall ShellMenuInvokeCommand(void *self, ${invokeInfo.name} *info)`,
    ),
    commandString: koffi.proto(
      'int32_t __stdcall ShellMenuGetCommandString(void *self, uintptr_t command, uint32_t kind, void *reserved, void *name, uint32_t length)',
    ),
    handleMessage: koffi.proto(
      'int32_t __stdcall ShellMenuHandleMenuMsg2(void *self, uint32_t message, uintptr_t w, intptr_t l, _Out_ intptr_t *result)',
    ),
  };
}

type Native = ReturnType<typeof created>;

let loaded: Native | undefined;

function native(): Native {
  loaded ??= created();
  return loaded;
}

const pointerSize = 8;

function method(
  object: Pointer,
  index: number,
  proto: ReturnType<typeof koffi.proto>,
) {
  const table: unknown = koffi.decode(object, 'void *');
  const called: unknown = koffi.decode(table, index * pointerSize, 'void *');
  return (...args: unknown[]): unknown =>
    koffi.call(called, proto, object, ...args);
}

function release(object: Pointer): void {
  if (object !== null) {
    method(object, 2, native().release)();
  }
}

function succeeded(result: unknown): boolean {
  return Number(result) >= 0;
}

interface ShellMenu {
  readonly handle: Pointer;
  readonly commands: Pointer;
}

function withShellMenu<T>(
  files: readonly string[],
  window: Pointer,
  extended: boolean,
  apply: (menu: ShellMenu) => T,
): T | undefined {
  const api = native();
  const started = Number(api.initialize(null, apartmentThreaded));
  const lists: Pointer[] = [];
  let folder: Pointer = null;
  let commands: Pointer = null;
  let handle: Pointer = null;
  try {
    const items = Buffer.alloc(files.length * pointerSize);
    for (const [index, file] of files.entries()) {
      const list: Pointer[] = [null];
      if (!succeeded(api.parseName(file, null, list, 0, null))) {
        return undefined;
      }
      lists.push(list[0]);
      const parent: Pointer[] = [null];
      const last: Pointer[] = [null];
      if (!succeeded(api.bindToParent(list[0], shellFolderId, parent, last))) {
        return undefined;
      }
      if (folder === null) {
        folder = parent[0];
      } else {
        release(parent[0]);
      }
      koffi.encode(items, index * pointerSize, 'void *', last[0]);
    }
    const menu: Pointer[] = [null];
    if (
      folder === null ||
      !succeeded(
        method(folder, 10, api.uiObjectOf)(
          window,
          files.length,
          items,
          contextMenuId,
          null,
          menu,
        ),
      )
    ) {
      return undefined;
    }
    [commands] = menu;
    handle = api.createMenu();
    if (
      !succeeded(
        method(commands, 3, api.queryMenu)(
          handle,
          0,
          firstCommand,
          lastCommand,
          extended ? extendedVerbs : 0,
        ),
      )
    ) {
      return undefined;
    }
    return apply({ handle, commands });
  } finally {
    if (handle !== null) {
      api.destroyMenu(handle);
    }
    release(commands);
    release(folder);
    for (const list of lists) {
      api.freeMemory(list);
    }
    if (started !== changedMode) {
      api.uninitialize();
    }
  }
}

function verbOf(commands: Pointer, command: number): string | undefined {
  const name = Buffer.alloc(verbLength * 2);
  const found = method(commands, 5, native().commandString)(
    command - firstCommand,
    verbWide,
    null,
    name,
    verbLength,
  );
  if (!succeeded(found)) {
    return undefined;
  }
  const text = name.toString('utf16le');
  const end = text.indexOf('\0');
  return end === -1 ? text : text.slice(0, end);
}

export function shellVerbs(
  files: readonly string[],
  extended: boolean,
): string[] {
  const api = native();
  return (
    withShellMenu(files, null, extended, ({ handle, commands }) => {
      const verbs: string[] = [];
      const count = Number(api.itemCount(handle));
      for (let position = 0; position < count; position++) {
        const command = Number(api.itemId(handle, position));
        const verb =
          command >= firstCommand && command <= lastCommand
            ? verbOf(commands, command)
            : undefined;
        if (verb) {
          verbs.push(verb);
        }
      }
      return verbs;
    }) ?? []
  );
}

let handling: Pointer = null;
let registered = false;

function registerWindowClass(api: Native): void {
  if (registered) {
    return;
  }
  const procedure = koffi.register(
    (window: Pointer, message: number, w: unknown, l: unknown): unknown => {
      if (handling !== null && menuMessages.has(message)) {
        const result: unknown[] = [0];
        if (
          succeeded(
            method(handling, 7, api.handleMessage)(message, w, l, result),
          )
        ) {
          return result[0];
        }
      }
      return api.defaultProcedure(window, message, w, l);
    },
    koffi.pointer(api.windowProcedure),
  );
  api.registerClass({
    cbSize: koffi.sizeof(api.windowClassInfo),
    style: 0,
    lpfnWndProc: procedure,
    cbClsExtra: 0,
    cbWndExtra: 0,
    hInstance: api.moduleHandle(null),
    hIcon: null,
    hCursor: null,
    hbrBackground: null,
    lpszMenuName: null,
    lpszClassName: windowClass,
    hIconSm: null,
  });
  registered = true;
}

export function showShellMenu(
  owner: Buffer,
  files: readonly string[],
  at: ScreenPoint,
  extended: boolean,
): void {
  const api = native();
  const parent: unknown = koffi.decode(owner, 'void *');
  registerWindowClass(api);
  withShellMenu(files, parent, extended, ({ handle, commands }) => {
    const answering: Pointer[] = [null];
    method(commands, 0, api.queryInterface)(contextMenu3Id, answering);
    const window: unknown = api.createWindow(
      0,
      windowClass,
      null,
      popupStyle,
      0,
      0,
      0,
      0,
      parent,
      null,
      api.moduleHandle(null),
      null,
    );
    try {
      handling = answering[0];
      api.bringForward(window);
      const command = Number(
        api.track(
          handle,
          returnCommand | rightButton,
          Math.round(at.x),
          Math.round(at.y),
          window,
          null,
        ),
      );
      api.postMessage(window, nullMessage, 0, 0);
      if (command >= firstCommand) {
        method(
          commands,
          4,
          api.invoke,
        )({
          cbSize: koffi.sizeof(api.invokeInfo),
          fMask: unicodeMask | pointMask | (extended ? shiftMask : 0),
          hwnd: parent,
          lpVerb: command - firstCommand,
          lpParameters: null,
          lpDirectory: null,
          nShow: showNormal,
          dwHotKey: 0,
          hIcon: null,
          lpTitle: null,
          lpVerbW: command - firstCommand,
          lpParametersW: null,
          lpDirectoryW: null,
          lpTitleW: null,
          ptInvoke: { x: Math.round(at.x), y: Math.round(at.y) },
        });
      }
    } finally {
      handling = null;
      release(answering[0]);
      api.destroyWindow(window);
    }
  });
}
