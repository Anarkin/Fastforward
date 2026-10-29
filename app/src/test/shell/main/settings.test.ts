import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, suite, test } from 'vitest';
import { replaceBuiltin } from '../../builtins';
import {
  mergeSettings,
  overridesOf,
  UserSettings,
  watchSettings,
  writeAtomically,
  writeReadOnly,
} from '../../../shell/main/settings';
import { defaultSettings, waitFor } from '../../fixtures';
import { removeFolder, symlinkOrSkip, tempFolder } from '../../repositories';

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

suite('Settings', () => {
  test('takes each setting the user changed over its default', () => {
    const { settings, problems } = mergeSettings(defaults, {
      autoSortTabs: true,
      tools: { git: { ignoreWhitespace: false, columnWidths: [300, 200] } },
    });
    assert.deepStrictEqual(settings, {
      ...defaults,
      autoSortTabs: true,
      tools: {
        ...defaults.tools,
        git: {
          ...defaults.tools.git,
          ignoreWhitespace: false,
          columnWidths: [300, 200],
        },
      },
    });
    assert.deepStrictEqual(problems, []);
  });

  test('merges nested settings one key at a time', () => {
    const nested = { colors: { light: { a: '#111', b: '#222' } } };
    assert.deepStrictEqual(
      mergeSettings(nested, { colors: { light: { b: '#333' } } }).settings,
      { colors: { light: { a: '#111', b: '#333' } } },
    );
  });

  test('keeps the default of a setting it does not know or of the wrong kind, and says why', () => {
    const { settings, problems } = mergeSettings(defaults, {
      ignoreWhitespace: false,
      tools: {
        git: { ignoreWhitespaces: false, solo: 'yes', columnWidths: ['wide'] },
      },
    });
    assert.deepStrictEqual(settings, defaults);
    assert.deepStrictEqual(problems, [
      'Unknown setting "ignoreWhitespace"',
      'Unknown setting "tools.git.ignoreWhitespaces"',
      '"tools.git.solo" should be a boolean',
      '"tools.git.columnWidths" should be a list of numbers',
    ]);
  });

  test('takes no null, list or object for a setting of another kind', () => {
    const { settings, problems } = mergeSettings(defaults, {
      fonts: null,
      sizes: ['20px'],
      tools: { git: { solo: {}, autoFetchMinutes: [1] } },
    });
    assert.deepStrictEqual(settings, defaults);
    assert.deepStrictEqual(problems, [
      '"fonts" should be an object',
      '"sizes" should be an object',
      '"tools.git.solo" should be a boolean',
      '"tools.git.autoFetchMinutes" should be a number',
    ]);
    assert.deepStrictEqual(mergeSettings({ list: [] }, { list: 1 }).problems, [
      '"list" should be a list',
    ]);
  });

  test('takes any list for a setting whose default list is empty, as no item of it tells the kind', () => {
    assert.deepStrictEqual(
      mergeSettings({ list: [] }, { list: ['-l', '-i'] }),
      {
        settings: { list: ['-l', '-i'] },
        problems: [],
      },
    );
  });

  test('knows no setting by a name every object has', () => {
    const { settings, problems } = mergeSettings(
      defaults,
      JSON.parse('{ "toString": 1, "__proto__": { "solo": true } }'),
    );
    assert.deepStrictEqual(settings, defaults);
    assert.strictEqual(Object.getPrototypeOf(settings), Object.prototype);
    assert.deepStrictEqual(problems, [
      'Unknown setting "toString"',
      'Unknown setting "__proto__"',
    ]);
  });

  test('keeps the default of a setting set to none of its choices, and names them', () => {
    const { settings, problems } = mergeSettings(defaults, {
      tools: { git: { diffLayout: 'sideways' } },
    });
    assert.deepStrictEqual(settings, defaults);
    assert.deepStrictEqual(problems, [
      '"tools.git.diffLayout" should be "inline" or "sideBySide"',
    ]);
    assert.strictEqual(
      mergeSettings(defaults, { tools: { git: { diffLayout: 'inline' } } })
        .settings.tools.git.diffLayout,
      'inline',
    );
  });

  test('keeps the defaults for user settings that are no object', () => {
    assert.deepStrictEqual(mergeSettings(defaults, [1]), {
      settings: defaults,
      problems: ['The user settings are not a JSON object'],
    });
  });

  test('keeps only what differs from the defaults as the user settings', () => {
    assert.deepStrictEqual(
      overridesOf(defaults, {
        ...defaults,
        tools: {
          ...defaults.tools,
          git: {
            ...defaults.tools.git,
            solo: true,
            columnWidths: [...defaults.tools.git.columnWidths],
          },
        },
      }),
      { tools: { git: { solo: true } } },
    );
  });
});

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

  test('starts from the defaults without a file', () => {
    const user = new UserSettings(defaults, file);
    assert.deepStrictEqual(user.settings, defaults);
    assert.deepStrictEqual(user.problems, []);
  });

  test('saves only the settings changed, dropping one set back to its default', async () => {
    const user = new UserSettings(defaults, file);
    await user.setIn('git', 'ignoreWhitespace', false);
    await user.setIn('git', 'showAllFiles', true);
    await user.set('autoSortTabs', true);
    assert.deepStrictEqual(written(), {
      tools: { git: { ignoreWhitespace: false, showAllFiles: true } },
      autoSortTabs: true,
    });
    await user.setIn('git', 'ignoreWhitespace', true);
    assert.deepStrictEqual(written(), {
      tools: { git: { showAllFiles: true } },
      autoSortTabs: true,
    });
    assert.strictEqual(
      new UserSettings(defaults, file).settings.tools.git.showAllFiles,
      true,
    );
    await user.setIn('git', 'showAllFiles', false);
    await user.set('autoSortTabs', false);
    assert.deepStrictEqual(written(), {});
  });

  test('neither saves nor takes a value the settings would not take as written, nor none at all, keeping the one in use, as the page asking for it is not trusted', async () => {
    const user = new UserSettings(defaults, file);
    await user.set('autoSortTabs', true);
    await user.set('autoSortTabs', JSON.parse('{ "evil": "x" }'));
    await user.set('autoSortTabs', JSON.parse('{}').on);
    await user.setIn('git', 'diffLayout', JSON.parse('"grid"'));
    await user.setIn('git', 'columnWidths', JSON.parse('["a", null]'));
    await user.setIn('git', 'columnWidths', [Number.NaN, 200]);
    await user.setIn('git', 'autoFetch', JSON.parse('"yes"'));
    assert.deepStrictEqual(written(), { autoSortTabs: true });
    assert.strictEqual(user.settings.autoSortTabs, true);
    assert.deepStrictEqual(user.settings.tools, defaults.tools);
    assert.strictEqual(user.reload(), false);
    assert.deepStrictEqual(user.problems, []);
  });

  test('keeps what was written by hand when saving a change, even what it does not know', async () => {
    fs.writeFileSync(file, JSON.stringify({ sollo: true, solo: 'yes' }));
    const user = new UserSettings(defaults, file);
    await user.setIn('git', 'collapseMerges', false);
    assert.deepStrictEqual(written(), {
      sollo: true,
      solo: 'yes',
      tools: { git: { collapseMerges: false } },
    });
  });

  test('reads and saves a file an editor wrote with a byte order mark', async () => {
    fs.writeFileSync(file, `\uFEFF${JSON.stringify({ autoSortTabs: true })}`);
    const user = new UserSettings(defaults, file);
    assert.strictEqual(user.settings.autoSortTabs, true);
    assert.deepStrictEqual(user.problems, []);
    await user.setIn('git', 'collapseMerges', false);
    assert.deepStrictEqual(written(), {
      autoSortTabs: true,
      tools: { git: { collapseMerges: false } },
    });
  });

  test('neither reads nor overwrites a file that is no valid JSON', async () => {
    fs.writeFileSync(file, '{ "solo": tru');
    const user = new UserSettings(defaults, file);
    assert.deepStrictEqual(user.settings, defaults);
    assert.match(user.problems[0] ?? '', /not valid JSON/);
    await user.set('autoSortTabs', true);
    assert.strictEqual(user.settings.autoSortTabs, true);
    assert.strictEqual(fs.readFileSync(file, 'utf8'), '{ "solo": tru');
  });

  test('neither reads nor overwrites a file that is no JSON object', async () => {
    fs.writeFileSync(file, '[{ "solo": true }]');
    const user = new UserSettings(defaults, file);
    assert.deepStrictEqual(user.settings, defaults);
    assert.deepStrictEqual(user.problems, [
      'The user settings are not a JSON object',
    ]);
    await user.set('autoSortTabs', true);
    assert.strictEqual(user.settings.autoSortTabs, true);
    assert.strictEqual(fs.readFileSync(file, 'utf8'), '[{ "solo": true }]');
  });

  test('neither reads nor overwrites a file that cannot be read, and says so', async () => {
    fs.mkdirSync(file);
    const user = new UserSettings(defaults, file);
    assert.deepStrictEqual(user.settings, defaults);
    assert.match(user.problems[0] ?? '', /could not be read/);
    await user.set('autoSortTabs', true);
    assert.strictEqual(user.settings.autoSortTabs, true);
    assert.ok(fs.statSync(file).isDirectory());
    assert.ok(!fs.existsSync(`${file}.tmp`));
  });

  test('saves to the file a symlink points to, keeping the symlink', async (context) => {
    const target = path.join(folder, 'dotfiles.json');
    fs.writeFileSync(target, '{}');
    symlinkOrSkip(context, target, file);
    const user = new UserSettings(defaults, file);
    await user.set('autoSortTabs', true);
    assert.ok(fs.lstatSync(file).isSymbolicLink());
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(target, 'utf8')), {
      autoSortTabs: true,
    });
  });

  test('saves to the file a symlink points to while that file is missing, keeping the symlink', async (context) => {
    const target = path.join(folder, 'dotfiles', 'settings.json');
    fs.mkdirSync(path.dirname(target));
    symlinkOrSkip(context, path.join('dotfiles', 'settings.json'), file);
    const user = new UserSettings(defaults, file);
    assert.deepStrictEqual(user.problems, []);
    await user.set('autoSortTabs', true);
    assert.ok(fs.lstatSync(file).isSymbolicLink());
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(target, 'utf8')), {
      autoSortTabs: true,
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
        user.set('autoSortTabs', code === 'EBUSY'),
      );
      assert.strictEqual(renames, 3);
      assert.strictEqual(
        new UserSettings(defaults, file).settings.autoSortTabs,
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
    const saving = user.set('autoSortTabs', true);
    assert.strictEqual(user.reload(), false);
    assert.strictEqual(user.settings.autoSortTabs, true);
    await saving;
    assert.strictEqual(user.reload(), false);
    assert.strictEqual(user.settings.autoSortTabs, true);
  });

  test('takes a change made to the file while its own change is still being saved', async () => {
    const user = new UserSettings(defaults, file);
    await user.setIn('git', 'collapseMerges', false);
    const saving = user.set('autoSortTabs', true);
    fs.writeFileSync(
      file,
      JSON.stringify({
        tools: { git: { wordWrap: !defaults.tools.git.wordWrap } },
      }),
    );
    assert.strictEqual(user.reload(), true);
    assert.strictEqual(
      user.settings.tools.git.wordWrap,
      !defaults.tools.git.wordWrap,
    );
    assert.strictEqual(user.settings.autoSortTabs, true);
    await saving;
    assert.strictEqual(user.reload(), false);
    assert.strictEqual(
      user.settings.tools.git.wordWrap,
      !defaults.tools.git.wordWrap,
    );
    assert.strictEqual(user.settings.autoSortTabs, true);
  });

  test('keeps a change made to the file since it was read when saving its own', async () => {
    const user = new UserSettings(defaults, file);
    fs.writeFileSync(file, JSON.stringify({ autoSortTabs: true }));
    await user.setIn('git', 'collapseMerges', false);
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(file, 'utf8')), {
      autoSortTabs: true,
      tools: { git: { collapseMerges: false } },
    });
    assert.strictEqual(user.reload(), true);
    assert.strictEqual(user.settings.autoSortTabs, true);
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
    fs.writeFileSync(file, JSON.stringify({ autoSortTabs: true }));
    assert.strictEqual(user.reload(), true);
    assert.strictEqual(user.settings.autoSortTabs, true);
    assert.strictEqual(user.settings.tools.git.collapseMerges, true);
    assert.strictEqual(user.reload(), false);
  });

  test('takes new defaults, keeping the changes in the file over them', async () => {
    const user = new UserSettings(defaults, file);
    await user.set('autoSortTabs', true);
    const changed = user.replaceDefaults({
      ...defaults,
      autoSortTabs: false,
      tools: {
        ...defaults.tools,
        git: { ...defaults.tools.git, collapseMerges: false },
      },
    });
    assert.strictEqual(changed, true);
    assert.strictEqual(user.settings.tools.git.collapseMerges, false);
    assert.strictEqual(user.settings.autoSortTabs, true);
    assert.strictEqual(user.replaceDefaults(user.defaults), false);
  });
});

