import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, suite, test } from 'vitest';
import { replaceBuiltin } from '../../../helpers/builtins';
import {
  UserSettings,
  watchSettings,
  writeAtomically,
} from '../../../../shell/main/settings';
import { plainOf, strings } from '../../../../lib/shared/strings';
import { defaultSettings, waitFor } from '../../../helpers/fixtures';
import {
  removeFolder,
  symlinkOrSkip,
  tempFolder,
} from '../../../helpers/repositories';

const defaults = defaultSettings();

async function renameFailing(
  failures: number,
  code: string,
  run: () => Promise<void>,
): Promise<number> {
  const rename = fs.promises.rename;
  let renames = 0;
  Reflect.set(fs.promises, 'rename', (...args: Parameters<typeof rename>) => {
    renames += 1;
    return renames <= failures
      ? Promise.reject(Object.assign(new Error(code), { code }))
      : rename(...args);
  });
  try {
    await run();
  } finally {
    Reflect.set(fs.promises, 'rename', rename);
  }
  return renames;
}

function watchersMade(run: () => void): fs.FSWatcher[] {
  const nodeFs = process.getBuiltinModule('node:fs');
  const { watch } = nodeFs;
  const made: fs.FSWatcher[] = [];
  replaceBuiltin(nodeFs, 'watch', (...args: Parameters<typeof watch>) => {
    const real = watch(...args);
    made.push(real);
    return real;
  });
  process.getBuiltinModule('node:module').syncBuiltinESMExports();
  try {
    run();
  } finally {
    replaceBuiltin(nodeFs, 'watch', watch);
    process.getBuiltinModule('node:module').syncBuiltinESMExports();
  }
  return made;
}

