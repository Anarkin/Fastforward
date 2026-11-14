import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, suite, test } from 'vitest';
import { plainOf, strings } from '../../../../lib/shared/strings';
import { JsonFileStore } from '../../../../shell/main/stateFile';
import { toolState } from '../../../../shell/main/storage';
import { removeFolder, tempFolder } from '../../../helpers/repositories';

suite('State file', () => {
  let folder: string;
  let file: string;

  beforeEach(() => {
    folder = tempFolder('state');
    file = path.join(folder, 'state.json');
  });

  afterEach(() => removeFolder(folder));

  test('keeps what was saved for the next start', async () => {
    const store = new JsonFileStore(file);
    await store.update('solo', true);
    await store.update('tabs', ['/a']);
    const reopened = new JsonFileStore(file);
    assert.strictEqual(reopened.get('solo'), true);
    assert.deepStrictEqual(reopened.get('tabs'), ['/a']);
    assert.strictEqual(reopened.get('missing'), undefined);
  });

  test('reads a file saved with a byte order mark, as Notepad saved UTF-8 before Windows 10 1903', () => {
    fs.writeFileSync(file, '\uFEFF{"solo": true}');
    assert.strictEqual(new JsonFileStore(file).get('solo'), true);
    assert.ok(!fs.existsSync(`${file}.corrupt`));
  });

  test('forgets a value set to nothing', async () => {
    const store = new JsonFileStore(file);
    await store.update('activeTab', '/a');
    await store.update('activeTab', undefined);
    assert.strictEqual(new JsonFileStore(file).get('activeTab'), undefined);
  });

  test('saves the last of several quick changes', async () => {
    const store = new JsonFileStore(file);
    await Promise.all([1, 2, 3].map((n) => store.update('n', n)));
    assert.strictEqual(new JsonFileStore(file).get('n'), 3);
  });

  test('writes changes made while a write waits to start in that one write', async () => {
    const store = new JsonFileStore(file);
    const rename = fs.promises.rename;
    let writes = 0;
    Reflect.set(fs.promises, 'rename', (...args: Parameters<typeof rename>) => {
      writes++;
      return rename(...args);
    });
    try {
      await Promise.all([
        store.update('tabs', ['/a']),
        store.update('activeTab', '/a'),
        store.update('recentRepositories', ['/a']),
      ]);
      await store.update('solo', true);
    } finally {
      Reflect.set(fs.promises, 'rename', rename);
    }
    assert.strictEqual(writes, 2);
    const reopened = new JsonFileStore(file);
    assert.strictEqual(reopened.get('activeTab'), '/a');
    assert.deepStrictEqual(reopened.get('recentRepositories'), ['/a']);
    assert.strictEqual(reopened.get('solo'), true);
  });

  test('keeps changes to itself when the file is there but cannot be read', async () => {
    fs.mkdirSync(file);
    const store = new JsonFileStore(file);
    await store.update('tabs', ['/a']);
    assert.deepStrictEqual(store.get('tabs'), ['/a']);
    assert.ok(fs.statSync(file).isDirectory());
    assert.ok(!fs.existsSync(`${file}.tmp`));
  });

  test('saves again once a file that could not be read at first can be, keeping what it held under the changes made since', async () => {
    fs.mkdirSync(file);
    const store = new JsonFileStore(file);
    await store.update('tabs', ['/a']);
    fs.rmdirSync(file);
    fs.writeFileSync(
      file,
      JSON.stringify({ tabs: ['/old'], activeTab: '/old' }),
    );
    await store.update('solo', true);
    assert.deepStrictEqual(store.get('activeTab'), '/old');
    const reopened = new JsonFileStore(file);
    assert.deepStrictEqual(reopened.get('tabs'), ['/a']);
    assert.strictEqual(reopened.get('activeTab'), '/old');
    assert.strictEqual(reopened.get('solo'), true);
  });

  test('forgets a value set to nothing while the file could not be read, once it can be', async () => {
    fs.mkdirSync(file);
    const store = new JsonFileStore(file);
    await store.update('activeTab', undefined);
    fs.rmdirSync(file);
    fs.writeFileSync(
      file,
      JSON.stringify({ tabs: ['/old'], activeTab: '/old' }),
    );
    await store.update('solo', true);
    assert.strictEqual(store.get('activeTab'), undefined);
    const reopened = new JsonFileStore(file);
    assert.strictEqual(reopened.get('activeTab'), undefined);
    assert.deepStrictEqual(reopened.get('tabs'), ['/old']);
  });

  test("keeps each tool's state the file held once it can be read, under the changes made to it since, as every tool keeps its state under the one key", async () => {
    fs.mkdirSync(file);
    const store = new JsonFileStore(file);
    const git = toolState(store, 'git');
    await git.update('lastFetches', { '/a': 1 });
    await git.update('solo', ['/a']);
    await git.update('solo', undefined);
    fs.rmdirSync(file);
    fs.writeFileSync(
      file,
      JSON.stringify({
        tools: {
          git: {
            recentRepositories: ['/old'],
            bookmarks: { '/old': ['b'] },
            solo: ['/old'],
            lastFetches: { '/old': 2 },
          },
          files: { recentRepositories: ['/f'] },
        },
      }),
    );
    await git.update('recentRepositories', ['/new']);
    const expected = {
      git: {
        recentRepositories: ['/new'],
        bookmarks: { '/old': ['b'] },
        lastFetches: { '/old': 2, '/a': 1 },
      },
      files: { recentRepositories: ['/f'] },
    };
    assert.deepStrictEqual(store.get('tools'), expected);
    assert.deepStrictEqual(new JsonFileStore(file).get('tools'), expected);
  });

  test('says why the file could not be read', () => {
    fs.mkdirSync(file);
    const [problem] = new JsonFileStore(file).problems;
    assert.match(
      plainOf(problem),
      /^The saved state could not be read, so changes to it are kept until it can be: /,
    );
  });

  test('starts afresh from a broken file, keeping a copy of it, and says so', () => {
    fs.writeFileSync(file, '{ broken');
    const store = new JsonFileStore(file);
    assert.strictEqual(store.get('tabs'), undefined);
    assert.strictEqual(fs.readFileSync(`${file}.corrupt`, 'utf8'), '{ broken');
    assert.deepStrictEqual(store.problems, [
      strings.state.putAside(`${file}.corrupt`),
    ]);
  });

  test('starts afresh from a broken file it cannot keep a copy of, saying why, rather than failing to start', async () => {
    fs.writeFileSync(file, '{ broken');
    fs.mkdirSync(`${file}.corrupt`);
    const store = new JsonFileStore(file);
    assert.strictEqual(store.get('tabs'), undefined);
    const [problem] = store.problems;
    assert.match(
      plainOf(problem),
      /^The saved state was broken and could not be put aside, so it starts afresh: /,
    );
    await store.update('solo', true);
    assert.strictEqual(new JsonFileStore(file).get('solo'), true);
  });
});
