import * as assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, suite, test } from 'vitest';
import {
  playgroundScripts,
  runPlayground,
  stopPlaygrounds,
  type Ran,
} from './playgroundRuns';
import { removeFolder, tempFolder } from '../../helpers/repositories';

const playground = (folder: string, ...flags: string[]): Promise<Ran> =>
  runPlayground('files.mts', folder, ...flags);

const name = 'Fastforward-playground-files';
const builds = 180_000;
const windows = process.platform === 'win32';
const everyone = '*S-1-1-0';

type Platform = 'win32' | 'darwin' | 'linux';

interface Item {
  readonly kind: string;
  readonly path: string;
  readonly content?: () => string | Buffer;
  readonly size?: number;
  readonly mode?: number;
  readonly modified?: Date;
  readonly target?: string;
  readonly from?: string;
  readonly hidden?: true;
  readonly system?: true;
  readonly readOnly?: true;
  readonly unreadable?: true;
  readonly flaggedHidden?: true;
  readonly config?: Readonly<Record<string, string>>;
}

interface FilesPlan {
  readonly plan: (options: { readonly platform: Platform }) => {
    readonly items: readonly Item[];
  };
}

interface Made {
  readonly locked: readonly string[];
  readonly readOnly: readonly string[];
  readonly skipped: readonly string[];
}

const platform: Platform =
  process.platform === 'win32' || process.platform === 'darwin'
    ? process.platform
    : 'linux';

const output = (command: string, ...args: string[]) =>
  execFileSync(command, args, { encoding: 'utf8' });

