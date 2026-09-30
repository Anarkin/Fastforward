import * as assert from 'node:assert';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { API } from '../git/git';
import { pickRepositories } from '../repositoryPicker';
import { Storage } from '../storage';
import { FakeMemento } from './memento';
import { withMessageStub } from './stub';

const fsPath = (folder: string) => vscode.Uri.file(folder).fsPath;
const repo = fsPath(path.resolve('repo'));
const inside = fsPath(path.join(repo, 'src'));
const other = fsPath(path.resolve('other'));
const gone = fsPath(path.resolve('gone'));

const getRepositoryRoot = (uri: vscode.Uri) =>
  Promise.resolve(
    uri.fsPath === repo || uri.fsPath === inside
      ? vscode.Uri.file(repo)
      : uri.fsPath === other
        ? vscode.Uri.file(other)
        : null,
  );
// oxlint-disable-next-line typescript/no-unsafe-type-assertion
const git = { getRepositoryRoot } as unknown as API;

interface Picked {
  readonly roots: string[];
  readonly items: vscode.QuickPickItem[] | undefined;
  readonly dialogs: number;
}

async function pick(
  storage: Storage,
  choose: (items: vscode.QuickPickItem[]) => vscode.QuickPickItem | undefined,
  folders: string[] | undefined,
): Promise<Picked> {
  const { showQuickPick, showOpenDialog } = vscode.window;
  let items: vscode.QuickPickItem[] | undefined;
  let dialogs = 0;
  Reflect.set(
    vscode.window,
    'showQuickPick',
    (shown: vscode.QuickPickItem[]) => {
      items = shown;
      return Promise.resolve(choose(shown));
    },
  );
  Reflect.set(vscode.window, 'showOpenDialog', () => {
    dialogs++;
    return Promise.resolve(folders?.map((folder) => vscode.Uri.file(folder)));
  });
  try {
    const roots = await pickRepositories(git, storage);
    return { roots, items, dialogs };
  } finally {
    Reflect.set(vscode.window, 'showQuickPick', showQuickPick);
    Reflect.set(vscode.window, 'showOpenDialog', showOpenDialog);
  }
}

async function storageWith(recent: string[]): Promise<Storage> {
  const storage = new Storage(new FakeMemento(), new FakeMemento());
  for (const root of recent.toReversed()) {
    await storage.addRecent(root);
  }
  return storage;
}

const described = (description: string) => (items: vscode.QuickPickItem[]) =>
  items.find((item) => item.description === description);

suite('pickRepositories', () => {
  test('offers the recent repositories that are not open in a tab', async () => {
    const storage = await storageWith([repo, other]);
    await storage.setTabs([other], other);
    const { items } = await pick(storage, () => undefined, undefined);
    assert.deepStrictEqual(
      items?.map((item) => item.description).filter(Boolean),
      [repo],
    );
  });

  test('opens nothing when the pick is cancelled', async () => {
    const storage = await storageWith([repo]);
    const { roots, dialogs } = await pick(storage, () => undefined, [repo]);
    assert.deepStrictEqual(roots, []);
    assert.strictEqual(dialogs, 0);
  });

  test('opens a picked recent repository', async () => {
    const storage = await storageWith([repo, other]);
    const { roots, dialogs } = await pick(storage, described(other), []);
    assert.deepStrictEqual(roots, [other]);
    assert.strictEqual(dialogs, 0);
  });

  test('forgets a picked recent folder that is no longer a repository', async () => {
    const storage = await storageWith([gone, repo]);
    await withMessageStub('showErrorMessage', async (messages) => {
      const { roots } = await pick(storage, described(gone), []);
      assert.deepStrictEqual(roots, []);
      assert.deepStrictEqual(storage.recent, [repo]);
      assert.strictEqual(messages.length, 1);
    });
  });

  test('browses for folders when Browse... is picked', async () => {
    const storage = await storageWith([repo]);
    const { roots } = await pick(
      storage,
      (items) => items.find((item) => item.label.includes('Browse...')),
      [other],
    );
    assert.deepStrictEqual(roots, [other]);
  });

  test('browses straight away without recent repositories, opening the roots of the folders', async () => {
    const storage = await storageWith([]);
    await withMessageStub('showErrorMessage', async (messages) => {
      const { roots, items } = await pick(storage, () => undefined, [
        inside,
        gone,
      ]);
      assert.strictEqual(items, undefined);
      assert.deepStrictEqual(roots, [repo]);
      assert.strictEqual(messages.length, 1);
    });
  });

  test('opens nothing when the folder dialog is cancelled', async () => {
    const storage = await storageWith([]);
    const { roots } = await pick(storage, () => undefined, undefined);
    assert.deepStrictEqual(roots, []);
  });
});