suite('Default settings', () => {
  test('takes new defaults, keeping the user changes over them', async () => {
    const user = new UserSettings(defaults);
    await user.set('autoSortTabs', true);
    const changed = user.replaceDefaults({
      ...defaults,
      autoSortTabs: false,
      tools: {
        ...defaults.tools,
        git: { ...defaults.tools.git, collapseMerges: false },
      },
    });
    assert.strictEqual(changed, true);
    assert.strictEqual(user.settings.tools.git.collapseMerges, false);
    assert.strictEqual(user.settings.autoSortTabs, true);
    assert.strictEqual(user.defaults.tools.git.collapseMerges, false);
    assert.strictEqual(user.replaceDefaults(user.defaults), false);
  });

  test('takes no value the settings would not, keeping the one in use', async () => {
    const user = new UserSettings(defaults);
    await user.setIn('git', 'diffLayout', JSON.parse('"grid"'));
    assert.strictEqual(user.replaceDefaults(user.defaults), false);
    assert.deepStrictEqual(user.problems, []);
    assert.deepStrictEqual(user.settings, defaults);
  });

  test('writes the reference copy read-only, and can write it again', () => {
    const folder = tempFolder('copy');
    const file = path.join(folder, 'settings.defaults.json');
    try {
      writeReadOnly(file, 'first');
      assert.throws(() => fs.writeFileSync(file, 'edited'));
      writeReadOnly(file, 'second');
      assert.strictEqual(fs.readFileSync(file, 'utf8'), 'second');
    } finally {
      removeFolder(folder);
    }
  });
});

