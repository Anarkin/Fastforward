import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  mergeSettings,
  migrate,
  migrateProfile,
  overridesOf,
  UserSettings,
  watchSettings,
  writeReadOnly,
} from '../settings';
import { defaultSettings, waitFor } from './fixtures';
import { removeFolder, symlinkOrSkip, tempFolder } from './repositories';

const defaults = defaultSettings();

suite('Settings', () => {
  test('takes each setting the user changed over its default', () => {
    const { settings, problems } = mergeSettings(defaults, {
      ignoreWhitespace: false,
      columnWidths: [300, 200],
    });
    assert.deepStrictEqual(settings, {
      ...defaults,
      ignoreWhitespace: false,
      columnWidths: [300, 200],
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
      ignoreWhitespaces: false,
      solo: 'yes',
      columnWidths: ['wide'],
    });
    assert.deepStrictEqual(settings, defaults);
    assert.deepStrictEqual(problems, [
      'Unknown setting "ignoreWhitespaces"',
      '"solo" should be a boolean',
      '"columnWidths" should be a list of numbers',
    ]);
  });

  test('takes no null, list or object for a setting of another kind', () => {
    const { settings, problems } = mergeSettings(defaults, {
      fonts: null,
      sizes: ['20px'],
      solo: {},
      autoFetchMinutes: [1],
    });
    assert.deepStrictEqual(settings, defaults);
    assert.deepStrictEqual(problems, [
      '"fonts" should be an object',
      '"sizes" should be an object',
      '"solo" should be a boolean',
      '"autoFetchMinutes" should be a number',
    ]);
    assert.deepStrictEqual(mergeSettings({ list: [] }, { list: 1 }).problems, [
      '"list" should be a list',
    ]);
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
      diffLayout: 'sideways',
    });
    assert.deepStrictEqual(settings, defaults);
    assert.deepStrictEqual(problems, [
      '"diffLayout" should be "inline" or "sideBySide"',
    ]);
    assert.strictEqual(
      mergeSettings(defaults, { diffLayout: 'sideBySide' }).settings.diffLayout,
      'sideBySide',
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
        solo: true,
        columnWidths: [...defaults.columnWidths],
      }),
      { solo: true },
    );
  });
});

suite('User settings file', () => {
  let folder: string;
  let file: string;

  setup(() => {
    folder = tempFolder('settings');
    file = path.join(folder, 'settings.user.json');
  });

  teardown(() => removeFolder(folder));

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
    await user.set('ignoreWhitespace', false);
    await user.set('showAllFiles', true);
    assert.deepStrictEqual(written(), {
      ignoreWhitespace: false,
      showAllFiles: true,
    });
    await user.set('ignoreWhitespace', true);
    assert.deepStrictEqual(written(), { showAllFiles: true });
    assert.strictEqual(
      new UserSettings(defaults, file).settings.showAllFiles,
      true,
    );
  });

  test('keeps what was written by hand when saving a change, even what it does not know', async () => {
    fs.writeFileSync(file, JSON.stringify({ sollo: true, solo: 'yes' }));
    const user = new UserSettings(defaults, file);
    await user.set('collapseMerges', false);
    assert.deepStrictEqual(written(), {
      sollo: true,
      solo: 'yes',
      collapseMerges: false,
    });
  });

  test('neither reads nor overwrites a file that is no valid JSON', async () => {
    fs.writeFileSync(file, '{ "solo": tru');
    const user = new UserSettings(defaults, file);
    assert.deepStrictEqual(user.settings, defaults);
    assert.match(user.problems[0] ?? '', /not valid JSON/);
    await user.set('solo', true);
    assert.strictEqual(user.settings.solo, true);
    assert.strictEqual(fs.readFileSync(file, 'utf8'), '{ "solo": tru');
  });

  test('neither reads nor overwrites a file that is no JSON object', async () => {
    fs.writeFileSync(file, '[{ "solo": true }]');
    const user = new UserSettings(defaults, file);
    assert.deepStrictEqual(user.settings, defaults);
    assert.deepStrictEqual(user.problems, [
      'The user settings are not a JSON object',
    ]);
    await user.set('solo', true);
    assert.strictEqual(user.settings.solo, true);
    assert.strictEqual(fs.readFileSync(file, 'utf8'), '[{ "solo": true }]');
  });

  test('neither reads nor overwrites a file that cannot be read, and says so', async () => {
    fs.mkdirSync(file);
    const user = new UserSettings(defaults, file);
    assert.deepStrictEqual(user.settings, defaults);
    assert.match(user.problems[0] ?? '', /could not be read/);
    await user.set('solo', true);
    assert.strictEqual(user.settings.solo, true);
    assert.ok(fs.statSync(file).isDirectory());
    assert.ok(!fs.existsSync(`${file}.tmp`));
  });

  test('saves to the file a symlink points to, keeping the symlink', async function () {
    const target = path.join(folder, 'dotfiles.json');
    fs.writeFileSync(target, '{}');
    symlinkOrSkip(this, target, file);
    const user = new UserSettings(defaults, file);
    await user.set('solo', true);
    assert.ok(fs.lstatSync(file).isSymbolicLink());
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(target, 'utf8')), {
      solo: true,
    });
  });

  test('notices a change to the file it was given as the one the settings resolve to, in another folder, as an editor writes to the file a symlink points to', async function () {
    this.timeout(20_000);
    const target = path.join(folder, 'dotfiles', 'settings.json');
    fs.mkdirSync(path.dirname(target));
    await noticed(target, target);
  });

  test('finds the file a symlink points to for watching', async function () {
    this.timeout(20_000);
    const target = path.join(folder, 'dotfiles', 'settings.json');
    fs.mkdirSync(path.dirname(target));
    fs.writeFileSync(target, '{}');
    symlinkOrSkip(this, target, file);
    await noticed(target);
  });

  test('keeps a change still being saved when reading the file its earlier save wrote', async () => {
    const user = new UserSettings(defaults, file);
    await user.set('collapseMerges', false);
    const saving = user.set('solo', true);
    assert.strictEqual(user.reload(), false);
    assert.strictEqual(user.settings.solo, true);
    await saving;
    assert.strictEqual(user.reload(), false);
    assert.strictEqual(user.settings.solo, true);
  });

  test('keeps a change made to the file since it was read when saving its own', async () => {
    const user = new UserSettings(defaults, file);
    fs.writeFileSync(file, JSON.stringify({ solo: true }));
    await user.set('collapseMerges', false);
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(file, 'utf8')), {
      solo: true,
      collapseMerges: false,
    });
    assert.strictEqual(user.reload(), true);
    assert.strictEqual(user.settings.solo, true);
    assert.strictEqual(user.settings.collapseMerges, false);
  });

  test('leaves a file broken since it was read alone when saving', async () => {
    const user = new UserSettings(defaults, file);
    fs.writeFileSync(file, '{ "solo": ');
    await user.set('collapseMerges', false);
    assert.strictEqual(fs.readFileSync(file, 'utf8'), '{ "solo": ');
  });

  test('leaves a file that became no JSON object since it was read alone when saving', async () => {
    const user = new UserSettings(defaults, file);
    fs.writeFileSync(file, '[]');
    await user.set('collapseMerges', false);
    assert.strictEqual(fs.readFileSync(file, 'utf8'), '[]');
  });

  test('reads the file again once it changes, telling a change from its own saves', async () => {
    const user = new UserSettings(defaults, file);
    await user.set('collapseMerges', false);
    assert.strictEqual(user.reload(), false);
    fs.writeFileSync(file, JSON.stringify({ solo: true }));
    assert.strictEqual(user.reload(), true);
    assert.strictEqual(user.settings.solo, true);
    assert.strictEqual(user.settings.collapseMerges, true);
    assert.strictEqual(user.reload(), false);
  });

  test('takes new defaults, keeping the changes in the file over them', async () => {
    const user = new UserSettings(defaults, file);
    await user.set('solo', true);
    const changed = user.replaceDefaults({
      ...defaults,
      solo: false,
      collapseMerges: false,
    });
    assert.strictEqual(changed, true);
    assert.strictEqual(user.settings.collapseMerges, false);
    assert.strictEqual(user.settings.solo, true);
    assert.strictEqual(user.replaceDefaults(user.defaults), false);
  });
});

