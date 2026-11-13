import * as assert from 'node:assert';
import { ChangeSet } from '@codemirror/state';
import { suite, test } from 'vitest';
import type { Page } from '../../../../shell/main/shell';
import type { ToWebview } from '../../../../shell/shared/protocol';
import {
  Editing,
  type EditingAccess,
  type EditingMessage,
} from '../../../../tools/commander/main/editing';
import { ReadOnlyFile } from '../../../../tools/commander/main/fileSaving';
import type {
  CommanderToWebview,
  CommanderToWebviewOf,
} from '../../../../tools/commander/shared/protocol';
import { plainOf, type Sentence } from '../../../../shared/strings';

class EditorPage implements Page {
  readonly messages: CommanderToWebview[] = [];
  disposed = false;

  post(message: ToWebview): void {
    if (message.type === 'tool' && message.tool === 'commander') {
      this.messages.push(message.message);
    }
  }

  last<T extends CommanderToWebview['type']>(
    type: T,
  ): CommanderToWebviewOf<T> | undefined {
    return this.messages.findLast(
      (message): message is CommanderToWebviewOf<T> => message.type === type,
    );
  }
}

const settled = async () => {
  for (let round = 0; round < 5; round++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
};

function editing(
  files: Record<string, string | Uint8Array> = {},
  textDefaults?: EditingAccess['textDefaults'],
  endingSources?: EditingAccess['endingSources'],
) {
  const saved: { file: string; bytes: string; overwrite: boolean }[] = [];
  const notices: string[] = [];
  const editedSources: string[] = [];
  const named: Page[] = [];
  const showing: Page[] = [];
  const stamps = new Map<string, number>();
  const watchers: { file: string; onChange: () => void }[] = [];
  let stamped = 0;
  const access: EditingAccess = {
    readFile: (file) => {
      const content = files[file];
      return content === undefined
        ? Promise.reject(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }))
        : Promise.resolve(
            typeof content === 'string'
              ? Buffer.from(content, 'latin1')
              : Buffer.from(content),
          );
    },
    readStart: (file) => access.readFile(file),
    statFile: (file) => {
      const content = files[file];
      return Promise.resolve(
        content === undefined
          ? undefined
          : { folder: file.endsWith('/'), size: content.length },
      );
    },
    saveFile: (file, bytes, overwrite) => {
      if (file.includes('read-only') && !overwrite) {
        return Promise.reject(new ReadOnlyFile(file));
      }
      saved.push({
        file,
        bytes: Buffer.from(bytes).toString('latin1'),
        overwrite,
      });
      files[file] = Buffer.from(bytes);
      stamps.set(file, ++stamped);
      return Promise.resolve('replaced');
    },
    stampOf: (file) =>
      Promise.resolve(
        files[file] === undefined ? undefined : String(stamps.get(file) ?? 0),
      ),
    watch: (file, onChange) => {
      const watcher = { file, onChange };
      watchers.push(watcher);
      return () => {
        watchers.splice(watchers.indexOf(watcher), 1);
      };
    },
    codePage: () => Promise.resolve('windows-1252'),
    readOnly: (file) => file.endsWith('.defaults.json'),
    ...(textDefaults !== undefined && { textDefaults }),
    ...(endingSources !== undefined && { endingSources }),
  };
  const edits = new Editing(access, {
    post: (page, message) =>
      page.post({ type: 'tool', tool: 'commander', message }),
    notice: (_page, notice) => notices.push(plainOf(notice.message)),
    namesChanged: (page) => named.push(page),
    pagesShowing: () => showing,
    openEdit: (_page, file) => {
      editedSources.push(file);
      return Promise.resolve();
    },
  });
  const touched = async (file: string) => {
    for (const watcher of watchers.filter((each) => each.file === file)) {
      watcher.onChange();
    }
    await settled();
  };
  const changeOnDisk = async (file: string, content: string) => {
    files[file] = content;
    stamps.set(file, ++stamped);
    await touched(file);
  };
  return {
    edits,
    saved,
    notices,
    editedSources,
    named,
    showing,
    changeOnDisk,
    touched,
    watchers,
  };
}

