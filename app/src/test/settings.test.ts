import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  mergeSettings,
  migrate,
  migrateProfile,
  overridesOf,
  UserSettings,
  writeReadOnly,
} from '../settings';
import { defaultSettings } from './fixtures';

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
      '"columnWidths" should be a list',
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
    folder = fs.mkdtempSync(path.join(os.tmpdir(), 'fastforward-settings-'));
    file = path.join(folder, 'settings.user.json');
  });

  teardown(() => fs.rmSync(folder, { recursive: true, force: true }));

  const written = (): unknown => JSON.parse(fs.readFileSync(file, 'utf8'));

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
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'fastforward-copy-'));
    const file = path.join(folder, 'settings.defaults.json');
    try {
      writeReadOnly(file, 'first');
      assert.throws(() => fs.writeFileSync(file, 'edited'));
      writeReadOnly(file, 'second');
      assert.strictEqual(fs.readFileSync(file, 'utf8'), 'second');
    } finally {
      fs.chmodSync(file, 0o644);
      fs.rmSync(folder, { recursive: true, force: true });
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
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'fastforward-move-'));
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
      fs.rmSync(folder, { recursive: true, force: true });
    }
  });
});
