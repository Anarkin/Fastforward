import { execFile } from 'node:child_process';
import * as path from 'node:path';
import { strings } from '../lib/shared/strings';
import { installedOnWindows } from './installation';

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

export async function keepExplorerMenuIn(
  menu: readonly RegistryValue[],
  root = 'HKCU',
): Promise<readonly RegistryValue[]> {
  const keys = [...new Set(menu.map((value) => value.key))];
  const outputs = await Promise.all(
    keys
      .filter((key) => !keys.some((other) => key.startsWith(`${other}\\`)))
      .map((key) => runReg(['query', `${root}\\${key}`, '/s']).catch(() => '')),
  );
  const present = valuesInQuery(outputs.join('\n'), keys);
  const missing = menu.filter(
    (value) =>
      !present.some(
        (each) =>
          each.key === value.key &&
          each.name === value.name &&
          each.data === value.data,
      ),
  );
  await addExplorerMenu(missing, root);
  return missing;
}

export function valuesInQuery(
  output: string,
  keys: readonly string[],
): RegistryValue[] {
  const values: RegistryValue[] = [];
  let key: string | undefined;
  for (const line of output.split(/\r?\n/)) {
    if (line.startsWith('HKEY_')) {
      key = keys.find((each) => line.endsWith(`\\${each}`));
      continue;
    }
    const [, name = '', data = ''] =
      /^ {4}(.*?) {4}REG_SZ(?: {4}(.*))?$/.exec(line) ?? [];
    if (key === undefined || name === '') {
      continue;
    }
    if (name === 'Icon') {
      values.push({ key, name, data });
    } else if (name.startsWith('(') && name.endsWith(')')) {
      values.push({ key, name: undefined, data });
    }
  }
  return values;
}

function runReg(args: readonly string[]): Promise<string> {
  const reg = path.win32.join(
    process.env.SystemRoot ?? 'C:\\Windows',
    'System32',
    'reg.exe',
  );
  return new Promise((resolve, reject) => {
    execFile(reg, args, { windowsHide: true }, (error, stdout) => {
      if (error) {
        reject(error);
      } else {
        resolve(stdout);
      }
    });
  });
}
