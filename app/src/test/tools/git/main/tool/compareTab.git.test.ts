import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { imageUrl } from '../../../../../tools/git/shared/images';
import type { CompareView } from '../../../../../tools/git/shared/protocol';
import { parsePatch } from '../../../../../tools/git/page/diff';
import { strings } from '../../../../../shared/strings';
import { tabsKey, windowsKey } from '../../../../../shell/main/storage';
import {
  removeFolder,
  tempFolder,
  tempRepository,
  type TempRepository,
} from '../../../../repositories';
import { recordingLog } from '../../../../stub';
import { waitFor } from '../../../../fixtures';
import {
  attach,
  closeViews,
  failOnErrorsLogged,
  openView,
  stubMethod,
  type OpenView,
} from '../../../../harness';

const linesOf = (compare: CompareView | undefined) =>
  parsePatch(compare?.patch ?? '').flatMap((file) =>
    file.hunks.flatMap((hunk) => hunk.lines.map((line) => line.text)),
  );

suite('Git tool comparing two files', () => {
  let repository: TempRepository;
  let files: string;
  let opened: OpenView;

  const { log, error: logged } = recordingLog();
  failOnErrorsLogged(logged);

  const compares = () =>
    opened.page.messages.flatMap((message) =>
      message.type === 'compare' ? [message.compare] : [],
    );
  const lastCompare = (): CompareView | undefined => compares().at(-1);

  beforeAll(async () => {
    repository = await tempRepository(tempFolder('compare-tab'));
    await repository.commit('root', { 'readme.txt': 'readme\n' });
    files = tempFolder('compare-tab-files');
    const lines = Array.from({ length: 12 }, (_, index) => `line ${index}`);
    fs.writeFileSync(path.join(files, 'old.txt'), `${lines.join('\n')}\n`);
    lines[6] = 'changed';
    fs.writeFileSync(path.join(files, 'new.txt'), `${lines.join('\n')}\n`);
    opened = await openView(log, [repository.root], { watched: true });
  });

  afterAll(async () => {
    await closeViews();
    removeFolder(repository.root);
    removeFolder(files);
  });

  test('diffs the two files of a compare tab, the whole file while the entire file is on, again when one changes, and leaves the comparison for a repository tab', async () => {
    const compare = {
      old: path.join(files, 'old.txt'),
      new: path.join(files, 'new.txt'),
    };
    const tab = { id: '9', tool: 'git', compare } as const;
    assert.deepStrictEqual(opened.view.names([tab]).get('9'), {
      name: strings.messages.compareTab('old.txt', 'new.txt'),
    });

    await opened.store.update(tabsKey, [
      { id: '1', tool: 'git', root: repository.root },
      tab,
    ]);
    await opened.connection.receive({ type: 'setShowEntireFile', show: false });
    await opened.connection.receive({ type: 'selectTab', tab: '9' });
    const shown = lastCompare();
    assert.deepStrictEqual(
      shown && [shown.old, shown.new, shown.entire, shown.error],
      [compare.old, compare.new, false, undefined],
    );
    assert.ok(linesOf(shown).includes('changed'));
    assert.ok(!linesOf(shown).includes('line 0'));

    await opened.connection.receive({ type: 'setShowEntireFile', show: true });
    assert.strictEqual(lastCompare()?.entire, true);
    assert.ok(linesOf(lastCompare()).includes('line 0'));
    await opened.connection.receive({ type: 'selectTab', tab: '9' });
    assert.strictEqual(lastCompare()?.entire, true);

    fs.appendFileSync(compare.new, 'added at the end\n');
    await waitFor(
      () => linesOf(lastCompare()).includes('added at the end'),
      'the diff of the file changed',
    );

    await opened.connection.receive({ type: 'selectTab', tab: '1' });
    assert.strictEqual(lastCompare(), undefined);
  });

  test('tells two files alike or alike but for whitespace, and names files of the same name by their folders', async () => {
    const left = path.join(files, 'left');
    const right = path.join(files, 'right');
    fs.mkdirSync(left);
    fs.mkdirSync(right);
    fs.writeFileSync(path.join(left, 'same.txt'), 'same text');
    fs.writeFileSync(path.join(right, 'same.txt'), 'same text');
    const compare = {
      old: path.join(left, 'same.txt'),
      new: path.join(right, 'same.txt'),
    };
    const tab = { id: '10', tool: 'git', compare } as const;
    assert.strictEqual(
      opened.view.names([tab]).get('10')?.name,
      strings.messages.compareTab('left/same.txt', 'right/same.txt'),
    );

    await opened.store.update(tabsKey, [
      { id: '1', tool: 'git', root: repository.root },
      tab,
    ]);
    await opened.connection.receive({ type: 'selectTab', tab: '10' });
    assert.strictEqual(lastCompare()?.same, 'identical');
    assert.strictEqual(lastCompare()?.name, 'right/same.txt');

    await opened.connection.receive({
      type: 'loadCompareTexts',
      requests: [
        { path: 'right/same.txt', side: 'old', blob: 'a' },
        { path: 'right/same.txt', side: 'new', blob: 'b' },
      ],
    });
    const texts = opened.page.messages.flatMap((message) =>
      message.type === 'compareTexts' ? [message] : [],
    );
    assert.deepStrictEqual(texts.at(-1)?.texts, [
      { path: 'right/same.txt', side: 'old', blob: 'a', text: 'same text' },
      { path: 'right/same.txt', side: 'new', blob: 'b', text: 'same text' },
    ]);
    await opened.connection.receive({ type: 'selectTab', tab: '1' });
  });

  test('serves the images of the compare tab shown by the ids of their patch, but none by another name, from the disk or once a repository tab shows', async () => {
    const compare = {
      old: path.join(files, 'before.png'),
      new: path.join(files, 'after.png'),
    };
    fs.writeFileSync(compare.old, Buffer.from('\0before'));
    fs.writeFileSync(compare.new, Buffer.from('\0after'));
    await opened.store.update(tabsKey, [
      { id: '1', tool: 'git', root: repository.root },
      { id: '12', tool: 'git', compare },
    ]);
    await opened.connection.receive({ type: 'selectTab', tab: '12' });
    const [file] = parsePatch(lastCompare()?.patch ?? '');
    const image = (name: string, id: string, disk = false) =>
      opened.view.image(
        new URL(
          imageUrl({ root: '12', path: name, id, disk }),
          'fastforward://app',
        ),
      );

    const shown = await image('before.png', file?.blobs?.old ?? '');
    assert.strictEqual(shown.status, 200);
    assert.strictEqual(shown.headers.get('content-type'), 'image/png');
    assert.deepStrictEqual(
      Buffer.from(await shown.arrayBuffer()),
      Buffer.from('\0before'),
    );
    assert.deepStrictEqual(
      Buffer.from(
        await (await image('after.png', file?.blobs?.new ?? '')).arrayBuffer(),
      ),
      Buffer.from('\0after'),
    );
    for (const refused of [
      image('old.txt', file?.blobs?.old ?? ''),
      image('before.png', 'any', true),
    ]) {
      assert.strictEqual((await refused).status, 404);
    }

    await opened.connection.receive({ type: 'selectTab', tab: '1' });
    assert.strictEqual(
      (await image('before.png', file?.blobs?.old ?? '')).status,
      404,
    );
  });

  test('answers a text of a compare tab asked for twice once, and none from a list that is not all texts', async () => {
    const compare = {
      old: path.join(files, 'old.txt'),
      new: path.join(files, 'new.txt'),
    };
    await opened.store.update(tabsKey, [
      { id: '1', tool: 'git', root: repository.root },
      { id: '11', tool: 'git', compare },
    ]);
    await opened.connection.receive({ type: 'selectTab', tab: '11' });
    const asked = { path: 'new.txt', side: 'new', blob: 'b' } as const;
    const answered = () =>
      opened.page.messages.flatMap((message) =>
        message.type === 'compareTexts' ? [message.texts] : [],
      );
    opened.page.clear();
    await opened.connection.receive(
      JSON.parse(
        JSON.stringify({
          type: 'loadCompareTexts',
          requests: [asked, { ...asked, side: 'sideways' }],
        }),
      ),
    );
    assert.deepStrictEqual(answered(), []);
    await opened.connection.receive({
      type: 'loadCompareTexts',
      requests: [asked, asked, { ...asked, side: 'old' }],
    });
    assert.deepStrictEqual(
      answered().map((texts) =>
        texts.map(({ path: file, side }) => [file, side]),
      ),
      [
        [
          ['new.txt', 'new'],
          ['new.txt', 'old'],
        ],
      ],
    );
    await opened.connection.receive({ type: 'selectTab', tab: '1' });
  });

  test('serves the images of a compare tab moved into another window, as the window it left lets go of no comparison but its own', async () => {
    const compare = {
      old: path.join(files, 'moved-before.png'),
      new: path.join(files, 'moved-after.png'),
    };
    fs.writeFileSync(compare.old, Buffer.from(' moved before'));
    fs.writeFileSync(compare.new, Buffer.from(' moved after'));
    const first = await openView(log, [], false);
    await first.store.update(tabsKey, [
      { id: '1', tool: 'git', root: repository.root },
      { id: '2', tool: 'git', compare },
      { id: '3', tool: 'terminal' },
    ]);
    await first.store.update(windowsKey, [
      { id: '1', tabs: ['1', '2'], active: '2' },
      { id: '2', tabs: ['3'], active: '3' },
    ]);
    const second = attach(first.view, '2');
    await first.connection.receive({ type: 'ready' });
    await second.connection.receive({ type: 'ready' });
    await first.view.idle();
    await first.connection.receive({
      type: 'moveTabToWindow',
      tab: '2',
      window: '2',
    });
    await first.view.idle();
    const moved = second.page.messages
      .flatMap((message) =>
        message.type === 'compare' ? [message.compare] : [],
      )
      .at(-1);
    const [file] = parsePatch(moved?.patch ?? '');
    const shown = await first.view.image(
      new URL(
        imageUrl({
          root: '2',
          path: 'moved-before.png',
          id: file?.blobs?.old ?? '',
          disk: false,
        }),
        'fastforward://app',
      ),
    );
    assert.strictEqual(shown.status, 200);
  });

  test('stops the comparison of a compare tab once another compare tab shows in its window', async () => {
    const view = await openView(log, [repository.root]);
    const running: (AbortController | undefined)[] = [];
    stubMethod(view.view, 'sendCompare', (original, session) => {
      const sending = original(session);
      const comparing: unknown =
        typeof session === 'object' && session !== null
          ? Reflect.get(session, 'comparing')
          : undefined;
      const controller: unknown =
        typeof comparing === 'object' && comparing !== null
          ? Reflect.get(comparing, 'running')
          : undefined;
      running.push(
        controller instanceof AbortController ? controller : undefined,
      );
      return sending;
    });
    await view.store.update(tabsKey, [
      { id: '1', tool: 'git', root: repository.root },
      {
        id: '14',
        tool: 'git',
        compare: {
          old: path.join(files, 'old.txt'),
          new: path.join(files, 'new.txt'),
        },
      },
      {
        id: '15',
        tool: 'git',
        compare: {
          old: path.join(files, 'new.txt'),
          new: path.join(files, 'old.txt'),
        },
      },
    ]);
    await view.connection.receive({ type: 'selectTab', tab: '14' });
    await view.connection.receive({ type: 'selectTab', tab: '15' });
    assert.deepStrictEqual(
      running.map((each) => each?.signal.aborted),
      [true, false],
    );
  });
});
