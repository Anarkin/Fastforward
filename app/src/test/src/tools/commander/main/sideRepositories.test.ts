import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { type Listed, commander, tab } from './commanderFixtures';
import { root, at, folder, file } from './entryFixtures';

suite('Commander tool', () => {
  test('tells the page the folder a side shows is in a repository once it is listed, and again when it is read again', async () => {
    const listed: Record<string, Listed> = {
      [root]: [folder('app')],
      [at('app')]: [folder('src')],
    };
    const { tool, page, send, change, insideRepositories, settled } =
      commander(listed);
    insideRepositories.add(at('app'));
    await tool.show(page, tab);
    await settled();
    await send({ type: 'open', tab: '1', side: 'left', name: 'app' });
    await settled();
    insideRepositories.delete(at('app'));
    await change(at('app'));
    await settled();

    assert.deepStrictEqual(
      page
        .of('repositories')
        .filter((found) => found.side === 'left')
        .map((found) => [found.folder, found.inRepository]),
      [
        [root, undefined],
        [at('app'), true],
        [at('app'), undefined],
      ],
    );
  });

  test('names the folders a side lists that are repositories once it is listed, never asking about files, and again when the folder is read again', async () => {
    const listed: Record<string, Listed> = {
      [root]: [folder('app'), folder('docs'), file('notes.txt')],
    };
    const { tool, page, change, repositories, repositoriesAsked, settled } =
      commander(listed);
    repositories.add(at('app'));
    await tool.show(page, tab);
    await settled();

    assert.deepStrictEqual(page.of('repositories'), [
      {
        type: 'repositories',
        tab: '1',
        side: 'left',
        folder: root,
        names: ['app'],
      },
      {
        type: 'repositories',
        tab: '1',
        side: 'right',
        folder: root,
        names: ['app'],
      },
    ]);
    assert.ok(!repositoriesAsked.includes(at('notes.txt')));

    repositories.add(at('docs'));
    listed[root] = [
      folder('app'),
      { ...folder('docs'), modified: 1 },
      file('notes.txt'),
    ];
    await change(root);
    await settled();
    assert.deepStrictEqual(page.of('repositories').at(-1)?.names, [
      'app',
      'docs',
    ]);
  });

  test('looks again only at the folders that came or changed once a side is listed again as its folder changes, keeping what it found of the others, as each change looked at every folder again', async () => {
    const listed: Record<string, Listed> = {
      [root]: [folder('app'), folder('docs'), folder('lib')],
    };
    const {
      tool,
      page,
      send,
      change,
      repositories,
      repositoriesAsked,
      settled,
    } = commander(listed);
    repositories.add(at('app'));
    repositories.add(at('new'));
    await tool.show(page, tab);
    await settled();
    repositoriesAsked.length = 0;

    listed[root] = [
      folder('app'),
      { ...folder('docs'), modified: 1 },
      folder('new'),
    ];
    await change(root);
    await settled();

    assert.deepStrictEqual(repositoriesAsked.toSorted(), [
      at('docs'),
      at('docs'),
      at('new'),
      at('new'),
    ]);
    assert.deepStrictEqual(page.of('repositories').at(-1)?.names, [
      'app',
      'new',
    ]);
    repositoriesAsked.length = 0;
    await send({ type: 'reread', tab: '1', side: 'left' });
    await settled();
    assert.deepStrictEqual(repositoriesAsked.toSorted(), [
      at('app'),
      at('docs'),
      at('new'),
    ]);
  });

  test('drops the repositories found in a folder a side has left meanwhile', async () => {
    const listed: Record<string, Listed> = {
      [root]: [folder('app'), folder('Users')],
      [at('Users')]: [folder('me')],
    };
    const { tool, page, send, repositories, settled, repositoriesHeld } =
      commander(listed);
    repositories.add(at('app'));
    const held = Promise.withResolvers<void>();
    repositoriesHeld.until = held.promise;
    await tool.show(page, tab);
    repositoriesHeld.until = undefined;
    await send({ type: 'open', tab: '1', side: 'right', name: 'Users' });
    held.resolve();
    await settled();

    assert.deepStrictEqual(
      page
        .of('repositories')
        .map((found) => `${found.side} ${found.folder} ${found.names.join()}`)
        .toSorted(),
      [`left ${root} app`, `right ${at('Users')} `],
    );
  });
});
