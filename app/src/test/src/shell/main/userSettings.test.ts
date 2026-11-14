import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, suite, test } from 'vitest';
import { UserSettings } from '../../../../shell/main/userSettings';
import { plainOf } from '../../../../lib/shared/sentences';
import { strings } from '../../../../lib/shared/strings';
import { defaultSettings } from '../../../helpers/fixtures';
import {
  removeFolder,
  symlinkOrSkip,
  tempFolder,
} from '../../../helpers/repositories';

const defaults = defaultSettings();

suite('User settings file', () => {
  let folder: string;
  let file: string;

  beforeEach(() => {
    folder = tempFolder('settings');
    file = path.join(folder, 'settings.user.json');
  });

  afterEach(() => removeFolder(folder));

  const written = (): unknown => JSON.parse(fs.readFileSync(file, 'utf8'));

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

suite('Default settings', () => {
  test('takes new defaults, keeping the user changes over them', async () => {
    const user = new UserSettings(defaults);
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
});