suite('Writing a file whole', () => {
  test('flushes the new text to the disk before putting it in place, so a crash leaves the old file or the new one, not an empty one', async () => {
    const folder = tempFolder('flushed');
    const file = path.join(folder, 'state.json');
    const nodeFs = process.getBuiltinModule('node:fs');
    const { open, rename } = nodeFs.promises;
    const steps: string[] = [];
    Reflect.set(
      nodeFs.promises,
      'open',
      async (...args: Parameters<typeof open>) => {
        const handle = await open(...args);
        const sync = handle.sync.bind(handle);
        Reflect.set(handle, 'sync', () => {
          steps.push('sync');
          return sync();
        });
        return handle;
      },
    );
    Reflect.set(
      nodeFs.promises,
      'rename',
      (...args: Parameters<typeof rename>) => {
        steps.push('rename');
        return rename(...args);
      },
    );
    try {
      await writeAtomically(file, '{"a":1}');
      assert.deepStrictEqual(steps, ['sync', 'rename']);
      assert.strictEqual(fs.readFileSync(file, 'utf8'), '{"a":1}');
    } finally {
      Reflect.set(nodeFs.promises, 'open', open);
      Reflect.set(nodeFs.promises, 'rename', rename);
      removeFolder(folder);
    }
  });
});
