import * as assert from 'node:assert';
import { ChangeSet } from '@codemirror/state';
import { suite, test } from 'vitest';
import { plainOf } from '../../../../../lib/shared/sentences';
import { strings } from '../../../../../lib/shared/strings';
import { EditorPage, editing, editFrom, settled } from './editingFixtures';

const typed = (version: number, insert: string, length: number) => ({
  type: 'editText' as const,
  tab: '1',
  update: {
    version,
    changes: ChangeSet.of({ from: 0, insert }, length).toJSON(),
  },
});

suite('Saving a file edited', () => {
  test('saves a read-only file changed on disk once told to save over the change and then to overwrite it, asking each once, as each answer dropped the other and the two questions alternated for ever', async () => {
    const files = { 'read-only.txt': 'one\n' };
    const { edits, showing, changeOnDisk } = editing(files);
    const page = new EditorPage();
    showing.push(page);
    await edits.show(page, '1', 'read-only.txt');
    await edits.receive(page, { type: 'readEdited', tab: '1' });
    await edits.receive(page, typed(0, 'A', 4));
    await changeOnDisk('read-only.txt', 'theirs\n');
    const asked = () =>
      page.messages.flatMap((each) =>
        each.type === 'askChangedOnDisk' || each.type === 'askOverwrite'
          ? [each.type]
          : [],
      );

    assert.strictEqual(await edits.save(page, '1'), false);
    assert.strictEqual(await edits.save(page, '1', { changed: true }), false);
    assert.strictEqual(await edits.save(page, '1', { readOnly: true }), true);

    assert.deepStrictEqual(asked(), ['askChangedOnDisk', 'askOverwrite']);
    assert.strictEqual(
      Buffer.from(files['read-only.txt']).toString('latin1'),
      'Aone\n',
    );
  });

  test('saves a file one save at a time, a save asked for while one runs waiting for it, as two saves writing at once cut the file short or left a stale end', async () => {
    const files = { 'a.txt': 'one\n' };
    const { edits, saving, showing } = editing(files);
    const page = new EditorPage();
    showing.push(page);
    await edits.show(page, '1', 'a.txt');
    await edits.receive(page, { type: 'readEdited', tab: '1' });
    const held = Promise.withResolvers<void>();
    saving.until = held.promise;

    await edits.receive(page, typed(0, 'A', 4));
    const first = edits.save(page, '1');
    await edits.receive(page, typed(1, 'B', 5));
    const second = edits.save(page, '1');
    held.resolve();
    assert.deepStrictEqual(await Promise.all([first, second]), [true, true]);

    assert.strictEqual(saving.most, 1);
    assert.strictEqual(
      Buffer.from(files['a.txt']).toString('latin1'),
      'BAone\n',
    );
    assert.strictEqual(edits.unsaved('1'), false);
  });

  test('reads the file again only once a save running has written it, as a reload read the bytes from before the save and showed them over the text saved, taking them for what is on disk', async () => {
    const files = { 'a.txt': 'one\n' };
    const { edits, saving, showing } = editing(files);
    const page = new EditorPage();
    showing.push(page);
    await edits.show(page, '1', 'a.txt');
    await edits.receive(page, { type: 'readEdited', tab: '1' });
    const held = Promise.withResolvers<void>();
    saving.until = held.promise;

    await edits.receive(page, typed(0, 'A', 4));
    const saved = edits.save(page, '1');
    const reloaded = edits.receive(page, { type: 'reloadEdited', tab: '1' });
    await settled();
    held.resolve();
    await Promise.all([saved, reloaded]);

    assert.strictEqual(page.last('editedText')?.shown.text, 'Aone\n');
    assert.strictEqual(edits.unsaved('1'), false);
  });

  test('follows the file on disk again after a save that failed once the file was written, as a save that threw there kept the file taken for saving and no change on disk was seen again', async () => {
    const files: Record<string, string | Uint8Array> = { 'a.txt': 'one\n' };
    const { edits, showing, access, changeOnDisk, notices } = editing(files);
    const page = new EditorPage();
    showing.push(page);
    await edits.show(page, '1', 'a.txt');
    await edits.receive(page, { type: 'readEdited', tab: '1' });
    Object.assign(access, {
      codePage: () => Promise.reject(new Error('The code page is gone.')),
    });

    await edits.receive(page, typed(0, 'A', 4));
    await assert.rejects(edits.save(page, '1'));
    await changeOnDisk('a.txt', 'theirs\n');

    assert.deepStrictEqual(notices, [
      plainOf(strings.editor.changedOutside('a.txt')),
    ]);
  });

  test('takes a change another program makes right after a save for a change on disk, reading it again, rather than for its own save', async () => {
    const files: Record<string, string | Uint8Array> = { 'a.txt': 'one\n' };
    const { edits, saving, showing } = editing(files);
    const page = new EditorPage();
    showing.push(page);
    await edits.show(page, '1', 'a.txt');
    await edits.receive(page, { type: 'readEdited', tab: '1' });
    saving.after = (file) => {
      files[file] = 'theirs\n';
    };

    await edits.receive(
      page,
      editFrom(page, '1', { from: 0, insert: 'mine ' }),
    );
    await edits.receive(page, { type: 'saveText', tab: '1' });

    assert.strictEqual(page.last('editedText')?.shown.text, 'theirs\n');
  });

  test('asks before saving over a read-only file, and saves over it once told to', async () => {
    const { edits, saved, showing } = editing({ 'read-only.txt': 'a\n' });
    const page = new EditorPage();
    showing.push(page);
    await edits.show(page, '1', 'read-only.txt');
    await edits.receive(page, { type: 'readEdited', tab: '1' });
    await edits.receive(page, editFrom(page, '1', { from: 0, insert: 'b' }));
    await edits.receive(page, { type: 'saveText', tab: '1' });
    assert.deepStrictEqual(page.last('askOverwrite'), {
      type: 'askOverwrite',
      tab: '1',
    });
    assert.deepStrictEqual(saved, []);
    await edits.receive(page, {
      type: 'saveText',
      tab: '1',
      overwriteReadOnly: true,
    });
    assert.deepStrictEqual(saved, [
      { file: 'read-only.txt', bytes: 'ba\n', overwrite: true },
    ]);
  });

  test('names the characters the encoding of the file cannot hold rather than saving it', async () => {
    const { edits, saved, notices } = editing({ 'a.txt': 'caf\xe9\n' });
    const page = new EditorPage();
    await edits.show(page, '1', 'a.txt');
    await edits.receive(page, { type: 'readEdited', tab: '1' });
    await edits.receive(page, editFrom(page, '1', { from: 0, insert: '中' }));
    await edits.receive(page, { type: 'saveText', tab: '1' });
    assert.deepStrictEqual(saved, []);
    assert.deepStrictEqual(notices, [
      'Couldn\'t save "a.txt", as windows-1252 has no "中".',
    ]);
    assert.strictEqual(edits.unsaved('1'), true);
  });

  test('says where what was saved is kept once it could not take the place of the file, keeping the text unsaved', async () => {
    const { edits, saved, notices } = editing({ 'kept-beside.txt': 'a\n' });
    const page = new EditorPage();
    await edits.show(page, '1', 'kept-beside.txt');
    await edits.receive(page, { type: 'readEdited', tab: '1' });
    await edits.receive(page, editFrom(page, '1', { from: 0, insert: 'b' }));
    await edits.receive(page, { type: 'saveText', tab: '1' });
    assert.deepStrictEqual(saved, []);
    assert.deepStrictEqual(notices, [
      'Couldn\'t save "kept-beside.txt" in its place, so what was saved is kept beside it in ".kept-beside.txt.saving-1".',
    ]);
    assert.strictEqual(edits.unsaved('1'), true);
  });

  test('saves the text in the encoding asked for, with or without a byte order mark, as a change until saved, and names the characters it cannot hold rather than taking it', async () => {
    const text = 'café 中\n';
    const { edits, saved, notices, showing } = editing({
      'a.txt': Buffer.from(text, 'utf8'),
    });
    const page = new EditorPage();
    showing.push(page);
    await edits.show(page, '1', 'a.txt');
    await edits.receive(page, { type: 'readEdited', tab: '1' });
    assert.strictEqual(page.last('editing')?.encoding, 'utf-8');
    await edits.receive(page, {
      type: 'saveIn',
      tab: '1',
      encoding: 'windows-1252',
      bom: false,
    });
    assert.deepStrictEqual(notices, [
      'Couldn\'t save "a.txt", as windows-1252 has no "中".',
    ]);
    await edits.receive(page, {
      type: 'saveIn',
      tab: '1',
      encoding: 'utf-8',
      bom: true,
    });
    assert.strictEqual(page.last('editing')?.bom, true);
    assert.strictEqual(edits.unsaved('1'), true);
    await edits.receive(page, { type: 'saveText', tab: '1' });
    assert.deepStrictEqual(
      saved.map(({ bytes }) => bytes),
      [
        Buffer.concat([
          Buffer.from([0xef, 0xbb, 0xbf]),
          Buffer.from(text, 'utf8'),
        ]).toString('latin1'),
      ],
    );
    assert.strictEqual(edits.unsaved('1'), false);
  });

  test("keeps the encoding of a text holding bytes it couldn't read rather than writing them into another, saying why", async () => {
    const { edits, notices, showing } = editing({
      'a.txt': Buffer.from('caf\xe9\n', 'latin1'),
    });
    const page = new EditorPage();
    showing.push(page);
    await edits.show(page, '1', 'a.txt');
    await edits.receive(page, {
      type: 'reopenIn',
      tab: '1',
      encoding: 'utf-8',
    });
    await edits.receive(page, {
      type: 'saveIn',
      tab: '1',
      encoding: 'windows-1252',
      bom: false,
    });
    assert.deepStrictEqual(notices, [
      'Couldn\'t save "a.txt" in windows-1252, as it holds bytes utf-8 couldn\'t read, which are kept as they were only in utf-8.',
    ]);
    assert.strictEqual(page.last('editedText')?.shown.encoding, 'utf-8');
    assert.strictEqual(edits.unsaved('1'), false);
  });

  test('saves the text in the encoding and byte order mark the file has on disk once Auto is asked for, telling the page what it has on disk only while it is to be saved otherwise', async () => {
    const { edits, showing } = editing({
      'a.txt': Buffer.from('\xef\xbb\xbfcaf\xc3\xa9\n', 'latin1'),
    });
    const page = new EditorPage();
    showing.push(page);
    await edits.show(page, '1', 'a.txt');
    await edits.receive(page, { type: 'readEdited', tab: '1' });
    assert.strictEqual(page.last('editing')?.onDisk, undefined);

    await edits.receive(page, {
      type: 'saveIn',
      tab: '1',
      encoding: 'windows-1252',
      bom: false,
    });
    assert.deepStrictEqual(page.last('editing')?.onDisk, {
      encoding: 'utf-8',
      bom: true,
    });
    assert.strictEqual(edits.unsaved('1'), true);

    await edits.receive(page, {
      type: 'saveIn',
      tab: '1',
      encoding: 'auto',
      bom: false,
    });
    assert.strictEqual(page.last('editing')?.encoding, 'utf-8');
    assert.strictEqual(page.last('editing')?.bom, true);
    assert.strictEqual(page.last('editing')?.onDisk, undefined);
    assert.strictEqual(edits.unsaved('1'), false);
  });

  test('takes a file saved in another encoding as read in it, listing where its encoding comes from as reading it again would', async () => {
    const { edits, showing } = editing({
      'a.txt': Buffer.from('caf\xe9\n', 'latin1'),
    });
    const page = new EditorPage();
    showing.push(page);
    await edits.show(page, '1', 'a.txt');
    await edits.receive(page, { type: 'readEdited', tab: '1' });
    assert.strictEqual(page.last('editing')?.encoding, 'windows-1252');

    await edits.receive(page, {
      type: 'saveIn',
      tab: '1',
      encoding: 'utf-8',
      bom: false,
    });
    await edits.receive(page, { type: 'saveText', tab: '1' });
    assert.strictEqual(page.last('editing')?.encoding, 'utf-8');
    assert.strictEqual(page.last('editing')?.onDisk, undefined);
    assert.deepStrictEqual(page.last('editing')?.encodingSources, [
      { kind: 'chosen' },
      { kind: 'bom' },
      { kind: 'utf16' },
      { kind: 'utf8', encoding: 'utf-8' },
      { kind: 'codePage', encoding: 'windows-1252' },
    ]);

    await edits.receive(page, {
      type: 'saveIn',
      tab: '1',
      encoding: 'windows-1250',
      bom: false,
    });
    await edits.receive(page, { type: 'saveText', tab: '1' });
    assert.deepStrictEqual(page.last('editing')?.encodingSources?.[0], {
      kind: 'chosen',
      encoding: 'windows-1250',
    });
  });

  test('tells the page to trim the lines edited and end the file with a line break as saved where the .editorconfig says so', async () => {
    const { edits } = editing({ 'a.txt': 'one' }, () =>
      Promise.resolve({
        ending: 'lf',
        encoding: 'utf-8',
        bom: false,
        fallbackIndent: '    ',
        charsets: [],
        trimTrailingWhitespace: true,
        insertFinalNewline: true,
      }),
    );
    const page = new EditorPage();
    await edits.show(page, '1', 'a.txt');
    await edits.receive(page, { type: 'readEdited', tab: '1' });
    const shown = page.last('editedText')?.shown;
    assert.strictEqual(shown?.trimTrailingWhitespace, true);
    assert.strictEqual(shown?.insertFinalNewline, true);
  });
});