const forgedSource = (json: string): EditingMessage => JSON.parse(json);

function editFrom(
  page: EditorPage,
  tab: string,
  spec: Parameters<typeof ChangeSet.of>[0],
): {
  readonly type: 'editText';
  readonly tab: string;
  readonly update: unknown;
} {
  const shown = page.last('editedText')?.shown;
  if (shown === undefined) {
    throw new Error('No text');
  }
  return {
    type: 'editText',
    tab,
    update: {
      version: page.last('editing')?.version ?? shown.version,
      changes: ChangeSet.of(spec, shown.text.length).toJSON(),
    },
  };
}

suite('Editing a file', () => {
  test('reads the file of a tab once shown, tells the page its version and gives it the text once asked', async () => {
    const { edits } = editing({ 'a.txt': 'caf\xc3\xa9\r\n' });
    const page = new EditorPage();
    await edits.show(page, '1', 'a.txt');
    assert.deepStrictEqual(page.last('editing'), {
      type: 'editing',
      tab: '1',
      file: 'a.txt',
      version: 0,
      encoding: 'utf-8',
      encodingSources: [
        { kind: 'chosen' },
        { kind: 'bom' },
        { kind: 'utf16' },
        { kind: 'utf8', encoding: 'utf-8' },
        { kind: 'codePage', encoding: 'windows-1252' },
      ],
    });
    await edits.receive(page, { type: 'readEdited', tab: '1' });
    assert.deepStrictEqual(page.last('editedText')?.shown, {
      text: 'café\n',
      version: 0,
      encoding: 'utf-8',
      bom: false,
      ending: 'crlf',
      strayEndings: [],
      keptBytes: [],
    });
  });

  test('reads text that is not UTF-8 in the code page of the system, as the viewer does', async () => {
    const { edits } = editing({ 'a.txt': 'caf\xe9\n' });
    const page = new EditorPage();
    await edits.show(page, '1', 'a.txt');
    await edits.receive(page, { type: 'readEdited', tab: '1' });
    assert.strictEqual(page.last('editedText')?.shown.encoding, 'windows-1252');
    assert.strictEqual(page.last('editedText')?.shown.text, 'café\n');
  });

  test('opens a file not there yet as empty text in UTF-8, made once saved', async () => {
    const { edits, saved } = editing();
    const page = new EditorPage();
    await edits.show(page, '1', 'new.txt');
    assert.strictEqual(page.last('editing')?.made, true);
    await edits.receive(page, { type: 'readEdited', tab: '1' });
    await edits.receive(page, editFrom(page, '1', { from: 0, insert: 'hi\n' }));
    await edits.receive(page, { type: 'saveText', tab: '1' });
    assert.deepStrictEqual(saved, [
      { file: 'new.txt', bytes: 'hi\n', overwrite: false },
    ]);
  });

  test('applies the edits the page sends and saves the text byte for byte, telling the page and the tabs once it is changed and once it is not', async () => {
    const { edits, saved, named } = editing({ 'a.txt': 'one\r\ntwo\xff\r\n' });
    const page = new EditorPage();
    await edits.show(page, '1', 'a.txt');
    await edits.receive(page, { type: 'readEdited', tab: '1' });
    assert.strictEqual(edits.unsaved('1'), false);
    await edits.receive(page, editFrom(page, '1', { from: 3, insert: '!' }));
    assert.strictEqual(edits.unsaved('1'), true);
    assert.deepStrictEqual(page.last('textChanged'), {
      type: 'textChanged',
      tab: '1',
      changed: true,
    });
    assert.deepStrictEqual(named, [page]);
    await edits.receive(page, { type: 'saveText', tab: '1' });
    assert.deepStrictEqual(saved, [
      { file: 'a.txt', bytes: 'one!\r\ntwo\xff\r\n', overwrite: false },
    ]);
    assert.strictEqual(edits.unsaved('1'), false);
    assert.strictEqual(page.last('textChanged')?.changed, false);
    assert.deepStrictEqual(named, [page, page]);
  });

  test('sends the whole text again once an edit does not fit the version it holds, so the page starts over from it', async () => {
    const { edits } = editing({ 'a.txt': 'one\n' });
    const page = new EditorPage();
    await edits.show(page, '1', 'a.txt');
    await edits.receive(page, { type: 'readEdited', tab: '1' });
    const sent = page.messages.length;
    await edits.receive(page, {
      type: 'editText',
      tab: '1',
      update: { version: 7, changes: [[0, 'x'], 4] },
    });
    assert.deepStrictEqual(
      page.messages.slice(sent).map((message) => message.type),
      ['editedText'],
    );
    assert.strictEqual(page.last('editedText')?.shown.text, 'one\n');
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

  test('opens a file read-only where the app keeps one, saving nothing of it', async () => {
    const { edits, saved, notices } = editing({
      'settings.defaults.json': '{}\n',
    });
    const page = new EditorPage();
    await edits.show(page, '1', 'settings.defaults.json');
    assert.strictEqual(page.last('editing')?.readOnly, true);
    await edits.receive(page, { type: 'saveText', tab: '1' });
    assert.deepStrictEqual(saved, []);
    assert.deepStrictEqual(notices, [
      '"settings.defaults.json" is open read-only, so it isn\'t saved.',
    ]);
  });

  test('refuses to edit a folder, a file of binary data and one over 50 MB, saying why', async () => {
    const big = new Uint8Array(50 * 1024 * 1024 + 1);
    big.fill(0x61);
    const { edits } = editing({
      'folder/': '',
      'image.png': '\x89PNG\x00\x00',
      'big.log': big,
      'a.txt': 'a',
    });
    const plain = async (file: string) => {
      const refusal: Sentence | undefined = await edits.refusal(file);
      return refusal === undefined ? undefined : plainOf(refusal);
    };
    assert.strictEqual(
      await plain('folder/'),
      '"folder/" is a folder. F4 edits files.',
    );
    assert.strictEqual(
      await plain('image.png'),
      '"image.png" holds binary data, so it can\'t be edited as text. F3 views it.',
    );
    assert.strictEqual(
      await plain('big.log'),
      '"big.log" is over 50 MB, too large to edit. F3 views it.',
    );
    assert.strictEqual(await plain('a.txt'), undefined);
    assert.strictEqual(await plain('missing.txt'), undefined);
  });

  test('gives a page showing the tab again the state it kept of the version it holds, and none once edited since', async () => {
    const { edits } = editing({ 'a.txt': 'one\n' });
    const page = new EditorPage();
    await edits.show(page, '1', 'a.txt');
    await edits.receive(page, { type: 'readEdited', tab: '1' });
    await edits.receive(page, {
      type: 'editState',
      tab: '1',
      version: 0,
      state: { selection: 3 },
    });
    const other = new EditorPage();
    await edits.show(other, '1', 'a.txt');
    await edits.receive(other, { type: 'readEdited', tab: '1' });
    assert.deepStrictEqual(other.last('editedText')?.state, { selection: 3 });
    await edits.receive(other, editFrom(other, '1', { from: 0, insert: 'x' }));
    await edits.receive(other, { type: 'readEdited', tab: '1' });
    assert.strictEqual(other.last('editedText')?.state, undefined);
  });

  test('forgets the text of a tab once closed, reading the file afresh when opened again', async () => {
    const files: Record<string, string> = { 'a.txt': 'one\n' };
    const { edits } = editing(files);
    const page = new EditorPage();
    await edits.show(page, '1', 'a.txt');
    await edits.receive(page, { type: 'readEdited', tab: '1' });
    await edits.receive(page, editFrom(page, '1', { from: 0, insert: 'x' }));
    edits.closed('1');
    assert.strictEqual(edits.unsaved('1'), false);
    files['a.txt'] = 'two\n';
    await edits.show(page, '1', 'a.txt');
    await edits.receive(page, { type: 'readEdited', tab: '1' });
    assert.strictEqual(page.last('editedText')?.shown.text, 'two\n');
  });

  test('reads the file again once it changes on disk while it has no changes here, giving the pages showing it the new text in a version of its own, the cursor kept', async () => {
    const { edits, changeOnDisk, showing } = editing({ 'a.txt': 'one\n' });
    const page = new EditorPage();
    showing.push(page);
    await edits.show(page, '1', 'a.txt');
    await edits.receive(page, { type: 'readEdited', tab: '1' });
    await changeOnDisk('a.txt', 'two\nlines\n');
    assert.strictEqual(page.last('editedText')?.shown.text, 'two\nlines\n');
    assert.strictEqual(page.last('editedText')?.reloaded, true);
    assert.strictEqual(page.last('editing')?.version, 1);
    assert.strictEqual(page.last('editedText')?.shown.version, 1);
  });

  test('keeps the changes made here once the file changes on disk, saying so, and asks before saving over it, saving over it or reading it again as told', async () => {
    const { edits, changeOnDisk, showing, notices, saved } = editing({
      'a.txt': 'one\n',
    });
    const page = new EditorPage();
    showing.push(page);
    await edits.show(page, '1', 'a.txt');
    await edits.receive(page, { type: 'readEdited', tab: '1' });
    await edits.receive(page, editFrom(page, '1', { from: 0, insert: 'x' }));
    await changeOnDisk('a.txt', 'two\n');
    assert.strictEqual(page.last('editedText')?.shown.text, 'one\n');
    assert.deepStrictEqual(notices, [
      '"a.txt" changed on disk while edited here. Saving it writes over those changes.',
    ]);
    await edits.receive(page, { type: 'saveText', tab: '1' });
    assert.deepStrictEqual(page.last('askChangedOnDisk'), {
      type: 'askChangedOnDisk',
      tab: '1',
    });
    assert.deepStrictEqual(saved, []);
    await edits.receive(page, {
      type: 'saveText',
      tab: '1',
      overwriteChanged: true,
    });
    assert.deepStrictEqual(
      saved.map(({ bytes }) => bytes),
      ['xone\n'],
    );
    await edits.receive(page, editFrom(page, '1', { from: 0, insert: 'y' }));
    await changeOnDisk('a.txt', 'three\n');
    await edits.receive(page, { type: 'reloadEdited', tab: '1' });
    assert.strictEqual(page.last('editedText')?.shown.text, 'three\n');
    assert.strictEqual(edits.unsaved('1'), false);
    assert.strictEqual(page.last('textChanged')?.changed, false);
  });

  test('reads nothing again for the change its own saving makes to the file, and stops watching it once its tab is closed', async () => {
    const { edits, touched, showing, watchers } = editing({ 'a.txt': 'one\n' });
    const page = new EditorPage();
    showing.push(page);
    await edits.show(page, '1', 'a.txt');
    await edits.receive(page, { type: 'readEdited', tab: '1' });
    await edits.receive(page, editFrom(page, '1', { from: 0, insert: 'x' }));
    await edits.receive(page, { type: 'saveText', tab: '1' });
    const sent = page.messages.length;
    await touched('a.txt');
    assert.deepStrictEqual(page.messages.slice(sent), []);
    assert.strictEqual(watchers.length, 1);
    edits.closed('1');
    assert.strictEqual(watchers.length, 0);
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

  test('starts a file the viewer showed at the text of the byte it showed, in the encoding it was read in there, once only', async () => {
    const { edits } = editing({ 'a.txt': 'one\r\ntwo\r\ncaf\xc3\xa9\r\n' });
    const page = new EditorPage();
    edits.startAt('1', { byte: 10, encoding: 'windows-1252' });
    await edits.show(page, '1', 'a.txt');
    await edits.receive(page, { type: 'readEdited', tab: '1' });
    assert.strictEqual(page.last('editedText')?.at, 8);
    assert.strictEqual(page.last('editedText')?.shown.encoding, 'windows-1252');
    assert.strictEqual(
      page.last('editedText')?.shown.text,
      'one\ntwo\ncaf\xc3\xa9\n',
    );
    await edits.receive(page, {
      type: 'editState',
      tab: '1',
      version: 0,
      state: { selection: { ranges: [{ anchor: 2, head: 2 }], main: 0 } },
    });
    await edits.receive(page, { type: 'readEdited', tab: '1' });
    assert.strictEqual(page.last('editedText')?.at, undefined);

    edits.startAt('2', { byte: 1000 });
    await edits.show(page, '2', 'a.txt');
    await edits.receive(page, { type: 'readEdited', tab: '2' });
    assert.strictEqual(page.last('editedText')?.at, 13);
    assert.strictEqual(page.last('editedText')?.shown.encoding, 'utf-8');

    edits.startAt('3', { byte: 5 });
    edits.closed('3');
    await edits.show(page, '3', 'a.txt');
    await edits.receive(page, { type: 'readEdited', tab: '3' });
    assert.strictEqual(page.last('editedText')?.at, undefined);
  });

  test('reads the file again in the encoding chosen once it changes on disk, in the one found once Auto is chosen, and in the one it was saved in', async () => {
    const { edits, showing, changeOnDisk } = editing({
      'a.txt': 'caf\xc3\xa9\n',
    });
    const page = new EditorPage();
    showing.push(page);
    await edits.show(page, '1', 'a.txt');
    await edits.receive(page, {
      type: 'reopenIn',
      tab: '1',
      encoding: 'windows-1252',
    });
    await changeOnDisk('a.txt', 'caf\xc3\xa9!\n');
    assert.strictEqual(page.last('editedText')?.shown.encoding, 'windows-1252');
    assert.strictEqual(page.last('editedText')?.shown.text, 'caf\xc3\xa9!\n');

    await edits.receive(page, { type: 'reopenIn', tab: '1', encoding: 'auto' });
    await changeOnDisk('a.txt', 'caf\xc3\xa9?\n');
    assert.strictEqual(page.last('editedText')?.shown.encoding, 'utf-8');

    await edits.receive(page, {
      type: 'saveIn',
      tab: '1',
      encoding: 'windows-1250',
      bom: false,
    });
    await edits.receive(page, { type: 'saveText', tab: '1' });
    await changeOnDisk('a.txt', 'caf\xe9.\n');
    assert.strictEqual(page.last('editedText')?.shown.encoding, 'windows-1250');
  });

  test('gives the text read again the indentation the file is to have, as it gave the text first read', async () => {
    const { edits, showing, changeOnDisk } = editing({ 'a.txt': 'one\n' }, () =>
      Promise.resolve({
        ending: 'lf',
        encoding: 'utf-8',
        bom: false,
        indent: '\t',
        fallbackIndent: '  ',
        charsets: [],
      }),
    );
    const page = new EditorPage();
    showing.push(page);
    await edits.show(page, '1', 'a.txt');
    await edits.receive(page, { type: 'readEdited', tab: '1' });
    assert.strictEqual(page.last('editedText')?.shown.indent, '\t');
    await changeOnDisk('a.txt', 'two\n');
    assert.strictEqual(page.last('editedText')?.shown.text, 'two\n');
    assert.strictEqual(page.last('editedText')?.shown.indent, '\t');
    assert.strictEqual(page.last('editedText')?.shown.fallbackIndent, '  ');
  });

  test('tells the pages showing a file where its encoding and the line ending of its new lines come from once found out, a new file the charsets it may be written in', async () => {
    const endings = [
      { kind: 'editorConfig' },
      { kind: 'git', ending: 'crlf', by: 'core.autocrlf' },
      { kind: 'extension', extension: 'txt' },
      { kind: 'settings', ending: 'lf' },
    ] as const;
    const charsets = [
      { kind: 'editorConfig' },
      { kind: 'settings', encoding: 'utf-8', bom: false },
    ] as const;
    const { edits, showing } = editing(
      {
        'a.txt': 'caf\xc3\xa9\n',
        'b.txt': Uint8Array.of(0xff, 0xfe, 0x61, 0x00),
        'c.txt': Uint8Array.of(0x61, 0x00, 0x62, 0x00, 0x63, 0x00),
        'd.txt': 'caf\xe9\n',
      },
      () =>
        Promise.resolve({
          ending: 'lf',
          encoding: 'utf-8',
          bom: false,
          fallbackIndent: '    ',
          charsets,
        }),
      () => Promise.resolve(endings),
    );
    const page = new EditorPage();
    showing.push(page);
    const shownOf = async (tab: string, file: string) => {
      await edits.show(page, tab, file);
      const first = page.last('editing');
      await settled();
      return { first, last: page.last('editing') };
    };
    const { first, last } = await shownOf('1', 'a.txt');
    assert.deepStrictEqual(first?.encodingSources, [
      { kind: 'chosen' },
      { kind: 'bom' },
      { kind: 'utf16' },
      { kind: 'utf8', encoding: 'utf-8' },
      { kind: 'codePage', encoding: 'windows-1252' },
    ]);
    assert.deepStrictEqual(last?.endingSources, endings);
    const encodingsOf = async (tab: string, file: string) =>
      (await shownOf(tab, file)).last?.encodingSources;
    assert.deepStrictEqual((await encodingsOf('2', 'b.txt'))?.slice(1, 3), [
      { kind: 'bom', encoding: 'utf-16le' },
      { kind: 'utf16' },
    ]);
    assert.deepStrictEqual((await encodingsOf('3', 'c.txt'))?.slice(1, 3), [
      { kind: 'bom' },
      { kind: 'utf16', encoding: 'utf-16le' },
    ]);
    assert.deepStrictEqual((await encodingsOf('4', 'd.txt'))?.slice(3), [
      { kind: 'utf8' },
      { kind: 'codePage', encoding: 'windows-1252' },
    ]);
    await edits.receive(page, {
      type: 'reopenIn',
      tab: '4',
      encoding: 'iso-8859-2',
    });
    assert.deepStrictEqual((await encodingsOf('4', 'd.txt'))?.[0], {
      kind: 'chosen',
      encoding: 'iso-8859-2',
    });
    assert.deepStrictEqual(await encodingsOf('5', 'new.txt'), charsets);
  });

  test('edits the .editorconfig a line ending or charset of the file comes from once asked, and no other file, as the page is not trusted', async () => {
    const config = 'work/.editorconfig';
    const { edits, showing, editedSources } = editing(
      { 'a.txt': 'one\n' },
      undefined,
      () =>
        Promise.resolve([
          { kind: 'editorConfig', ending: 'lf', file: config },
          { kind: 'settings', ending: 'lf' },
        ]),
    );
    const page = new EditorPage();
    showing.push(page);
    await edits.show(page, '1', 'a.txt');
    await settled();
    await edits.receive(page, { type: 'editSource', tab: '1', file: config });
    await edits.receive(page, {
      type: 'editSource',
      tab: '1',
      file: 'work/secret.txt',
    });
    await edits.receive(page, forgedSource('{"type":"editSource","tab":"1"}'));
    assert.deepStrictEqual(editedSources, [config]);
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

  test('reads the file again in the encoding asked for, and in the one found once asked for Auto', async () => {
    const { edits, showing } = editing({
      'a.txt': Uint8Array.of(0x63, 0x61, 0x66, 0xe9, 0x0a),
    });
    const page = new EditorPage();
    showing.push(page);
    await edits.show(page, '1', 'a.txt');
    await edits.receive(page, { type: 'readEdited', tab: '1' });
    assert.strictEqual(page.last('editedText')?.shown.encoding, 'windows-1252');
    await edits.receive(page, {
      type: 'reopenIn',
      tab: '1',
      encoding: 'utf-8',
    });
    assert.strictEqual(page.last('editedText')?.shown.encoding, 'utf-8');
    assert.strictEqual(
      page.last('editedText')?.shown.text,
      String.fromCharCode(0x63, 0x61, 0x66, 0xfffd, 0x0a),
    );
    await edits.receive(page, { type: 'reopenIn', tab: '1', encoding: 'auto' });
    assert.strictEqual(page.last('editedText')?.shown.encoding, 'windows-1252');
    await edits.receive(
      page,
      JSON.parse('{"type":"reopenIn","tab":"1","encoding":"klingon"}'),
    );
    assert.strictEqual(page.last('editedText')?.shown.encoding, 'windows-1252');
  });
});
