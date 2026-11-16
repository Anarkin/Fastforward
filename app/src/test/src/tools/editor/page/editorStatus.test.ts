import * as assert from 'node:assert';
import { EditorSelection, EditorState } from '@codemirror/state';
import { suite, test } from 'vitest';
import { statusOf } from '../../../../../tools/editor/page/editorStatus';
import { plainCells } from '../../../../../lib/page/cellTable';

const stateOf = (doc: string, selection: EditorSelection) =>
  EditorState.create({
    doc,
    selection,
    extensions: EditorState.allowMultipleSelections.of(true),
  });

suite('Editor status', () => {
  test('gives the column of the cursor counted in cells, without the line it is on', () => {
    assert.strictEqual(
      statusOf(stateOf('one\nlet a;\n', EditorSelection.single(7)), plainCells),
      'Col 4',
    );
  });

  test('adds the characters selected, as they are seen, on every line of the selection', () => {
    assert.strictEqual(
      statusOf(stateOf('one\ntwo\n', EditorSelection.single(1, 6)), plainCells),
      'Col 3 · 5 characters selected',
    );
    assert.strictEqual(
      statusOf(stateOf('e\u0301', EditorSelection.single(0, 2)), plainCells),
      'Col 2 · 1 character selected',
    );
  });

  test('adds the cursors once there are several, with the characters selected by all of them', () => {
    assert.strictEqual(
      statusOf(
        stateOf(
          'let a;\nlet b;\nlet c;\n',
          EditorSelection.create(
            [
              EditorSelection.range(0, 3),
              EditorSelection.range(7, 10),
              EditorSelection.cursor(14),
            ],
            1,
          ),
        ),
        plainCells,
      ),
      'Col 4 · 6 characters selected · 3 cursors',
    );
    assert.strictEqual(
      statusOf(
        stateOf(
          'ab\ncd\n',
          EditorSelection.create([
            EditorSelection.cursor(1),
            EditorSelection.cursor(4),
          ]),
        ),
        plainCells,
      ),
      'Col 2 · 2 cursors',
    );
  });
});