suite('Playground of files on disk', () => {
  let folder: string;
  let root: string;
  let items: readonly Item[];
  let made: Made;

  const at = (where: string) => path.join(root, ...where.split('/'));
  const madeOf = (): Made =>
    JSON.parse(
      fs.readFileSync(path.join(root, '.fastforward-playground.json'), 'utf8'),
    );
  const leftOut = (reason: string) =>
    made.skipped.some((skipped) => skipped.startsWith(reason));
  const unlocked = () => {
    for (const where of made.locked) {
      if (windows) {
        execFileSync('icacls', [at(where), '/remove:d', everyone], {
          stdio: 'ignore',
        });
      } else {
        fs.chmodSync(at(where), 0o755);
      }
    }
  };

  beforeAll(async () => {
    folder = tempFolder('files-playground');
    root = path.join(folder, name);
    const ran = await playground(folder);
    assert.strictEqual(ran.code, 0, ran.output);
    const { plan }: FilesPlan = await import(
      pathToFileURL(path.join(playgroundScripts, 'filesPlan.mts')).href
    );
    items = plan({ platform }).items;
    made = madeOf();
  }, builds);

  afterAll(async () => {
    await stopPlaygrounds();
    unlocked();
    removeFolder(folder);
  }, 60_000);

  const ofKind = (kind: string) => items.filter((item) => item.kind === kind);

  test('writes every file of its plan with the content the plan gives it, and the files of a given size at that size', () => {
    for (const item of ofKind('file')) {
      if (made.locked.some((where) => item.path.startsWith(`${where}/`))) {
        continue;
      }
      assert.ok(
        fs
          .readFileSync(at(item.path))
          .equals(Buffer.from(item.content?.() ?? '')),
        item.path,
      );
    }
    for (const item of ofKind('chunks')) {
      if (item.size !== undefined) {
        assert.strictEqual(
          fs.statSync(at(item.path)).size,
          item.size,
          item.path,
        );
      }
    }
    for (const item of ofKind('copy')) {
      assert.strictEqual(
        fs.statSync(at(item.path)).size,
        fs.statSync(item.from ?? '').size,
        item.path,
      );
    }
    assert.match(
      fs.readFileSync(at('README.md'), 'utf8'),
      /^# Playground of files/,
    );
  });

  test('stores the file over 4 GiB sparse, taking next to no room on the disk, and an image over the size the viewer previews', () => {
    for (const item of ofKind('sparse')) {
      const full = at(item.path);
      assert.strictEqual(fs.statSync(full).size, item.size, item.path);
      if (windows) {
        assert.strictEqual(
          output(
            'powershell',
            '-NoProfile',
            '-Command',
            `[int]((Get-Item -LiteralPath '${full}').Attributes -band [IO.FileAttributes]::SparseFile)`,
          ).trim(),
          '512',
          item.path,
        );
      } else {
        assert.ok(fs.statSync(full).blocks * 512 < 1024 * 1024, item.path);
      }
    }
  });

  test('links to a file, a folder, nothing and each other, and on Windows makes a junction, unless Windows lets it make no links, which it says', () => {
    if (!leftOut('links')) {
      for (const item of ofKind('link')) {
        const full = at(item.path);
        assert.ok(fs.lstatSync(full).isSymbolicLink(), item.path);
        assert.strictEqual(
          fs.readlinkSync(full),
          path.normalize(item.target ?? ''),
          item.path,
        );
      }
    } else {
      assert.ok(windows);
    }
    for (const item of ofKind('junction')) {
      assert.ok(fs.lstatSync(at(item.path)).isSymbolicLink(), item.path);
      assert.ok(fs.statSync(at(item.path)).isDirectory(), item.path);
    }
  });

  test('hides files by their attribute on Windows, marks a system file and one hidden by its flag on macOS, makes files read-only, and locks a folder no one may read', () => {
    for (const item of ofKind('file')) {
      const full = at(item.path);
      if (windows && (item.hidden === true || item.system === true)) {
        const attributes = output('attrib', full).slice(0, 12);
        assert.strictEqual(
          attributes.includes('H'),
          item.hidden === true,
          item.path,
        );
        assert.strictEqual(
          attributes.includes('S'),
          item.system === true,
          item.path,
        );
      }
      if (item.flaggedHidden === true) {
        assert.match(output('stat', '-f', '%Sf', full), /hidden/);
      }
      if (item.readOnly === true) {
        assert.throws(() => fs.accessSync(full, fs.constants.W_OK), item.path);
      }
    }
    assert.ok(made.locked.length > 0);
    for (const where of made.locked) {
      if (process.getuid?.() !== 0) {
        assert.throws(() => fs.readdirSync(at(where)), where);
      }
    }
  });

  test('sets the exec bit of the programs on macOS and Linux, and leaves it off the script that lacks it', (context) => {
    if (windows) {
      context.skip();
    }
    for (const item of ofKind('file')) {
      if (item.mode !== undefined) {
        assert.strictEqual(
          fs.statSync(at(item.path)).mode & 0o777,
          item.mode,
          item.path,
        );
      }
    }
  });

  test('dates files and a folder as its plan does, from 1980 to past 2038', () => {
    for (const item of items) {
      if (item.modified !== undefined) {
        assert.strictEqual(
          Math.round(fs.statSync(at(item.path)).mtimeMs / 1000),
          item.modified.getTime() / 1000,
          item.path,
        );
      }
    }
  });

  test('makes git repositories inside, with the config the plan gives them, while the rest is in none', () => {
    for (const item of ofKind('repository')) {
      assert.strictEqual(
        fs.realpathSync.native(
          output(
            'git',
            '-C',
            at(item.path),
            'rev-parse',
            '--show-toplevel',
          ).trim(),
        ),
        fs.realpathSync.native(at(item.path)),
      );
      for (const [key, value] of Object.entries(item.config ?? {})) {
        assert.strictEqual(
          output('git', '-C', at(item.path), 'config', '--get', key).trim(),
          value,
        );
      }
    }
    assert.throws(() =>
      execFileSync('git', ['-C', at('colors'), 'rev-parse', '--git-dir'], {
        stdio: 'ignore',
      }),
    );
  });

  test(
    'makes the playground anew over one it made, unlocking what it locked, and with --churn over it keeps changing the churn folder without making it anew',
    async () => {
      fs.writeFileSync(at('stray.txt'), 'left by hand');
      const ran = await playground(folder);
      assert.strictEqual(ran.code, 0, ran.output);
      assert.ok(!fs.existsSync(at('stray.txt')));
      made = madeOf();
      const readme = fs.statSync(at('README.md')).mtimeMs;
      void playground(folder, '--churn');
      const growing = at('churn/growing.log');
      for (let waited = 0; !fs.existsSync(growing) && waited < 200; waited++) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      await stopPlaygrounds();
      assert.match(fs.readFileSync(growing, 'utf8'), /^tick 1$/m);
      assert.strictEqual(fs.statSync(at('README.md')).mtimeMs, readme);
    },
    builds,
  );

  test('leaves alone a folder of its name that it did not make, saying so', async () => {
    const other = tempFolder('files-playground-other');
    try {
      const kept = path.join(other, name, 'kept.txt');
      fs.mkdirSync(path.dirname(kept));
      fs.writeFileSync(kept, 'mine');
      const ran = await playground(other);
      assert.notStrictEqual(ran.code, 0);
      assert.ok(ran.output.includes(name), ran.output);
      assert.strictEqual(fs.readFileSync(kept, 'utf8'), 'mine');
    } finally {
      removeFolder(other);
    }
  });
});
