import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, suite, test } from 'vitest';
import { Editing } from '../../../../../tools/editor/main/editing';
import { editingFiles } from '../../../../../tools/editor/main/editingFiles';
import { removeFolder, tempFolder } from '../../../../helpers/tempFolders';
import { waitFor } from '../../../../helpers/fixtures';
import { EditorPage, editFrom } from './editingFixtures';

interface Sample {
  readonly name: string;
  readonly bytes: Buffer;
  readonly text: string;
  readonly typedAtStart: Buffer;
}

const utf16be = (text: string) => Buffer.from(text, 'utf16le').swap16();

const bom = {
  utf8: Buffer.from([0xef, 0xbb, 0xbf]),
  utf16le: Buffer.from([0xff, 0xfe]),
  utf16be: Buffer.from([0xfe, 0xff]),
};

const typedAtStartOf = (bytes: Buffer, typed: Buffer, after = 0) =>
  Buffer.concat([bytes.subarray(0, after), typed, bytes.subarray(after)]);

const sample = (
  name: string,
  bytes: Buffer,
  text: string,
  typed = Buffer.from('X'),
  after = 0,
): Sample => ({
  name,
  bytes,
  text,
  typedAtStart: typedAtStartOf(bytes, typed, after),
});

const samples: readonly Sample[] = [
  sample('empty.ini', Buffer.alloc(0), ''),
  sample('lf.txt', Buffer.from('one\ntwo\n'), 'one\ntwo\n'),
  sample('crlf.ini', Buffer.from('[a]\r\nb=1\r\n'), '[a]\nb=1\n'),
  sample('mixed.bar', Buffer.from('a\r\nb\nc\rd'), 'a\nb\nc\nd'),
  sample('unended.br2', Buffer.from('last line'), 'last line'),
  sample(
    'bom.txt',
    Buffer.concat([bom.utf8, Buffer.from('café\n')]),
    'café\n',
    Buffer.from('X'),
    3,
  ),
  sample(
    'utf16le.txt',
    Buffer.concat([bom.utf16le, Buffer.from('héllo\r\n', 'utf16le')]),
    'héllo\n',
    Buffer.from('X', 'utf16le'),
    2,
  ),
  sample(
    'utf16be.txt',
    Buffer.concat([bom.utf16be, utf16be('héllo\n')]),
    'héllo\n',
    utf16be('X'),
    2,
  ),
  sample('cp1252.txt', Buffer.from('caf\xe9\r\n', 'latin1'), 'café\n'),
  sample(
    'lines.txt',
    Buffer.from(
      Array.from({ length: 5000 }, (_, at) => `line ${at}\r\n`).join(''),
    ),
    Array.from({ length: 5000 }, (_, at) => `line ${at}\n`).join(''),
  ),
];

const strays: readonly Buffer[] = [
  Buffer.from('a\x81b\n', 'latin1'),
  Buffer.from([0x61, 0xc3, 0x28, 0x0a, 0xe2, 0x82, 0xac, 0x0a]),
];

const editingOnDisk = () => {
  const saved: string[] = [];
  const notices: string[] = [];
  const page = new EditorPage();
  const watchers: (() => void)[] = [];
  const edits = new Editing(
    editingFiles({
      watch: (_file, onChange) => {
        watchers.push(onChange);
        return () => {};
      },
      codePage: () => Promise.resolve('windows-1252'),
      readOnlyCopy: () => false,
      copySaved: (file) => {
        saved.push(file);
      },
    }),
    {
      post: (shownIn, message) =>
        shownIn.post({ type: 'tool', tool: 'editor', message }),
      notice: (_page, notice) => notices.push(JSON.stringify(notice)),
      namesChanged: () => {},
      pagesShowing: () => [page],
      holds: (shownIn) => shownIn === page,
      openEdit: () => Promise.resolve(),
    },
  );
  const textOf = async (tab: string, file: string) => {
    await edits.show(page, tab, file);
    await edits.receive(page, { type: 'readEdited', tab });
    const shown = page.messages.findLast(
      (message) => message.type === 'editedText' && message.tab === tab,
    );
    return shown?.type === 'editedText' ? shown.shown.text : undefined;
  };
  const touched = () => {
    for (const onChange of watchers) {
      onChange();
    }
  };
  return { edits, page, saved, notices, textOf, touched };
};

