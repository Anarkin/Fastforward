import * as assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { scriptForAppImage } from '../main/terminalCommand';
import { waitFor } from './fixtures';
import { installedGit, removeFolder, tempFolder } from './repositories';

const appFolder = path.join(__dirname, '..', '..');
const posixScript = path.join(appFolder, 'build', 'bin', 'ff');
const windowsScript = path.join(appFolder, 'build', 'bin', 'ff.cmd');

const shellRecorder = [
  '#!/bin/sh',
  '{ pwd -P; for arg do printf \'%s\\n\' "$arg"; done; } > "$FF_RECORDED.tmp"',
  'mv "$FF_RECORDED.tmp" "$FF_RECORDED"',
  '',
].join('\n');

const windowsRecorder = `
public static class Recorder {
  public static void Main(string[] args) {
    string recorded = System.Environment.GetEnvironmentVariable("FF_RECORDED");
    var lines = new System.Collections.Generic.List<string>();
    lines.Add(System.Environment.CurrentDirectory);
    lines.AddRange(args);
    System.IO.File.WriteAllLines(recorded + ".tmp", lines.ToArray());
    System.IO.File.Move(recorded + ".tmp", recorded);
    for (int waited = 0; waited < 600 && !System.IO.File.Exists(recorded + ".release"); waited++) {
      System.Threading.Thread.Sleep(50);
    }
  }
}
`;

function writeRunnable(file: string, text: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, { mode: 0o755 });
}

function compileWindowsRecorder(file: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const compiled = spawnSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `Add-Type -OutputType WindowsApplication -OutputAssembly '${file}' -TypeDefinition $env:FF_RECORDER`,
    ],
    { env: { ...process.env, FF_RECORDER: windowsRecorder } },
  );
  assert.strictEqual(compiled.status, 0, String(compiled.stderr));
}

async function shellFolder(): Promise<string | undefined> {
  if (process.platform !== 'win32') {
    return undefined;
  }
  let folder = path.dirname(await installedGit());
  while (!fs.existsSync(path.join(folder, 'usr', 'bin', 'sh.exe'))) {
    const parent = path.dirname(folder);
    assert.notStrictEqual(parent, folder, 'no sh beside git');
    folder = parent;
  }
  return path.join(folder, 'usr', 'bin');
}

function asSeen(file: string): string {
  return process.platform === 'win32' ? path.resolve(file) : file;
}

function forShell(file: string): string {
  return file.replaceAll('\\', '/');
}

async function recorded(file: string): Promise<string[]> {
  await waitFor(() => fs.existsSync(file), `${file} to be recorded`);
  return fs.readFileSync(file, 'utf8').trimEnd().split(/\r?\n/);
}

