import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  clicked,
  keyLabels,
  keymap,
  pressed,
  pressOfInput,
  released,
  wheeled,
  type KeyPress,
} from '../shared/keymap';

const none = { ctrlKey: false, metaKey: false, altKey: false, shiftKey: false };

const press = (key: string, extra: Partial<KeyPress> = {}): KeyPress => ({
  key,
  code: '',
  ...none,
  ...extra,
});

suite('Keymap', () => {
  test('takes a letter typed, with Caps Lock on, or on the key of another layout', () => {
    assert.strictEqual(pressed(keymap.head, press('h'), false), true);
    assert.strictEqual(pressed(keymap.head, press('H'), false), true);
    assert.strictEqual(
      pressed(keymap.head, press('р', { code: 'KeyH' }), false),
      true,
    );
    assert.strictEqual(
      pressed(keymap.head, press('h', { code: 'KeyJ' }), false),
      true,
    );
    assert.strictEqual(pressed(keymap.head, press('x'), false), undefined);
  });

  test('takes Mod as Ctrl or Cmd, but Ctrl only as Ctrl', () => {
    const t = press('t', { code: 'KeyT' });
    assert.strictEqual(
      pressed(keymap.openRepository, { ...t, ctrlKey: true }, false),
      true,
    );
    assert.strictEqual(
      pressed(keymap.openRepository, { ...t, metaKey: true }, false),
      true,
    );
    assert.strictEqual(pressed(keymap.openRepository, t, false), undefined);
    const tab = press('Tab', { ctrlKey: true });
    assert.strictEqual(pressed(keymap.repository, tab, false), 1);
    assert.strictEqual(
      pressed(keymap.repository, { ...tab, shiftKey: true }, false),
      -1,
    );
    assert.strictEqual(
      pressed(
        keymap.repository,
        { ...tab, ctrlKey: false, metaKey: true },
        false,
      ),
      undefined,
    );
  });

  test('tells keys apart by Shift, but for a character that takes Shift to type', () => {
    assert.strictEqual(
      pressed(keymap.head, press('H', { shiftKey: true }), false),
      undefined,
    );
    assert.strictEqual(
      pressed(keymap.folder, press(' ', { shiftKey: true }), false),
      undefined,
    );
    assert.strictEqual(
      pressed(keymap.shortcuts, press('?', { shiftKey: true }), false),
      true,
    );
    assert.strictEqual(
      pressed(keymap.shortcuts, press('F1', { shiftKey: true }), false),
      undefined,
    );
  });

  test('takes no key with Alt, nor one handled already or composing text', () => {
    for (const extra of [
      { altKey: true },
      { defaultPrevented: true },
      { isComposing: true },
      { keyCode: 229 },
    ]) {
      assert.strictEqual(
        pressed(keymap.commits, press('c', extra), false),
        undefined,
        JSON.stringify(extra),
      );
    }
  });

  test('repeats a step held down, but not an action', () => {
    assert.strictEqual(
      pressed(keymap.change, press('j', { repeat: true }), false),
      1,
    );
    assert.strictEqual(
      pressed(keymap.commits, press('c', { repeat: true }), false),
      undefined,
    );
  });

  test('leaves the keys that type or move the caret to a text field, but for those of fields', () => {
    assert.strictEqual(pressed(keymap.head, press('h'), true), undefined);
    assert.strictEqual(pressed(keymap.shortcuts, press('?'), true), undefined);
    assert.strictEqual(pressed(keymap.shortcuts, press('F1'), true), true);
    assert.strictEqual(
      pressed(keymap.column, press('ArrowLeft'), true),
      undefined,
    );
    assert.strictEqual(pressed(keymap.column, press('Tab'), true), 'next');
    assert.strictEqual(
      pressed(keymap.find, press('f', { ctrlKey: true }), true),
      true,
    );
    assert.strictEqual(pressed(keymap.result, press('ArrowDown'), true), 1);
  });

  test('takes clicks of a button and the wheel with their modifiers', () => {
    const click = { button: 0, ...none };
    assert.strictEqual(clicked(keymap.compare, click), undefined);
    assert.strictEqual(
      clicked(keymap.compare, { ...click, ctrlKey: true }),
      true,
    );
    assert.strictEqual(
      clicked(keymap.compare, { ...click, metaKey: true }),
      true,
    );
    assert.strictEqual(clicked(keymap.drag, click), true);
    assert.strictEqual(
      clicked(keymap.closeRepository, { ...click, button: 1 }),
      true,
    );
    assert.strictEqual(
      clicked(keymap.navigate, { ...click, button: 3 }),
      'back',
    );
    assert.strictEqual(
      clicked(keymap.navigate, { ...click, button: 4 }),
      'forward',
    );
    assert.strictEqual(wheeled(keymap.wheelSideways, none), undefined);
    assert.strictEqual(
      wheeled(keymap.wheelSideways, { ...none, shiftKey: true }),
      true,
    );
  });

  test('ends a drag once no button is held', () => {
    assert.ok(released({ buttons: 0 }));
    assert.ok(!released({ buttons: 1 }));
  });

  test('reads the keys Electron reports before the page sees them', () => {
    const input = {
      key: 'I',
      code: 'KeyI',
      control: true,
      meta: false,
      alt: false,
      shift: true,
      isAutoRepeat: false,
    };
    assert.strictEqual(
      pressed(keymap.devTools, pressOfInput(input), false),
      true,
    );
    assert.strictEqual(
      pressed(
        keymap.devTools,
        pressOfInput({ ...input, control: false, meta: true }),
        false,
      ),
      true,
    );
    assert.strictEqual(
      pressed(keymap.devTools, pressOfInput({ ...input, shift: false }), false),
      undefined,
    );
  });

  test('names the keys as the keyboard does, Mod as Ctrl, or Cmd on macOS', () => {
    assert.deepStrictEqual(keyLabels('Mod+Shift+I', false), [
      'Ctrl',
      'Shift',
      'I',
    ]);
    assert.deepStrictEqual(keyLabels('Mod+T', true), ['⌘', 'T']);
    assert.deepStrictEqual(keyLabels('Ctrl+PageDown', true), ['Ctrl', 'PgDn']);
    assert.deepStrictEqual(keyLabels('ArrowLeft', false), ['←']);
    assert.deepStrictEqual(keyLabels('MiddleClick', false), ['Middle-click']);
  });

  test('leaves telling keys, modifiers and buttons apart to itself, so the shortcuts screen lists every one', () => {
    const source = path.join(__dirname, '../../src');
    const own = ['keymap.ts', 'strings.ts'].map((file) =>
      path.join(source, 'shared', file),
    );
    const reads =
      /\b(?:event|nativeEvent|input)\.(?:key|code|keyCode|button|buttons|ctrlKey|metaKey|altKey|shiftKey|isComposing|control|meta|alt|shift)\b|'(?:Arrow(?:Up|Down|Left|Right)|Page(?:Up|Down)|Home|End|Enter|Escape|Tab|F\d{1,2})'|'(?:ctrlKey|metaKey|altKey|shiftKey)'/;
    const offenders = fs
      .readdirSync(source, { recursive: true, encoding: 'utf8' })
      .filter((file) => /\.tsx?$/.test(file) && !file.startsWith('test'))
      .map((file) => path.join(source, file))
      .filter((file) => !own.includes(file))
      .flatMap((file) =>
        fs
          .readFileSync(file, 'utf8')
          .split('\n')
          .flatMap((line, index) =>
            reads.test(line)
              ? [`${path.relative(source, file)}:${index + 1}: ${line.trim()}`]
              : [],
          ),
      );
    assert.deepStrictEqual(offenders, []);
  });
});