suite('Default settings', () => {
  test('takes new defaults, keeping the user changes over them', async () => {
    const user = new UserSettings(defaults);
    await user.set('solo', true);
    const changed = user.replaceDefaults({
      ...defaults,
      solo: false,
      collapseMerges: false,
    });
    assert.strictEqual(changed, true);
    assert.strictEqual(user.settings.collapseMerges, false);
    assert.strictEqual(user.settings.solo, true);
    assert.strictEqual(user.defaults.collapseMerges, false);
    assert.strictEqual(user.replaceDefaults(user.defaults), false);
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

suite('Moving to settings and state', () => {
  const old = {
    tabs: ['/a'],
    activeTab: '/a',
    recentRepositories: ['/a', '/b'],
    vips: { '/a': [{ kind: 'branch', name: 'main' }] },
    soloRepositories: ['/b'],
    solo: true,
    windowBounds: { x: 0, y: 0, width: 800, height: 600 },
    windowMaximized: true,
    collapseMerges: true,
    ignoreWhitespace: false,
    filesMode: 'files',
    columnWidths: [400, 250],
  };

  test('splits the old settings into the state and what differs from the defaults', () => {
    assert.deepStrictEqual(migrate(old, defaults), {
      overrides: {
        ignoreWhitespace: false,
        showAllFiles: true,
        columnWidths: [400, 250],
      },
      state: {
        tabs: ['/a'],
        activeTab: '/a',
        recentRepositories: ['/a', '/b'],
        windowBounds: { x: 0, y: 0, width: 800, height: 600 },
        windowMaximized: true,
        bookmarks: { '/a': [{ kind: 'branch', name: 'main' }] },
        solo: { '/b': true },
      },
    });
  });

  test('moves an old profile once, keeping the old file aside', () => {
    const folder = tempFolder('move');
    try {
      fs.writeFileSync(path.join(folder, 'settings.json'), JSON.stringify(old));
      assert.strictEqual(migrateProfile(folder, defaults), true);
      const read = (name: string): unknown =>
        JSON.parse(fs.readFileSync(path.join(folder, name), 'utf8'));
      assert.deepStrictEqual(read('settings.user.json'), {
        ignoreWhitespace: false,
        showAllFiles: true,
        columnWidths: [400, 250],
      });
      assert.deepStrictEqual(read('state.json'), migrate(old, defaults).state);
      assert.deepStrictEqual(read('settings.old.json'), old);
      assert.ok(!fs.existsSync(path.join(folder, 'settings.json')));
      assert.strictEqual(migrateProfile(folder, defaults), false);
    } finally {
      removeFolder(folder);
    }
  });
});