suite('ff', () => {
  let folder: string;
  let work: string;
  let tools: string | undefined;
  let sh: string;
  let shellWork: string;
  let recordings = 0;

  beforeAll(async () => {
    folder = fs.realpathSync.native(tempFolder('ff'));
    work = path.join(folder, 'work');
    fs.mkdirSync(work);
    tools = await shellFolder();
    sh = tools === undefined ? 'sh' : path.join(tools, 'sh.exe');
    shellWork = String(
      spawnSync(sh, ['-c', 'pwd -P'], { cwd: work }).stdout,
    ).trim();
  });

  afterAll(() => removeFolder(folder));

  function nextRecording(): string {
    recordings++;
    return path.join(folder, `recorded-${recordings}`);
  }

  function runPosix(
    script: string,
    system: string,
    args: readonly string[],
    recording: string,
  ): void {
    const fakes = path.join(folder, `fakes-${system}`);
    writeRunnable(path.join(fakes, 'uname'), `#!/bin/sh\necho ${system}\n`);
    writeRunnable(path.join(fakes, 'open'), shellRecorder);
    const searched = [fakes, ...(tools === undefined ? [] : [tools])];
    const ran = spawnSync(sh, [script, ...args], {
      cwd: work,
      env: {
        ...process.env,
        PATH: [...searched, process.env.PATH].join(path.delimiter),
        FF_RECORDED: forShell(recording),
      },
      timeout: 10_000,
    });
    assert.strictEqual(ran.status, 0, String(ran.stderr));
  }

  test('opens the folder it is run in when given none, and the folders given, made absolute, after -- so none passes for a switch', async () => {
    const launcher = path.join(folder, 'linux', 'fastforward.AppImage');
    writeRunnable(launcher, shellRecorder);
    const copy = path.join(folder, 'linux', 'bin', 'ff');
    writeRunnable(
      copy,
      scriptForAppImage(
        fs.readFileSync(posixScript, 'utf8'),
        forShell(launcher),
      ),
    );
    const none = nextRecording();
    runPosix(copy, 'Linux', [], none);
    assert.deepStrictEqual((await recorded(none)).slice(1), ['--', shellWork]);
    const given = nextRecording();
    runPosix(copy, 'Linux', ['a b', '/elsewhere/x', '--flag'], given);
    assert.deepStrictEqual((await recorded(given)).slice(1), [
      '--',
      `${shellWork}/a b`,
      '/elsewhere/x',
      `${shellWork}/--flag`,
    ]);
  });

  test('runs the app in the terminal it is run in with --term, waiting for it rather than leaving it in the background, on Linux and macOS', async () => {
    const launcher = path.join(folder, 'linux-term', 'fastforward.AppImage');
    writeRunnable(launcher, shellRecorder);
    const copy = path.join(folder, 'linux-term', 'bin', 'ff');
    writeRunnable(
      copy,
      scriptForAppImage(
        fs.readFileSync(posixScript, 'utf8'),
        forShell(launcher),
      ),
    );
    const linux = nextRecording();
    runPosix(copy, 'Linux', ['--term', 'repo'], linux);
    assert.deepStrictEqual((await recorded(linux)).slice(1), [
      '--term',
      '--',
      `${shellWork}/repo`,
    ]);
    const app = path.join(folder, 'mac-term', 'Fastforward.app');
    writeRunnable(
      path.join(app, 'Contents', 'Resources', 'bin', 'ff'),
      fs.readFileSync(posixScript, 'utf8'),
    );
    writeRunnable(
      path.join(app, 'Contents', 'MacOS', 'Fastforward'),
      shellRecorder,
    );
    const mac = nextRecording();
    runPosix(
      path.join(app, 'Contents', 'Resources', 'bin', 'ff'),
      'Darwin',
      ['--term'],
      mac,
    );
    assert.deepStrictEqual((await recorded(mac)).slice(1), [
      '--term',
      '--',
      shellWork,
    ]);
  });

  test('starts the app the .deb installs, at /opt/<product name>/<name>, where electron-builder puts it', () => {
    const { name, productName } = JSON.parse(
      fs.readFileSync(path.join(appFolder, 'package.json'), 'utf8'),
    );
    assert.ok(
      fs
        .readFileSync(posixScript, 'utf8')
        .includes(`\${fastforward_appimage:-/opt/${productName}/${name}}`),
    );
  });

  test('opens the folders through open on macOS, starting another copy of the app bundle it is in, by any link to it, as open passes no folders to the copy running, while the new one hands them over', async () => {
    const app = path.join(folder, 'mac', 'Fastforward.app');
    const bundled = path.join(app, 'Contents', 'Resources', 'bin', 'ff');
    writeRunnable(bundled, fs.readFileSync(posixScript, 'utf8'));
    const shellApp = String(
      spawnSync(sh, ['-c', 'pwd -P'], { cwd: app }).stdout,
    ).trim();
    const runs = [bundled];
    if (process.platform !== 'win32') {
      const linked = path.join(folder, 'mac', 'usr', 'local', 'bin', 'ff');
      fs.mkdirSync(path.dirname(linked), { recursive: true });
      fs.symlinkSync(bundled, linked);
      const chained = path.join(folder, 'mac', 'links', 'ff');
      fs.mkdirSync(path.dirname(chained), { recursive: true });
      fs.symlinkSync(path.join('..', 'usr', 'local', 'bin', 'ff'), chained);
      runs.push(linked, chained);
    }
    for (const run of runs) {
      const recording = nextRecording();
      runPosix(run, 'Darwin', ['repo'], recording);
      assert.deepStrictEqual((await recorded(recording)).slice(1), [
        '-n',
        '-a',
        shellApp,
        '--args',
        '--',
        `${shellWork}/repo`,
      ]);
    }
  });

  test(
    'starts the Fastforward.exe beside its folder from Git Bash on Windows, keeping Windows paths as they are',
    { timeout: 30_000 },
    async () => {
      const bin = path.join(folder, 'windows', 'bin');
      writeRunnable(path.join(bin, 'ff'), fs.readFileSync(posixScript, 'utf8'));
      const app = path.join(folder, 'windows', 'Fastforward.exe');
      if (process.platform === 'win32') {
        compileWindowsRecorder(app);
      } else {
        writeRunnable(app, shellRecorder);
      }
      const recording = nextRecording();
      try {
        runPosix(
          path.join(bin, 'ff'),
          'MINGW64_NT-10.0-26300',
          ['repo', 'C:/elsewhere'],
          recording,
        );
        const [, terminator, ...folders] = await recorded(recording);
        assert.strictEqual(terminator, '--');
        assert.deepStrictEqual(folders.map(asSeen), [
          asSeen(
            process.platform === 'win32'
              ? path.join(work, 'repo')
              : `${shellWork}/repo`,
          ),
          asSeen('C:/elsewhere'),
        ]);
      } finally {
        fs.writeFileSync(`${recording}.release`, '');
      }
    },
  );

  test('ships beside Fastforward.exe on Windows, with ff.cmd, among the resources on macOS and Linux, for the app to link or copy, and as /usr/bin/ff in the .deb', () => {
    const { build } = JSON.parse(
      fs.readFileSync(path.join(appFolder, 'package.json'), 'utf8'),
    );
    assert.deepStrictEqual(build.win.extraFiles, [
      { from: 'build/bin', to: 'bin', filter: ['ff', 'ff.cmd'] },
    ]);
    for (const platform of ['mac', 'linux']) {
      assert.deepStrictEqual(
        build[platform].extraResources,
        [{ from: 'build/bin/ff', to: 'bin/ff' }],
        platform,
      );
    }
    assert.deepStrictEqual(build.deb.fpm, ['build/bin/ff=/usr/bin/ff']);
    assert.strictEqual(build.nsis.include, 'build/installer.nsh');
  });

  test('is kept runnable in git, as the macOS and Linux builds take its mode from the checkout', async () => {
    const listed = spawnSync(
      await installedGit(),
      ['ls-files', '--stage', '--', 'build/bin/ff'],
      { cwd: appFolder },
    );
    assert.match(String(listed.stdout), /^100755 /);
  });

  suite.skipIf(process.platform !== 'win32')(
    'ff.cmd',
    { timeout: 30_000 },
    () => {
      let bin: string;

      beforeAll(() => {
        bin = path.join(folder, 'cmd', 'bin');
        fs.mkdirSync(bin, { recursive: true });
        fs.copyFileSync(windowsScript, path.join(bin, 'ff.cmd'));
        compileWindowsRecorder(path.join(folder, 'cmd', 'Fastforward.exe'));
      });

      async function runCmd(line: string): Promise<string[]> {
        const recording = nextRecording();
        try {
          const ran = spawnSync('cmd.exe', ['/d', '/c', line], {
            cwd: work,
            env: {
              ...process.env,
              PATH: [bin, process.env.PATH].join(path.delimiter),
              FF_RECORDED: recording,
            },
            windowsVerbatimArguments: true,
            timeout: 10_000,
          });
          assert.strictEqual(ran.status, 0, String(ran.stderr));
          return await recorded(recording);
        } finally {
          fs.writeFileSync(`${recording}.release`, '');
        }
      }

      test('opens the folder it is run in when given none, starting the Fastforward.exe beside its folder with none of its handles, so neither the terminal nor a program reading its output waits for the app to quit', async () => {
        assert.deepStrictEqual(await runCmd('ff'), [work, '--', '.']);
      });

      test('passes the folders given after --, as given, for the app to resolve from the folder it starts in', async () => {
        assert.deepStrictEqual(
          await runCmd('ff "a b" --flag "C:\\Program Files (x86)\\x"'),
          [work, '--', 'a b', '--flag', 'C:\\Program Files (x86)\\x'],
        );
      });

      test('runs the app in the terminal it is run in with --term, waiting for it, with the folders given after it', async () => {
        const recording = nextRecording();
        fs.writeFileSync(`${recording}.release`, '');
        const ran = spawnSync('cmd.exe', ['/d', '/c', 'ff --term "a b" c'], {
          cwd: work,
          env: {
            ...process.env,
            PATH: [bin, process.env.PATH].join(path.delimiter),
            FF_RECORDED: recording,
          },
          windowsVerbatimArguments: true,
          timeout: 10_000,
        });
        assert.strictEqual(ran.status, 0, String(ran.stderr));
        assert.ok(fs.existsSync(recording), 'recorded before ff returned');
        assert.deepStrictEqual(await recorded(recording), [
          work,
          '--term',
          '--',
          'a b',
          'c',
        ]);
      });

      test('keeps its lines ending in CRLF, as cmd misreads some batch files without', () => {
        const text = fs.readFileSync(windowsScript, 'utf8');
        assert.ok(text.length > 0);
        assert.doesNotMatch(text, /(?<!\r)\n/);
      });
    },
  );
});
