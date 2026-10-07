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
} from '../../shared/keymap';
import { keyPress, noModifiers } from '../fixtures';

const worktreeStep = (extra: Partial<KeyPress>) =>
  pressed(
    keymap.worktree,
    keyPress('PageDown', { ctrlKey: true, ...extra }),
    false,
  );

suite('Keymap', () => {
  test('takes a letter typed, with Caps Lock on, or on the key of another layout', () => {
    assert.strictEqual(pressed(keymap.head, keyPress('h'), false), true);
    assert.strictEqual(pressed(keymap.head, keyPress('H'), false), true);
    assert.strictEqual(
      pressed(keymap.head, keyPress('р', { code: 'KeyH' }), false),
      true,
    );
    assert.strictEqual(
      pressed(keymap.head, keyPress('h', { code: 'KeyJ' }), false),
      true,
    );
    assert.strictEqual(pressed(keymap.head, keyPress('x'), false), undefined);
    assert.strictEqual(
      pressed(
        keymap.openRepository,
        keyPress('е', { code: 'KeyT', ctrlKey: true }),
        false,
      ),
      true,
    );
  });

  test('takes the letter typed, not the key pressed, on another Latin layout', () => {
    const dvorak = keyPress('u', { code: 'KeyF', ctrlKey: true });
    assert.strictEqual(pressed(keymap.find, dvorak, false), undefined);
    assert.strictEqual(
      pressed(keymap.find, { ...dvorak, key: 'f', code: 'KeyY' }, false),
      true,
    );
    assert.strictEqual(
      pressed(
        keymap.openRepository,
        { ...dvorak, key: 'y', code: 'KeyT' },
        false,
      ),
      undefined,
    );
    assert.strictEqual(
      pressed(
        keymap.openRepository,
        { ...dvorak, key: 't', code: 'KeyK' },
        false,
      ),
      true,
    );
    assert.strictEqual(
      pressed(keymap.change, keyPress('h', { code: 'KeyJ' }), false),
      undefined,
    );
    assert.strictEqual(
      pressed(keymap.commits, keyPress('j', { code: 'KeyC' }), false),
      undefined,
    );
    assert.strictEqual(
      pressed(keymap.change, keyPress('j', { code: 'KeyC' }), false),
      1,
    );
    assert.strictEqual(
      pressed(keymap.change, keyPress('л', { code: 'KeyK' }), false),
      -1,
    );
  });

  test('takes Mod as Ctrl or Cmd, but Ctrl only as Ctrl', () => {
    const t = keyPress('t', { code: 'KeyT' });
    assert.strictEqual(
      pressed(keymap.openRepository, { ...t, ctrlKey: true }, false),
      true,
    );
    assert.strictEqual(
      pressed(keymap.openRepository, { ...t, metaKey: true }, false),
      true,
    );
    assert.strictEqual(pressed(keymap.openRepository, t, false), undefined);
    const tab = keyPress('Tab', { ctrlKey: true });
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
      pressed(keymap.head, keyPress('H', { shiftKey: true }), false),
      undefined,
    );
    assert.strictEqual(
      pressed(keymap.folder, keyPress(' ', { shiftKey: true }), false),
      undefined,
    );
    assert.strictEqual(
      pressed(keymap.shortcuts, keyPress('?', { shiftKey: true }), false),
      true,
    );
    assert.strictEqual(
      pressed(keymap.shortcuts, keyPress('F1', { shiftKey: true }), false),
      undefined,
    );
  });

  test('takes no key bound on its own with Ctrl or Cmd held', () => {
    for (const extra of [{ ctrlKey: true }, { metaKey: true }]) {
      assert.strictEqual(
        pressed(keymap.commits, keyPress('c', extra), false),
        undefined,
        JSON.stringify(extra),
      );
    }
  });

  test('goes to the next worktree on Ctrl+PageDown, and the previous on Ctrl+PageUp', () => {
    assert.strictEqual(worktreeStep({}), 1);
    assert.strictEqual(worktreeStep({ key: 'PageUp' }), -1);
    assert.strictEqual(worktreeStep({ ctrlKey: false }), undefined);
    assert.strictEqual(worktreeStep({ shiftKey: true }), undefined);
    assert.strictEqual(worktreeStep({ altKey: true }), undefined);
    assert.strictEqual(worktreeStep({ metaKey: true }), undefined);
    assert.strictEqual(worktreeStep({ key: 'Tab' }), undefined);
  });

  test('takes no key with Alt, nor one handled already or composing text', () => {
    for (const extra of [
      { altKey: true },
      { defaultPrevented: true },
      { isComposing: true },
      { keyCode: 229 },
    ]) {
      assert.strictEqual(
        pressed(keymap.commits, keyPress('c', extra), false),
        undefined,
        JSON.stringify(extra),
      );
    }
  });

  test('takes Alt only for a key bound with it', () => {
    const down = keyPress('ArrowDown');
    const altDown = keyPress('ArrowDown', { altKey: true });
    assert.strictEqual(pressed(keymap.parent, altDown, false), true);
    assert.strictEqual(pressed(keymap.parent, down, false), undefined);
    assert.strictEqual(pressed(keymap.move, altDown, false), undefined);
  });

  test('repeats a step held down, but not an action', () => {
    assert.strictEqual(
      pressed(keymap.change, keyPress('j', { repeat: true }), false),
      1,
    );
    assert.strictEqual(
      pressed(keymap.commits, keyPress('c', { repeat: true }), false),
      undefined,
    );
    assert.strictEqual(
      pressed(
        keymap.parent,
        keyPress('ArrowDown', { altKey: true, repeat: true }),
        false,
      ),
      undefined,
    );
  });

  test('leaves the keys that type or move the caret to a text field, but for those of fields', () => {
    assert.strictEqual(pressed(keymap.head, keyPress('h'), true), undefined);
    assert.strictEqual(
      pressed(keymap.shortcuts, keyPress('?'), true),
      undefined,
    );
    assert.strictEqual(pressed(keymap.shortcuts, keyPress('F1'), true), true);
    assert.strictEqual(
      pressed(keymap.column, keyPress('ArrowLeft'), true),
      undefined,
    );
    assert.strictEqual(
      pressed(keymap.parent, keyPress('ArrowDown', { altKey: true }), true),
      undefined,
    );
    assert.strictEqual(pressed(keymap.column, keyPress('Tab'), true), 'next');
    assert.strictEqual(
      pressed(keymap.find, keyPress('f', { ctrlKey: true }), true),
      true,
    );
    assert.strictEqual(pressed(keymap.result, keyPress('ArrowDown'), true), 1);
  });

  test('takes clicks of a button and the wheel with their modifiers', () => {
    const click = { button: 0, ...noModifiers };
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
    assert.strictEqual(wheeled(keymap.wheelSideways, noModifiers), undefined);
    assert.strictEqual(
      wheeled(keymap.wheelSideways, { ...noModifiers, shiftKey: true }),
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

  test('names the keys as the keyboard does, Mod as Ctrl, or Cmd on macOS, and Alt as Option there', () => {
    assert.deepStrictEqual(keyLabels('Mod+Shift+I', false), [
      'Ctrl',
      'Shift',
      'I',
    ]);
    assert.deepStrictEqual(keyLabels('Mod+T', true), ['⌘', 'T']);
    assert.deepStrictEqual(keyLabels('Ctrl+PageDown', true), ['Ctrl', 'PgDn']);
    assert.deepStrictEqual(keyLabels('ArrowLeft', false), ['←']);
    assert.deepStrictEqual(keyLabels('Alt+ArrowDown', false), ['Alt', '↓']);
    assert.deepStrictEqual(keyLabels('Alt+ArrowDown', true), ['⌥', '↓']);
    assert.deepStrictEqual(keyLabels('MiddleClick', false), ['Middle-click']);
  });

  test('leaves telling keys, modifiers and buttons apart to itself, so the shortcuts screen lists every one', () => {
    const source = path.join(__dirname, '../../../src');
    const own = ['keymap.ts', 'strings.ts'].map((file) =>
      path.join(source, 'shared', file),
    );
    const reads =
      /\b(?:e|ev|\w*[eE]vent|input)\.(?:key|code|button|control|meta|alt|shift)\b|\b\w+\.buttons\b|\b(?:ctrlKey|metaKey|altKey|shiftKey|isComposing|keyCode)\b|'(?:Arrow(?:Up|Down|Left|Right)|Page(?:Up|Down)|Home|End|Enter|Escape|Tab|F\d{1,2})'/;
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
