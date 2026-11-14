import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import {
  mergeSettings,
  overridesOf,
  UserSettings,
  writeAtomically,
  writeReadOnly,
} from '../../../../shell/main/settings';
import { plainOf, strings } from '../../../../lib/shared/strings';
import { defaultSettings } from '../../../helpers/fixtures';
import { removeFolder, tempFolder } from '../../../helpers/repositories';

const defaults = defaultSettings();

suite('Settings', () => {
  test('takes each setting the user changed over its default', () => {
    const { settings, problems } = mergeSettings(defaults, {
      images: { realSize: true },
      tools: { git: { ignoreWhitespace: false, columnWidths: [300, 200] } },
    });
    assert.deepStrictEqual(settings, {
      ...defaults,
      images: { ...defaults.images, realSize: true },
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
    assert.deepStrictEqual(problems.map(plainOf), [
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
    assert.deepStrictEqual(problems.map(plainOf), [
      '"fonts" should be an object',
      '"sizes" should be an object',
      '"tools.git.solo" should be a boolean',
      '"tools.git.autoFetchMinutes" should be a number',
    ]);
    assert.deepStrictEqual(
      mergeSettings({ list: [] }, { list: 1 }).problems.map(plainOf),
      ['"list" should be a list'],
    );
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

  test('takes for the arguments of the shell, whose default list is empty, only a list of strings, and says why, as an argument of another kind was dropped without a word', () => {
    const { settings, problems } = mergeSettings(defaults, {
      tools: { terminal: { shellArgs: ['-l', 2] } },
    });
    assert.deepStrictEqual(settings, defaults);
    assert.deepStrictEqual(problems.map(plainOf), [
      '"tools.terminal.shellArgs" should be a list of strings',
    ]);
    assert.deepStrictEqual(
      mergeSettings(defaults, {
        tools: { terminal: { shellArgs: ['-l', '-i'] } },
      }).settings.tools.terminal.shellArgs,
      ['-l', '-i'],
    );
  });

  test('takes for the bookmarks of the commander, whose default list is empty, only a list of strings, and says why', () => {
    const { settings, problems } = mergeSettings(defaults, {
      tools: { commander: { bookmarks: ['C:\\Code', 2] } },
    });
    assert.deepStrictEqual(settings, defaults);
    assert.deepStrictEqual(problems.map(plainOf), [
      '"tools.commander.bookmarks" should be a list of strings',
    ]);
    assert.deepStrictEqual(
      mergeSettings(defaults, {
        tools: { commander: { bookmarks: ['C:\\Code', '/home/adam'] } },
      }).settings.tools.commander.bookmarks,
      ['C:\\Code', '/home/adam'],
    );
  });

  test('takes a list of objects whose every item has the keys of the first default item, each of its kind', () => {
    const fileColors = [
      { extensions: ['png', 'jpg'], colors: { light: '#a0a', dark: '#f0f' } },
    ];
    assert.deepStrictEqual(
      mergeSettings(defaults, { tools: { commander: { fileColors } } }),
      {
        settings: {
          ...defaults,
          tools: {
            ...defaults.tools,
            commander: { ...defaults.tools.commander, fileColors },
          },
        },
        problems: [],
      },
    );
  });

  test('takes "languages" and "executables" in place of the extensions of a color group of the commander', () => {
    const fileColors = [
      { extensions: ['png'], colors: { light: '#a0a', dark: '#f0f' } },
      { extensions: 'languages', colors: { light: '#a0a', dark: '#f0f' } },
      { extensions: 'executables', colors: { light: '#a0a', dark: '#f0f' } },
    ];
    const { settings, problems } = mergeSettings(defaults, {
      tools: { commander: { fileColors } },
    });
    assert.deepStrictEqual(settings.tools.commander.fileColors, fileColors);
    assert.deepStrictEqual(problems, []);
  });

  test('keeps the default of a list of objects with an item missing a key, having one it does not know or one of the wrong kind, and says why', () => {
    const { settings, problems } = mergeSettings(defaults, {
      tools: {
        commander: {
          fileColors: [
            { extensions: ['png'], colors: { light: '#a0a' } },
            { extensions: 'svg', colors: { light: '#a0a', dark: '#f0f' } },
            {
              extensions: ['gif'],
              colors: { light: '#a0a', dark: '#f0f' },
              bold: true,
            },
            'zip',
          ],
        },
      },
    });
    assert.deepStrictEqual(settings, defaults);
    assert.deepStrictEqual(problems.map(plainOf), [
      'Missing setting "tools.commander.fileColors[0].colors.dark"',
      '"tools.commander.fileColors[1].extensions" should be a list of strings or "languages" or "executables"',
      'Unknown setting "tools.commander.fileColors[2].bold"',
      '"tools.commander.fileColors[3]" should be an object',
    ]);
  });

  test('keeps the default of a color, font or size that CSS would not take whole, and says why, as one bracket left open swallowed the rest of the theme', () => {
    const { settings, problems } = mergeSettings(defaults, {
      colors: {
        light: { foreground: 'rgb(0, 0, 0', background: 'rgb(0 0 0 / 50%)' },
        dark: { foreground: 'red; color: blue' },
      },
      fonts: { family: "'Segoe UI, sans-serif", size: '13px' },
      sizes: { scrollbar: 'calc(10px + 2px)' },
      tools: { git: { colors: { dark: { bubble: '#444 }' } } } },
    });
    assert.deepStrictEqual(problems, [
      strings.settings.notCssValue('colors.light.foreground'),
      strings.settings.notCssValue('colors.dark.foreground'),
      strings.settings.notCssValue('fonts.family'),
      strings.settings.notCssValue('tools.git.colors.dark.bubble'),
    ]);
    assert.strictEqual(
      settings.colors.light.foreground,
      defaults.colors.light.foreground,
    );
    assert.strictEqual(settings.colors.light.background, 'rgb(0 0 0 / 50%)');
    assert.strictEqual(settings.fonts.family, defaults.fonts.family);
    assert.strictEqual(settings.fonts.size, '13px');
    assert.strictEqual(settings.sizes.scrollbar, 'calc(10px + 2px)');
    assert.strictEqual(
      settings.tools.git.colors.dark.bubble,
      defaults.tools.git.colors.dark.bubble,
    );
  });

  test('keeps the default of a color, font or size with a backslash, a comment or a control character, and says why, as CSS read past its end into the rest of the theme', () => {
    const { settings, problems } = mergeSettings(defaults, {
      colors: { light: { foreground: '12px /* big' } },
      fonts: { family: '"\\"', monospaceFamily: '"Cascadia\nCode"' },
      sizes: { scrollbar: '12px\\', minimap: '12px */' },
    });
    assert.deepStrictEqual(problems, [
      strings.settings.notCssValue('colors.light.foreground'),
      strings.settings.notCssValue('fonts.family'),
      strings.settings.notCssValue('fonts.monospaceFamily'),
      strings.settings.notCssValue('sizes.scrollbar'),
    ]);
    assert.strictEqual(
      settings.colors.light.foreground,
      defaults.colors.light.foreground,
    );
    assert.strictEqual(settings.fonts.family, defaults.fonts.family);
    assert.strictEqual(
      settings.fonts.monospaceFamily,
      defaults.fonts.monospaceFamily,
    );
    assert.strictEqual(settings.sizes.scrollbar, defaults.sizes.scrollbar);
    assert.strictEqual(settings.sizes.minimap, '12px */');
  });

  test('knows no setting by a name every object has', () => {
    const { settings, problems } = mergeSettings(
      defaults,
      JSON.parse('{ "toString": 1, "__proto__": { "solo": true } }'),
    );
    assert.deepStrictEqual(settings, defaults);
    assert.strictEqual(Object.getPrototypeOf(settings), Object.prototype);
    assert.deepStrictEqual(problems.map(plainOf), [
      'Unknown setting "toString"',
      'Unknown setting "__proto__"',
    ]);
  });

  test('keeps the default of a setting set to none of its choices, and names them', () => {
    const { settings, problems } = mergeSettings(defaults, {
      tools: { git: { diffLayout: 'sideways' } },
    });
    assert.deepStrictEqual(settings, defaults);
    assert.deepStrictEqual(problems.map(plainOf), [
      '"tools.git.diffLayout" should be "inline" or "sideBySide"',
    ]);
    assert.strictEqual(
      mergeSettings(defaults, { tools: { git: { diffLayout: 'inline' } } })
        .settings.tools.git.diffLayout,
      'inline',
    );
  });

  test('takes a block, a bar, an underline or an outline as the style of the cursor, keeping a steady block of a bar two pixels wide by default', () => {
    assert.deepStrictEqual(defaults.cursor, {
      style: 'block',
      width: 2,
      blink: false,
    });
    const { settings, problems } = mergeSettings(defaults, {
      cursor: { style: 'beam', width: 3 },
    });
    assert.deepStrictEqual(settings.cursor, {
      ...defaults.cursor,
      width: 3,
    });
    assert.deepStrictEqual(problems.map(plainOf), [
      '"cursor.style" should be "block" or "bar" or "underline" or "outline"',
    ]);
    assert.strictEqual(
      mergeSettings(defaults, { cursor: { style: 'bar' } }).settings.cursor
        .style,
      'bar',
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
