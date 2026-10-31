import koffi, { type LibraryHandle } from 'koffi';
import type { LaunchHelper } from './elevated';
import { helperArguments, type HelperAddress } from './helper';

const flagNoUi = 0x400;
const hidden = 0;

export function quoted(argument: string): string {
  return `"${argument.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, '$1$1')}"`;
}

export function elevatedCommand(
  execPath: string,
  appPath: string | undefined,
  address: HelperAddress,
): { readonly file: string; readonly parameters: string } {
  return {
    file: execPath,
    parameters: [
      ...(appPath === undefined ? [] : [appPath]),
      ...helperArguments(address),
    ]
      .map(quoted)
      .join(' '),
  };
}

type Native = ReturnType<LibraryHandle['func']>;

let shellExecute: Native | undefined;

function shellExecuteEx(): Native {
  if (shellExecute === undefined) {
    const shell32 = koffi.load('shell32.dll');
    const info = koffi.struct('SHELLEXECUTEINFOW', {
      cbSize: 'uint32_t',
      fMask: 'uint32_t',
      hwnd: 'void *',
      lpVerb: 'const char16_t *',
      lpFile: 'const char16_t *',
      lpParameters: 'const char16_t *',
      lpDirectory: 'const char16_t *',
      nShow: 'int',
      hInstApp: 'void *',
      lpIDList: 'void *',
      lpClass: 'const char16_t *',
      hkeyClass: 'void *',
      dwHotKey: 'uint32_t',
      hIconOrMonitor: 'void *',
      hProcess: 'void *',
    });
    shellExecute = shell32.func(
      `bool ShellExecuteExW(_Inout_ ${info.name} *info)`,
    );
  }
  return shellExecute;
}

export function windowsLauncher(
  execPath: string,
  appPath: string | undefined,
): LaunchHelper {
  return (address) => {
    const native = shellExecuteEx();
    const { file, parameters } = elevatedCommand(execPath, appPath, address);
    return new Promise((resolve) => {
      native.async(
        {
          cbSize: koffi.sizeof('SHELLEXECUTEINFOW'),
          fMask: flagNoUi,
          hwnd: null,
          lpVerb: 'runas',
          lpFile: file,
          lpParameters: parameters,
          lpDirectory: null,
          nShow: hidden,
          hInstApp: null,
          lpIDList: null,
          lpClass: null,
          hkeyClass: null,
          dwHotKey: 0,
          hIconOrMonitor: null,
          hProcess: null,
        },
        (error: unknown, launched: unknown) =>
          resolve(error === null && launched === true),
      );
    });
  };
}
