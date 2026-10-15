import { execFile } from 'node:child_process';
import * as path from 'node:path';
import { strings } from '../shared/strings';
import { installedOnWindows } from './updates';

export interface RegistryValue {
  readonly key: string;
  readonly name: string | undefined;
  readonly data: string;
}

const menuKeys = [
  'Software\\Classes\\Directory\\shell\\Fastforward',
  'Software\\Classes\\Directory\\Background\\shell\\Fastforward',
];

export function explorerMenuOf(
  platform: NodeJS.Platform,
  executable: string,
  exists?: (file: string) => boolean,
): readonly RegistryValue[] | undefined {
  if (platform !== 'win32' || !installedOnWindows(executable, exists)) {
    return undefined;
  }
  return menuKeys.flatMap((key) => [
    { key, name: undefined, data: strings.app.explorerMenuEntry },
    { key, name: 'Icon', data: executable },
    {
      key: `${key}\\command`,
      name: undefined,
      data: `"${executable}" -- "%V\\."`,
    },
  ]);
}

export async function addExplorerMenu(
  menu: readonly RegistryValue[],
  root = 'HKCU',
): Promise<void> {
  await Promise.all(
    menu.map((value) =>
      runReg([
        'add',
        `${root}\\${value.key}`,
        ...(value.name === undefined ? ['/ve'] : ['/v', value.name]),
        '/t',
        'REG_SZ',
        '/d',
        value.data,
        '/f',
      ]),
    ),
  );
}

function runReg(args: readonly string[]): Promise<void> {
  const reg = path.win32.join(
    process.env.SystemRoot ?? 'C:\\Windows',
    'System32',
    'reg.exe',
  );
  return new Promise((resolve, reject) => {
    execFile(reg, args, { windowsHide: true }, (error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}
