import * as assert from 'node:assert';
import { ChangeSet } from '@codemirror/state';
import { suite, test } from 'vitest';
import { EditedText } from '../../../../tools/commander/main/editedText';
import { decodedText } from '../../../../tools/commander/main/textCodec';

const read = (text: string) =>
  new EditedText(decodedText(Buffer.from(text, 'latin1'), 'utf-8'));

function change(
  edited: EditedText,
  spec: Parameters<typeof ChangeSet.of>[0],
): unknown {
  return {
    version: edited.version,
    changes: ChangeSet.of(spec, edited.shown().text.length).toJSON(),
  };
}

function bytesOf(edited: EditedText): string {
  const written = edited.encoded();
  if (!('bytes' in written)) {
    throw new Error(JSON.stringify(written.unencodable));
  }
  return Buffer.from(written.bytes).toString('latin1');
}

suite('Text being edited', () => {
  test('applies the changes the page sends, one version after another, and writes the text it makes', () => {
    const edited = read('one\r\ntwo\r\n');
    assert.ok(edited.edit(change(edited, { from: 3, insert: '!' })));
    assert.ok(edited.edit(change(edited, { from: 0, to: 1, insert: 'O' })));
    assert.strictEqual(edited.version, 2);
    assert.strictEqual(edited.shown().text, 'One!\ntwo\n');
    assert.strictEqual(bytesOf(edited), 'One!\r\ntwo\r\n');
  });

  test('turns away a change made against another version, one of another length of text and anything that is not a change, keeping the text as it was', () => {
    const edited = read('text\n');
    const stale = change(edited, { from: 0, insert: 'a' });
    assert.ok(edited.edit(change(edited, { from: 0, insert: 'b' })));
    for (const wrong of [
      stale,
      {
        version: 1,
        changes: ChangeSet.of({ from: 0, insert: 'c' }, 2).toJSON(),
      },
      { version: 1, changes: [[0, 'x'], 'no'] },
      { version: 1 },
      'change',
      null,
    ]) {
      assert.strictEqual(edited.edit(wrong), false, JSON.stringify(wrong));
    }
    assert.strictEqual(edited.shown().text, 'btext\n');
    assert.strictEqual(edited.version, 1);
  });

  test('moves the line endings that are not those of the file and the bytes kept along with the edits, forgetting one whose character is deleted or typed over', () => {
    const edited = read('a\nb\rc\xe9d\ne\xe9\n');
    assert.deepStrictEqual(edited.shown().strayEndings, [
      { at: 3, ending: 'cr' },
    ]);
    assert.ok(edited.edit(change(edited, { from: 0, insert: '>>' })));
    assert.deepStrictEqual(edited.shown().strayEndings, [
      { at: 5, ending: 'cr' },
    ]);
    assert.deepStrictEqual(edited.shown().keptBytes, [
      { at: 7, bytes: [0xe9] },
      { at: 11, bytes: [0xe9] },
    ]);
    assert.strictEqual(bytesOf(edited), '>>a\nb\rc\xe9d\ne\xe9\n');
    assert.ok(
      edited.edit(
        change(edited, [
          { from: 5, to: 6 },
          { from: 11, to: 12, insert: 'é' },
        ]),
      ),
    );
    assert.deepStrictEqual(edited.shown().strayEndings, []);
    assert.deepStrictEqual(edited.shown().keptBytes, [
      { at: 6, bytes: [0xe9] },
    ]);
    assert.strictEqual(bytesOf(edited), '>>a\nbc\xe9d\ne\xc3\xa9\n');
  });

  test('is changed once edited and unchanged again once edited back to the text saved or saved, a line ending changed too', () => {
    const edited = read('a\r\nb\n');
    assert.strictEqual(edited.changed(), false);
    assert.ok(edited.edit(change(edited, { from: 1, insert: 'x' })));
    assert.strictEqual(edited.changed(), true);
    assert.ok(edited.edit(change(edited, { from: 1, to: 2 })));
    assert.strictEqual(edited.changed(), false);
    assert.ok(edited.edit(change(edited, { from: 3, to: 4 })));
    assert.ok(edited.edit(change(edited, { from: 3, insert: '\n' })));
    assert.strictEqual(edited.shown().text, 'a\nb\n');
    assert.strictEqual(edited.changed(), true);
    edited.saved();
    assert.strictEqual(edited.changed(), false);
  });

  test('writes every line break in the line ending asked for, and again as they were once asked for them back', () => {
    const edited = read('a\r\nb\nc\r\n');
    const { ending, strayEndings } = edited.shown();
    assert.ok(
      edited.edit({
        version: edited.version,
        endings: { ending: 'lf', strayEndings: [] },
      }),
    );
    assert.strictEqual(bytesOf(edited), 'a\nb\nc\n');
    assert.strictEqual(edited.changed(), true);
    assert.ok(
      edited.edit({
        version: edited.version,
        endings: { ending, strayEndings },
      }),
    );
    assert.strictEqual(bytesOf(edited), 'a\r\nb\nc\r\n');
    assert.strictEqual(edited.changed(), false);
    assert.strictEqual(
      edited.edit({
        version: edited.version,
        endings: { ending: 'unix', strayEndings: [] },
      }),
      false,
    );
  });
});
