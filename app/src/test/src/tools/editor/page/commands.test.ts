import * as assert from 'node:assert';
import { EditorSelection } from '@codemirror/state';
import { suite, test } from 'vitest';
import { escapeCloses } from '../../../../../tools/editor/page/commands';
import { pageRows } from '../../../../../tools/editor/page/cursorKeys';
import { editorKeymap } from '../../../../../tools/editor/page/keymap';

suite('Editor keys', () => {
  test('closes the file on Escape, as the viewer does, only once it has one cursor and nothing selected, dropping the extra cursors or the selection first', () => {
    assert.strictEqual(escapeCloses(EditorSelection.single(3)), true);
    assert.strictEqual(escapeCloses(EditorSelection.single(1, 4)), false);
    assert.strictEqual(
      escapeCloses(
        EditorSelection.create([
          EditorSelection.cursor(1),
          EditorSelection.cursor(5),
        ]),
      ),
      false,
    );
  });

  test('lets the next Tab move the focus on after Ctrl+M rather than after Escape, which closes the file', () => {
    assert.deepStrictEqual(editorKeymap.closeEditor.keys, { Escape: true });
    assert.deepStrictEqual(editorKeymap.singleCursor.keys, { Escape: true });
    assert.deepStrictEqual(editorKeymap.tabLeaves.keys, { 'Ctrl+M': true });
  });

  test('moves the cursor itself on the arrows up and down, the page keys and Ctrl+Home and Ctrl+End, selecting with Shift, rather than leaving them to the caret of the browser, which knows only the lines drawn', () => {
    const moves = ['up', 'down', 'selectUp', 'selectDown'];
    assert.deepStrictEqual(editorKeymap.cursorRow.keys, {
      ArrowUp: 'up',
      ArrowDown: 'down',
      'Shift+ArrowUp': 'selectUp',
      'Shift+ArrowDown': 'selectDown',
    });
    assert.deepStrictEqual(Object.keys(editorKeymap.cursorPage.keys), [
      'PageUp',
      'PageDown',
      'Shift+PageUp',
      'Shift+PageDown',
    ]);
    assert.deepStrictEqual(Object.values(editorKeymap.cursorPage.keys), moves);
    assert.deepStrictEqual(Object.keys(editorKeymap.cursorFileEnd.keys), [
      'Mod+Home',
      'Mod+End',
      'Mod+Shift+Home',
      'Mod+Shift+End',
    ]);
    assert.deepStrictEqual(
      Object.values(editorKeymap.cursorFileEnd.keys),
      moves,
    );
  });

  test('moves the cursor itself a character or a word left or right and to the start of the row, selecting with Shift, rather than leaving them to the caret of the browser, which stood still beside the places a wrapped line may break, as right before an opening bracket', () => {
    assert.deepStrictEqual(editorKeymap.cursorCharacter.keys, {
      ArrowLeft: 'left',
      ArrowRight: 'right',
      'Shift+ArrowLeft': 'selectLeft',
      'Shift+ArrowRight': 'selectRight',
    });
    assert.deepStrictEqual(editorKeymap.cursorWord.keys, {
      'Ctrl+ArrowLeft': 'left',
      'Ctrl+ArrowRight': 'right',
      'Ctrl+Shift+ArrowLeft': 'selectLeft',
      'Ctrl+Shift+ArrowRight': 'selectRight',
    });
    assert.deepStrictEqual(editorKeymap.rowStart.keys, {
      Home: 'move',
      'Shift+Home': 'select',
    });
  });

  test('moves a page by the whole rows the view shows but one, as the lists do, so the row the cursor leaves stays in sight, and by a row in a view of one row or none', () => {
    assert.deepStrictEqual(
      [
        pageRows(778, 18),
        pageRows(360, 18),
        pageRows(18, 18),
        pageRows(0, 18),
        pageRows(400, 0),
      ],
      [42, 19, 1, 1, 1],
    );
  });

  test('views the file on F3, as F4 edits the file a viewer shows, and compares its versions on Shift+F3, as the viewer and the commander do', () => {
    assert.deepStrictEqual(editorKeymap.viewEdited.keys, { F3: true });
    assert.deepStrictEqual(editorKeymap.compareVersions.keys, {
      'Shift+F3': true,
    });
  });
});
