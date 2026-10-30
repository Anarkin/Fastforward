import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawn } from 'node-pty';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { flowLimits } from '../../../../tools/terminal/main/flowControl';
import type { HostEvent } from '../../../../tools/terminal/main/hostProtocol';
import { PtyHost, realTimer } from '../../../../tools/terminal/main/sessions';
import { writeShellIntegration } from '../../../../tools/terminal/main/shellIntegration';
import { shellLaunch } from '../../../../tools/terminal/main/shellLaunch';
import { waitFor } from '../../../fixtures';
import { removeFolder, tempFolder } from '../../../repositories';

const windows = process.platform === 'win32';

function existing(file: string): string | undefined {
  return fs.existsSync(file) ? file : undefined;
}

function onPath(name: string): string | undefined {
  return (process.env.PATH ?? '')
    .split(path.delimiter)
    .filter(Boolean)
    .map((folder) => path.join(folder, windows ? `${name}.exe` : name))
    .find((file) => fs.existsSync(file));
}

interface UserFiles {
  readonly [file: string]: (start: string) => string;
}

interface Shell {
  readonly name: string;
  readonly file: string | undefined;
  readonly args: readonly string[];
  readonly userFiles: UserFiles;
  readonly cd: (folder: string) => string;
}

const posixCd = (folder: string) => `cd '${folder}'`;

const shells: readonly Shell[] = [
  {
    name: 'PowerShell 7',
    file: onPath('pwsh'),
    args: ['-NoLogo', '-NoProfile'],
    userFiles: {},
    cd: (folder) => `Set-Location -LiteralPath '${folder}'`,
  },
  {
    name: 'Windows PowerShell',
    file: windows ? 'powershell.exe' : undefined,
    args: ['-NoLogo', '-NoProfile'],
    userFiles: {},
    cd: (folder) => `Set-Location -LiteralPath '${folder}'`,
  },
  {
    name: 'the Command Prompt',
    file: windows ? 'cmd.exe' : undefined,
    args: [],
    userFiles: {},
    cd: (folder) => `cd /d "${folder}"`,
  },
  {
    name: 'bash',
    file: windows
      ? existing(
          path.join(
            process.env.ProgramFiles ?? 'C:\\Program Files',
            'Git',
            'bin',
            'bash.exe',
          ),
        )
      : onPath('bash'),
    args: [],
    userFiles: {
      '.bashrc': (start) =>
        `PROMPT_COMMAND="history -a; $PROMPT_COMMAND"\ncd '${start}'\n`,
    },
    cd: posixCd,
  },
  {
    name: 'zsh',
    file: onPath('zsh'),
    args: [],
    userFiles: {
      '.zshenv': () => 'ZDOTDIR=$HOME/.config/zsh\n',
      '.config/zsh/.zshrc': (start) => `cd '${start}'\n`,
    },
    cd: posixCd,
  },
  {
    name: 'fish',
    file: onPath('fish'),
    args: [],
    userFiles: {
      '.config/fish/config.fish': (start) => `cd '${start}'\n`,
    },
    cd: posixCd,
  },
];

function same(reported: string, folder: string): boolean {
  try {
    const [real, expected] = [reported, folder].map((each) =>
      fs.realpathSync.native(each),
    );
    return windows
      ? real?.toLowerCase() === expected?.toLowerCase()
      : real === expected;
  } catch {
    return false;
  }
}

function isFolder(folder: string): boolean {
  return fs.statSync(folder, { throwIfNoEntry: false })?.isDirectory() ?? false;
}

function isFile(file: string): boolean {
  return fs.statSync(file, { throwIfNoEntry: false })?.isFile() ?? false;
}

const userVariables = new Set(['ZDOTDIR', 'XDG_CONFIG_HOME', 'PROMPT_COMMAND']);

const cursorQuery = '\x1b[6n';
const cursorAtTop = '\x1b[1;1R';

let integration: string;

suite('Terminal folders in real shells', () => {
  beforeAll(() => {
    integration = tempFolder('integration');
    writeShellIntegration(integration);
  });

  afterAll(() => {
    removeFolder(integration);
  });

  for (const shell of shells) {
    test.skipIf(shell.file === undefined)(
      `has ${shell.name} tell the folder it is in at each prompt, once the files of the user are read`,
      async () => {
        const home = tempFolder('home');
        const start = path.join(home, 'start');
        const work = path.join(home, 'work');
        fs.mkdirSync(start);
        fs.mkdirSync(work);
        for (const [file, content] of Object.entries(shell.userFiles)) {
          fs.mkdirSync(path.dirname(path.join(home, file)), {
            recursive: true,
          });
          fs.writeFileSync(path.join(home, file), content(start));
        }
        const env = Object.fromEntries(
          Object.entries(process.env).filter(
            ([name]) => !userVariables.has(name.toUpperCase()),
          ),
        );
        const launch = shellLaunch(
          {
            shell: shell.file ?? '',
            shellArgs: [...shell.args],
            renderer: 'dom',
            scrollback: 1000,
            minimumContrastRatio: 1,
          },
          Object.keys(shell.userFiles).length === 0 ? start : home,
          {
            platform: process.platform,
            env: { ...env, HOME: home },
            home,
            version: '1.0.0',
            isFolder,
            isFile,
            integration,
          },
        );
        const events: HostEvent[] = [];
        let printed = '';
        const host = new PtyHost(
          (launched, columns, rows) => {
            const pty = spawn(launched.file, [...launched.args], {
              name: 'xterm-256color',
              cols: columns,
              rows,
              cwd: launched.cwd,
              env: { ...launched.env },
              useConptyDll: windows,
            });
            pty.onData((data) => {
              printed += data;
              if (data.includes(cursorQuery)) {
                pty.write(cursorAtTop);
              }
            });
            return pty;
          },
          (event) => events.push(event),
          flowLimits,
          realTimer,
        );
        const told = () =>
          events.flatMap((event) =>
            event.type === 'folder' ? [event.folder] : [],
          );
        const tells = async (folder: string) => {
          try {
            await waitFor(
              () => same(told().at(-1) ?? '', folder),
              folder,
              20_000,
            );
          } catch {
            assert.fail(
              `${shell.name} told ${JSON.stringify(told())} rather than ${folder}, having printed last ${JSON.stringify(printed.slice(-600))}`,
            );
          }
        };
        try {
          host.receive({
            type: 'spawn',
            id: '1',
            launch,
            columns: 80,
            rows: 24,
            scrollback: 1000,
          });
          await tells(start);
          host.receive({ type: 'input', id: '1', data: `${shell.cd(work)}\r` });
          await tells(work);
        } finally {
          host.dispose();
          removeFolder(home);
        }
      },
    );
  }
});