const sameDate = new Date('2026-01-02T03:04:05Z');

const datedAlike = (file: string) => fs.utimesSync(file, sameDate, sameDate);

const rewrittenAlike = (file: string, bytes: string) => {
  fs.writeFileSync(file, bytes);
  datedAlike(file);
};

suite('Editing files on disk', () => {
  let folder: string;

  beforeEach(() => {
    folder = tempFolder('editing-files');
  });

  afterEach(() => {
    removeFolder(folder);
  });

  const written = (name: string, bytes: Buffer) => {
    const file = path.join(folder, name);
    fs.writeFileSync(file, bytes);
    return file;
  };

  test('shows the text each file decodes to, whatever its encoding and line endings, and saves it unchanged byte for byte', async () => {
    for (const { name, bytes, text } of samples) {
      const file = written(name, bytes);
      const { edits, page, notices, textOf } = editingOnDisk();
      assert.strictEqual(await textOf('1', file), text, name);
      assert.ok(await edits.save(page, '1'), name);
      assert.deepStrictEqual(fs.readFileSync(file), bytes, name);
      assert.deepStrictEqual(notices, [], name);
    }
  });

  test('saves a character typed at the start of each file as its encoding writes it, after its byte order mark, changing no other byte', async () => {
    for (const { name, bytes, text, typedAtStart } of samples) {
      const file = written(name, bytes);
      const { edits, page, textOf } = editingOnDisk();
      assert.strictEqual(await textOf('1', file), text, name);
      await edits.receive(page, editFrom(page, '1', { from: 0, insert: 'X' }));
      assert.ok(await edits.save(page, '1'), name);
      assert.deepStrictEqual(fs.readFileSync(file), typedAtStart, name);
      const again = editingOnDisk();
      assert.strictEqual(await again.textOf('1', file), `X${text}`, name);
    }
  });

  test('saves the bytes its encoding cannot decode as they were, around a character typed at the start', async () => {
    for (const [at, bytes] of strays.entries()) {
      const file = written(`stray${at}.txt`, bytes);
      const { edits, page, textOf } = editingOnDisk();
      assert.notStrictEqual(await textOf('1', file), undefined);
      assert.ok(await edits.save(page, '1'));
      assert.deepStrictEqual(fs.readFileSync(file), bytes);
      await edits.receive(page, editFrom(page, '1', { from: 0, insert: 'X' }));
      assert.ok(await edits.save(page, '1'));
      assert.deepStrictEqual(
        fs.readFileSync(file),
        Buffer.concat([Buffer.from('X'), bytes]),
      );
    }
  });

  test('keeps the files of two tabs apart, though their names differ only in their extension and they are as long, each save writing its own file alone', async () => {
    const bar = written('default.bar', Buffer.from('[Buttonbar]\r\nbar\r\n'));
    const br2 = written('default.br2', Buffer.from('[Buttonbar]\r\nbr2\r\n'));
    const { edits, page, textOf } = editingOnDisk();
    assert.strictEqual(await textOf('1', bar), '[Buttonbar]\nbar\n');
    assert.strictEqual(await textOf('2', br2), '[Buttonbar]\nbr2\n');
    await edits.receive(page, editFrom(page, '2', { from: 0, insert: ';' }));
    assert.ok(await edits.save(page, '2'));
    assert.strictEqual(
      fs.readFileSync(br2, 'latin1'),
      ';[Buttonbar]\r\nbr2\r\n',
    );
    assert.strictEqual(
      fs.readFileSync(bar, 'latin1'),
      '[Buttonbar]\r\nbar\r\n',
    );
    assert.ok(await edits.save(page, '1'));
    assert.strictEqual(
      fs.readFileSync(bar, 'latin1'),
      '[Buttonbar]\r\nbar\r\n',
    );
    assert.strictEqual(
      fs.readFileSync(br2, 'latin1'),
      ';[Buttonbar]\r\nbr2\r\n',
    );
  });

  test('asks before saving over a file whose bytes changed on disk though its size and dates did not, as on a FAT drive or a share whose files have no id, leaving the bytes there as they are', async () => {
    const file = written('alike.txt', Buffer.from('aaaa\n'));
    datedAlike(file);
    const { edits, page, textOf } = editingOnDisk();
    assert.strictEqual(await textOf('1', file), 'aaaa\n');
    await edits.receive(page, editFrom(page, '1', { from: 0, insert: 'X' }));
    rewrittenAlike(file, 'bbbb\n');
    assert.strictEqual(await edits.save(page, '1'), false);
    assert.strictEqual(page.last('askChangedOnDisk')?.tab, '1');
    assert.strictEqual(fs.readFileSync(file, 'utf8'), 'bbbb\n');
  });

  test('reads a file again once its bytes change on disk though its size and dates do not, while it has no changes here', async () => {
    const file = written('alike.txt', Buffer.from('aaaa\n'));
    datedAlike(file);
    const { page, textOf, touched } = editingOnDisk();
    assert.strictEqual(await textOf('1', file), 'aaaa\n');
    rewrittenAlike(file, 'bbbb\n');
    touched();
    await waitFor(
      () => page.last('editedText')?.shown.text === 'bbbb\n',
      'the file read again',
    );
    assert.strictEqual(page.last('editedText')?.reloaded, true);
  });

  test('takes a file whose dates changed on disk but not its bytes as unchanged, saving the changes made here without asking', async () => {
    const file = written('touched.txt', Buffer.from('same\n'));
    const { edits, page, notices, textOf, touched } = editingOnDisk();
    assert.strictEqual(await textOf('1', file), 'same\n');
    await edits.receive(page, editFrom(page, '1', { from: 0, insert: 'X' }));
    datedAlike(file);
    touched();
    assert.ok(await edits.save(page, '1'));
    assert.strictEqual(fs.readFileSync(file, 'utf8'), 'Xsame\n');
    assert.strictEqual(page.last('askChangedOnDisk'), undefined);
    assert.deepStrictEqual(notices, []);
  });

  test('asks before saving over a file made on disk since the editor opened it as a new file, leaving the file made as it is', async () => {
    const file = path.join(folder, 'made.txt');
    const { edits, page, textOf } = editingOnDisk();
    assert.strictEqual(await textOf('1', file), '');
    await edits.receive(page, editFrom(page, '1', { from: 0, insert: 'mine' }));
    fs.writeFileSync(file, 'theirs');
    assert.strictEqual(await edits.save(page, '1'), false);
    assert.strictEqual(page.last('askChangedOnDisk')?.tab, '1');
    assert.strictEqual(fs.readFileSync(file, 'utf8'), 'theirs');
  });

  test('asks before saving over a file it cannot read to tell whether it changed, as one another program holds open while writing it, rather than failing', async () => {
    const file = written('held.txt', Buffer.from('held\n'));
    const { edits, page, textOf } = editingOnDisk();
    assert.strictEqual(await textOf('1', file), 'held\n');
    await edits.receive(page, editFrom(page, '1', { from: 0, insert: 'X' }));
    fs.rmSync(file);
    fs.mkdirSync(file);
    assert.strictEqual(await edits.save(page, '1'), false);
    assert.strictEqual(page.last('askChangedOnDisk')?.tab, '1');
    assert.ok(fs.statSync(file).isDirectory());
  });

  test('stamps a file over 50 MB by its size and its time alone, never reading it whole, as the editor refuses it', async () => {
    const access = editingFiles({
      watch: () => () => {},
      codePage: () => Promise.resolve('utf-8'),
      readOnlyCopy: () => false,
      copySaved: () => {},
    });
    const size = 50 * 1024 * 1024 + 1;
    const [one, other] = ['one.log', 'other.log'].map((name) =>
      path.join(folder, name),
    );
    assert.ok(one !== undefined && other !== undefined);
    for (const [file, byte] of [
      [one, 0x61],
      [other, 0x62],
    ] as const) {
      fs.writeFileSync(file, '');
      fs.truncateSync(file, size);
      const handle = fs.openSync(file, 'r+');
      fs.writeSync(handle, Buffer.from([byte]), 0, 1, 0);
      fs.closeSync(handle);
      fs.utimesSync(file, 1_700_000_000, 1_700_000_000);
    }
    assert.strictEqual(await access.stampOf(one), await access.stampOf(other));
    fs.appendFileSync(other, 'more');
    assert.notStrictEqual(
      await access.stampOf(one),
      await access.stampOf(other),
    );
  });
});
