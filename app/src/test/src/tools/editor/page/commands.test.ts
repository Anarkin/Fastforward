import * as assert from 'node:assert';
import { EditorSelection } from '@codemirror/state';
import { suite, test } from 'vitest';
import { escapeCloses } from '../../../../../tools/editor/page/commands';
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

  test('views the file on F3, as F4 edits the file a viewer shows', () => {
    assert.deepStrictEqual(editorKeymap.viewEdited.keys, { F3: true });
  });
});