suite('User settings file', () => {
  let folder: string;
  let file: string;

  beforeEach(() => {
    folder = tempFolder('settings');
    file = path.join(folder, 'settings.user.json');
  });

  afterEach(() => removeFolder(folder));

  const written = (): unknown => JSON.parse(fs.readFileSync(file, 'utf8'));

  const noticed = async (changed: string, target?: string): Promise<void> => {
    let changes = 0;
    const stop = watchSettings(
      file,
      () => {
        changes += 1;
      },
      10,
      target,
    );
    try {
      await waitFor(() => changes > 0, 'the first check');
      changes = 0;
      await waitFor(() => {
        fs.writeFileSync(changed, JSON.stringify({ solo: true }));
        return changes > 0;
      }, 'the change');
    } finally {
      stop();
    }
  };

  test('takes in the settings as version 22 kept them, at the top of the file and with the colors named as they were, saving them where they are kept now', async () => {
    fs.writeFileSync(
      file,
      JSON.stringify({
        collapseMerges: false,
        entireFilePinned: false,
        wordWrap: false,
        showWhitespace: true,
        autoSortTabs: true,
        columnWidths: [400, 200],
        fonts: { size: '13px' },
        colors: {
          dark: {
            foreground: '#eee',
            added: '#123',
            'deleted-row': '10%',
            bubble: '#456',
            'chart-blue': '#789',
          },
        },
      }),
    );
    const user = new UserSettings(defaults, file);
    assert.deepStrictEqual(user.problems, []);
    const { settings } = user;
    assert.strictEqual(settings.tools.git.collapseMerges, false);
    assert.strictEqual(settings.tools.git.showEntireFile, false);
    assert.deepStrictEqual(settings.tools.git.columnWidths, [400, 200]);
    assert.strictEqual(settings.text.wordWrap, false);
    assert.strictEqual(settings.text.showWhitespace, true);
    assert.strictEqual(settings.colors.dark['change-added'], '#123');
    assert.strictEqual(settings.tools.git.colors.dark['graph-blue'], '#789');
    await user.saved();
    assert.deepStrictEqual(written(), {
      text: { wordWrap: false, showWhitespace: true },
      fonts: { size: '13px' },
      tools: {
        git: {
          collapseMerges: false,
          showEntireFile: false,
          columnWidths: [400, 200],
          colors: { dark: { bubble: '#456', 'graph-blue': '#789' } },
        },
      },
      colors: {
        dark: {
          foreground: '#eee',
          'change-added': '#123',
          'change-deleted-row': '10%',
        },
      },
    });
  });

  test('keeps a setting as it is kept now over the one version 22 left at the top of the file, dropping the older', async () => {
    fs.writeFileSync(
      file,
      JSON.stringify({
        wordWrap: true,
        text: { wordWrap: false },
        colors: { light: { added: '#111', 'change-added': '#222' } },
      }),
    );
    const user = new UserSettings(defaults, file);
    assert.strictEqual(user.settings.text.wordWrap, false);
    assert.strictEqual(user.settings.colors.light['change-added'], '#222');
    await user.saved();
    assert.deepStrictEqual(written(), {
      text: { wordWrap: false },
      colors: { light: { 'change-added': '#222' } },
    });
  });

  test('starts from the defaults without a file', () => {
    const user = new UserSettings(defaults, file);
    assert.deepStrictEqual(user.settings, defaults);
    assert.deepStrictEqual(user.problems, []);
  });

  test('saves only the settings changed, dropping one set back to its default', async () => {
    const user = new UserSettings(defaults, file);
    await user.setIn('git', 'ignoreWhitespace', false);
    await user.setIn('git', 'showAllFiles', true);
    await user.setImages('realSize', true);
    assert.deepStrictEqual(written(), {
      tools: { git: { ignoreWhitespace: false, showAllFiles: true } },
      images: { realSize: true },
    });
    await user.setIn('git', 'ignoreWhitespace', true);
    assert.deepStrictEqual(written(), {
      tools: { git: { showAllFiles: true } },
      images: { realSize: true },
    });
    assert.strictEqual(
      new UserSettings(defaults, file).settings.tools.git.showAllFiles,
      true,
    );
    await user.setIn('git', 'showAllFiles', false);
    await user.setImages('realSize', false);
    assert.deepStrictEqual(written(), {});
  });

  test('neither saves nor takes a value the settings would not take as written, nor none at all, keeping the one in use, as the page asking for it is not trusted', async () => {
    const user = new UserSettings(defaults, file);
    await user.setImages('realSize', true);
    await user.setImages('realSize', JSON.parse('{ "evil": "x" }'));
    await user.setImages('realSize', JSON.parse('{}').on);
    await user.setIn('git', 'diffLayout', JSON.parse('"grid"'));
    await user.setIn('git', 'columnWidths', JSON.parse('["a", null]'));
    await user.setIn('git', 'columnWidths', [Number.NaN, 200]);
    await user.setIn('git', 'autoFetch', JSON.parse('"yes"'));
    assert.deepStrictEqual(written(), { images: { realSize: true } });
    assert.strictEqual(user.settings.images.realSize, true);
    assert.deepStrictEqual(user.settings.tools, defaults.tools);
    assert.strictEqual(user.reload(), false);
    assert.deepStrictEqual(user.problems, []);
  });

  test('keeps what was written by hand when saving a change, even what it does not know', async () => {
    fs.writeFileSync(file, JSON.stringify({ sollo: true, theme: 'blue' }));
    const user = new UserSettings(defaults, file);
    await user.setIn('git', 'collapseMerges', false);
    assert.deepStrictEqual(written(), {
      sollo: true,
      theme: 'blue',
      tools: { git: { collapseMerges: false } },
    });
  });

  test('reads and saves a file an editor wrote with a byte order mark', async () => {
    fs.writeFileSync(
      file,
      `\uFEFF${JSON.stringify({ images: { realSize: true } })}`,
    );
    const user = new UserSettings(defaults, file);
    assert.strictEqual(user.settings.images.realSize, true);
    assert.deepStrictEqual(user.problems, []);
    await user.setIn('git', 'collapseMerges', false);
    assert.deepStrictEqual(written(), {
      images: { realSize: true },
      tools: { git: { collapseMerges: false } },
    });
  });

  test('says when a color group of the commander lists an extension an earlier one does, keeping the colors as written', () => {
    const colors = { light: '#000', dark: '#fff' };
    const fileColors = [
      { extensions: ['exe'], colors },
      { extensions: ['EXE', 'md'], colors },
    ];
    fs.writeFileSync(
      file,
      JSON.stringify({ tools: { commander: { fileColors } } }),
    );
    const user = new UserSettings(defaults, file);
    assert.deepStrictEqual(
      user.settings.tools.commander.fileColors,
      fileColors,
    );
    assert.deepStrictEqual(user.problems, [
      strings.settings.fileColorTwice('exe', 0, 1),
    ]);
  });

  test('neither reads nor overwrites a file that is no valid JSON', async () => {
    fs.writeFileSync(file, '{ "solo": tru');
    const user = new UserSettings(defaults, file);
    assert.deepStrictEqual(user.settings, defaults);
    assert.match(plainOf(user.problems[0] ?? ''), /not valid JSON/);
    await user.setImages('realSize', true);
    assert.strictEqual(user.settings.images.realSize, true);
    assert.strictEqual(fs.readFileSync(file, 'utf8'), '{ "solo": tru');
  });

  test('neither reads nor overwrites a file that is no JSON object', async () => {
    fs.writeFileSync(file, '[{ "solo": true }]');
    const user = new UserSettings(defaults, file);
    assert.deepStrictEqual(user.settings, defaults);
    assert.deepStrictEqual(user.problems, [
      'The user settings are not a JSON object',
    ]);
    await user.setImages('realSize', true);
    assert.strictEqual(user.settings.images.realSize, true);
    assert.strictEqual(fs.readFileSync(file, 'utf8'), '[{ "solo": true }]');
  });

  test('neither reads nor overwrites a file that cannot be read, and says so', async () => {
    fs.mkdirSync(file);
    const user = new UserSettings(defaults, file);
    assert.deepStrictEqual(user.settings, defaults);
    assert.match(plainOf(user.problems[0] ?? ''), /could not be read/);
    await user.setImages('realSize', true);
    assert.strictEqual(user.settings.images.realSize, true);
    assert.ok(fs.statSync(file).isDirectory());
    assert.ok(!fs.existsSync(`${file}.tmp`));
  });

  test('saves to the file a symlink points to, keeping the symlink', async (context) => {
    const target = path.join(folder, 'dotfiles.json');
    fs.writeFileSync(target, '{}');
    symlinkOrSkip(context, target, file);
    const user = new UserSettings(defaults, file);
    await user.setImages('realSize', true);
    assert.ok(fs.lstatSync(file).isSymbolicLink());
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(target, 'utf8')), {
      images: { realSize: true },
    });
  });

  test('saves to the file a symlink points to while that file is missing, keeping the symlink', async (context) => {
    const target = path.join(folder, 'dotfiles', 'settings.json');
    fs.mkdirSync(path.dirname(target));
    symlinkOrSkip(context, path.join('dotfiles', 'settings.json'), file);
    const user = new UserSettings(defaults, file);
    assert.deepStrictEqual(user.problems, []);
    await user.setImages('realSize', true);
    assert.ok(fs.lstatSync(file).isSymbolicLink());
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(target, 'utf8')), {
      images: { realSize: true },
    });
  });

  test('neither replaces a symlink nor makes the folder it points into while that folder is missing', async (context) => {
    const target = path.join(folder, 'dotfiles', 'settings.json');
    symlinkOrSkip(context, target, file);
    await assert.rejects(writeAtomically(file, '{}'), { code: 'ENOENT' });
    assert.ok(fs.lstatSync(file).isSymbolicLink());
    assert.ok(!fs.existsSync(path.dirname(target)));
  });

  test('checks the file once as it starts watching, as it may have changed since it was read, as while the app looks for git', async () => {
    let checks = 0;
    const stop = watchSettings(file, () => (checks += 1), 10);
    try {
      await waitFor(() => checks > 0, 'the first check');
      await new Promise((resolve) => setTimeout(resolve, 100));
      assert.strictEqual(checks, 1);
    } finally {
      stop();
    }
  });

  test('notices the file changed though the system names another file or none, as macOS does once it merges the changes of several files, and nothing while it is as it was', async () => {
    let checks = 0;
    let stop: (() => void) | undefined;
    const [watcher] = watchersMade(() => {
      stop = watchSettings(file, () => (checks += 1), 10);
    });
    try {
      await waitFor(() => checks > 0, 'the first check');
      watcher.close();
      checks = 0;
      watcher.emit('change', 'change', 'state.json');
      await new Promise((resolve) => setTimeout(resolve, 60));
      assert.strictEqual(checks, 0);
      fs.writeFileSync(file, JSON.stringify({ solo: true }));
      watcher.emit('change', 'change', 'state.json');
      await waitFor(() => checks === 1, 'the change named after another file');
      fs.writeFileSync(file, JSON.stringify({ solo: false, more: 1 }));
      watcher.emit('change', 'rename', null);
      await waitFor(() => checks === 2, 'the change named after no file');
    } finally {
      stop?.();
    }
  });

  test('notices the file changed though the system tells nothing of it, as macOS may not while it watches folders anew, by looking at the file every so often', async () => {
    let checks = 0;
    let stop: (() => void) | undefined;
    const watchers = watchersMade(() => {
      stop = watchSettings(file, () => (checks += 1), 10, file, 20);
    });
    try {
      await waitFor(() => checks > 0, 'the first check');
      for (const watcher of watchers) {
        watcher.close();
      }
      checks = 0;
      fs.writeFileSync(file, JSON.stringify({ solo: true }));
      await waitFor(() => checks > 0, 'the change seen without being told');
    } finally {
      stop?.();
    }
  });

  test('stops watching a folder whose watcher fails, rather than throwing into the main process', async () => {
    let stop: (() => void) | undefined;
    const [watcher] = watchersMade(() => {
      stop = watchSettings(file, () => {}, 10);
    });
    try {
      let closed = false;
      watcher.on('close', () => {
        closed = true;
      });
      watcher.emit(
        'error',
        Object.assign(new Error('EPERM: operation not permitted, watch'), {
          code: 'EPERM',
        }),
      );
      await waitFor(() => closed, 'the watcher to stop');
    } finally {
      stop?.();
    }
  });

  test(
    'stops watching the folder of the file a symlink points to once that folder is removed, as Windows then tells of changes in it without end',
    { timeout: 20_000 },
    async () => {
      const target = path.join(folder, 'dotfiles', 'settings.json');
      fs.mkdirSync(path.dirname(target));
      fs.writeFileSync(target, '{}');
      let stop: (() => void) | undefined;
      let changes = 0;
      const made = watchersMade(() => {
        stop = watchSettings(
          file,
          () => {
            changes += 1;
          },
          10,
          target,
        );
      });
      try {
        const closed = new Set<fs.FSWatcher>();
        for (const watcher of made) {
          watcher.on('close', () => closed.add(watcher));
        }
        await waitFor(() => changes > 0, 'the first check');
        changes = 0;
        await waitFor(() => {
          fs.writeFileSync(target, JSON.stringify({ solo: true }));
          return changes > 0;
        }, 'the watcher of the folder to start');
        fs.rmSync(path.dirname(target), { recursive: true });
        await waitFor(() => closed.size === 1, 'the watcher to stop');
        assert.strictEqual(closed.has(made[0]), false);
      } finally {
        stop?.();
      }
    },
  );

  test(
    'notices a change to the file it was given as the one the settings resolve to, in another folder, as an editor writes to the file a symlink points to',
    { timeout: 20_000 },
    async () => {
      const target = path.join(folder, 'dotfiles', 'settings.json');
      fs.mkdirSync(path.dirname(target));
      await noticed(target, target);
    },
  );

  test(
    'finds the file a symlink points to for watching',
    { timeout: 20_000 },
    async (context) => {
      const target = path.join(folder, 'dotfiles', 'settings.json');
      fs.mkdirSync(path.dirname(target));
      fs.writeFileSync(target, '{}');
      symlinkOrSkip(context, target, file);
      await noticed(target);
    },
  );

  test('saves once the file is let go, as Windows refuses to replace a file antivirus or the indexer holds for a moment', async () => {
    for (const code of ['EPERM', 'EACCES', 'EBUSY']) {
      const user = new UserSettings(defaults, file);
      const renames = await renameFailing(2, code, () =>
        user.setImages('realSize', code === 'EBUSY'),
      );
      assert.strictEqual(renames, 3);
      assert.strictEqual(
        new UserSettings(defaults, file).settings.images.realSize,
        code === 'EBUSY',
      );
    }
  });

  test('removes its temporary file when the file stays held', async () => {
    let failure: unknown;
    const renames = await renameFailing(Infinity, 'EPERM', () =>
      writeAtomically(file, '{}', [1, 1]).catch((error: unknown) => {
        failure = error;
      }),
    );
    assert.strictEqual(renames, 3);
    assert.match(String(failure), /EPERM/);
    assert.ok(!fs.existsSync(`${file}.tmp`));
    assert.ok(!fs.existsSync(file));
  });

  test('gives up at once when the file can never be replaced', async () => {
    let failure: unknown;
    const renames = await renameFailing(Infinity, 'EISDIR', () =>
      writeAtomically(file, '{}').catch((error: unknown) => {
        failure = error;
      }),
    );
    assert.strictEqual(renames, 1);
    assert.match(String(failure), /EISDIR/);
    assert.ok(!fs.existsSync(`${file}.tmp`));
  });

  test('keeps a change still being saved when reading the file its earlier save wrote', async () => {
    const user = new UserSettings(defaults, file);
    await user.setIn('git', 'collapseMerges', false);
    const saving = user.setImages('realSize', true);
    assert.strictEqual(user.reload(), false);
    assert.strictEqual(user.settings.images.realSize, true);
    await saving;
    assert.strictEqual(user.reload(), false);
    assert.strictEqual(user.settings.images.realSize, true);
  });

  test('takes a change made to the file while its own change is still being saved', async () => {
    const user = new UserSettings(defaults, file);
    await user.setIn('git', 'collapseMerges', false);
    const saving = user.setImages('realSize', true);
    fs.writeFileSync(
      file,
      JSON.stringify({
        tools: { git: { showAllFiles: !defaults.tools.git.showAllFiles } },
      }),
    );
    assert.strictEqual(user.reload(), true);
    assert.strictEqual(
      user.settings.tools.git.showAllFiles,
      !defaults.tools.git.showAllFiles,
    );
    assert.strictEqual(user.settings.images.realSize, true);
    await saving;
    assert.strictEqual(user.reload(), false);
    assert.strictEqual(
      user.settings.tools.git.showAllFiles,
      !defaults.tools.git.showAllFiles,
    );
    assert.strictEqual(user.settings.images.realSize, true);
  });

  test('keeps a change made to the file since it was read when saving its own', async () => {
    const user = new UserSettings(defaults, file);
    fs.writeFileSync(file, JSON.stringify({ images: { realSize: true } }));
    await user.setIn('git', 'collapseMerges', false);
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(file, 'utf8')), {
      images: { realSize: true },
      tools: { git: { collapseMerges: false } },
    });
    assert.strictEqual(user.reload(), true);
    assert.strictEqual(user.settings.images.realSize, true);
    assert.strictEqual(user.settings.tools.git.collapseMerges, false);
  });

  test('leaves a file broken since it was read alone when saving', async () => {
    const user = new UserSettings(defaults, file);
    fs.writeFileSync(file, '{ "solo": ');
    await user.setIn('git', 'collapseMerges', false);
    assert.strictEqual(fs.readFileSync(file, 'utf8'), '{ "solo": ');
  });

  test('leaves a file that became no JSON object since it was read alone when saving', async () => {
    const user = new UserSettings(defaults, file);
    fs.writeFileSync(file, '[]');
    await user.setIn('git', 'collapseMerges', false);
    assert.strictEqual(fs.readFileSync(file, 'utf8'), '[]');
  });

  test('reads the file again once it changes, telling a change from its own saves', async () => {
    const user = new UserSettings(defaults, file);
    await user.setIn('git', 'collapseMerges', false);
    assert.strictEqual(user.reload(), false);
    fs.writeFileSync(file, JSON.stringify({ images: { realSize: true } }));
    assert.strictEqual(user.reload(), true);
    assert.strictEqual(user.settings.images.realSize, true);
    assert.strictEqual(user.settings.tools.git.collapseMerges, true);
    assert.strictEqual(user.reload(), false);
  });

  test('takes new defaults, keeping the changes in the file over them', async () => {
    const user = new UserSettings(defaults, file);
    await user.setImages('realSize', true);
    const changed = user.replaceDefaults({
      ...defaults,
      images: { ...defaults.images, realSize: false },
      tools: {
        ...defaults.tools,
        git: { ...defaults.tools.git, collapseMerges: false },
      },
    });
    assert.strictEqual(changed, true);
    assert.strictEqual(user.settings.tools.git.collapseMerges, false);
    assert.strictEqual(user.settings.images.realSize, true);
    assert.strictEqual(user.replaceDefaults(user.defaults), false);
  });
});
