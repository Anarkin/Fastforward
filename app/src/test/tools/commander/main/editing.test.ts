import * as assert from 'node:assert';
import { ChangeSet } from '@codemirror/state';
import { suite, test } from 'vitest';
import type { Page } from '../../../../shell/main/shell';
import type { ToWebview } from '../../../../shell/shared/protocol';
import {
  Editing,
  type EditingAccess,
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

function editing(files: Record<string, string | Uint8Array> = {}) {
  const saved: { file: string; bytes: string; overwrite: boolean }[] = [];
  const notices: string[] = [];
  const named: Page[] = [];
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
      return Promise.resolve('replaced');
    },
    codePage: () => Promise.resolve('windows-1252'),
    readOnly: (file) => file.endsWith('.defaults.json'),
  };
  const edits = new Editing(access, {
    post: (page, message) =>
      page.post({ type: 'tool', tool: 'commander', message }),
    notice: (_page, notice) => notices.push(plainOf(notice.message)),
    namesChanged: (page) => named.push(page),
  });
  return { edits, saved, notices, named };
}

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
    const { edits, saved } = editing({ 'read-only.txt': 'a\n' });
    const page = new EditorPage();
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
});
