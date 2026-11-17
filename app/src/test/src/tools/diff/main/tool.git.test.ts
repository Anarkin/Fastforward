import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { imageUrl } from '../../../../../components/diff/shared/imageSources';
import type {
  CompareView,
  DiffToHost,
  DiffToWebview,
} from '../../../../../tools/diff/shared/protocol';
import { comparedImageRoute } from '../../../../../tools/diff/shared/images';
import { Comparisons } from '../../../../../tools/diff/main/comparisons';
import { parsePatch } from '../../../../../components/diff/page/diff';
import { strings } from '../../../../../lib/shared/strings';
import { tabsKey, windowsKey } from '../../../../../shell/main/storage';
import { savedTabOf } from '../../../../../shell/main/savedTabs';
import {
  tempRepository,
  type TempRepository,
} from '../../../../helpers/repositories';
import { recordingLog, failOnErrorsLogged } from '../../../../helpers/stub';
import { waitFor } from '../../../../helpers/fixtures';
import {
  attach,
  closeViews,
  diffOf,
  openView,
  type OpenView,
} from '../../../../helpers/harness';
import { withNotices, type FakePage } from '../../../../helpers/fakePage';
import { FakeHost } from '../../../../helpers/fakeHost';
import { plainOf } from '../../../../../lib/shared/sentences';
import { removeFolder, tempFolder } from '../../../../helpers/tempFolders';

const linesOf = (compare: CompareView | undefined) =>
  parsePatch(compare?.patch ?? '').flatMap((file) =>
    file.hunks.flatMap((hunk) => hunk.lines.map((line) => line.text)),
  );

const diffSent = (page: FakePage): DiffToWebview[] =>
  page.otherTools.flatMap((sent) =>
    sent.tool === 'diff' ? [sent.message] : [],
  );

const comparesIn = (page: FakePage): CompareView[] =>
  diffSent(page).flatMap((message) =>
    message.type === 'compare' ? [message.compare] : [],
  );

const short = (hash: string | undefined) => hash?.slice(0, 7);

const textsIn = (page: FakePage) =>
  diffSent(page).flatMap((message) =>
    message.type === 'texts' ? [message.texts] : [],
  );

suite('Diff tool comparing two files', () => {
  let repository: TempRepository;
  let files: string;
  let opened: OpenView;
  const host = new FakeHost();

  const { log, error: logged } = recordingLog();
  failOnErrorsLogged(logged);

  const lastCompare = (): CompareView | undefined =>
    comparesIn(opened.page).at(-1);
  const toDiff = (message: DiffToHost) =>
    opened.connection.receive({ type: 'tool', tool: 'diff', message });
  const choose = (side: 'old' | 'new', rev?: string) =>
    toDiff({ type: 'chooseVersion', side, ...(rev && { rev }) });
  const imageOf = (tab: string, name: string, id: string, disk = false) =>
    diffOf(opened.view).image(
      new URL(
        imageUrl(comparedImageRoute, { root: tab, path: name, id, disk }),
        'fastforward://app',
      ),
    );

  beforeAll(async () => {
    repository = await tempRepository(tempFolder('compare-tab'));
    await repository.commit('root', { 'readme.txt': 'readme\n' });
    files = tempFolder('compare-tab-files');
    const lines = Array.from({ length: 12 }, (_, index) => `line ${index}`);
    fs.writeFileSync(path.join(files, 'old.txt'), `${lines.join('\n')}\n`);
    lines[6] = 'changed';
    fs.writeFileSync(path.join(files, 'new.txt'), `${lines.join('\n')}\n`);
    opened = await openView(log, [repository.root], { watched: true }, host);
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
    const tab = { id: '9', tool: 'diff', compare } as const;
    assert.deepStrictEqual(diffOf(opened.view).names([tab]).get('9'), {
      name: strings.messages.compareTab('old.txt', 'new.txt'),
    });

    await opened.store.update(tabsKey, [
      { id: '1', tool: 'git', root: repository.root },
      tab,
    ]);
    await toDiff({ type: 'setShowEntireFile', show: false });
    await opened.connection.receive({ type: 'selectTab', tab: '9' });
    const shown = lastCompare();
    assert.deepStrictEqual(
      shown && [shown.old, shown.new, shown.entire, shown.error],
      [compare.old, compare.new, false, undefined],
    );
    assert.ok(linesOf(shown).includes('changed'));
    assert.ok(!linesOf(shown).includes('line 0'));

    await toDiff({ type: 'setShowEntireFile', show: true });
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
    assert.strictEqual(diffSent(opened.page).at(-1)?.type, 'hide');
  });

  test('diffs two versions of a file, or a version against the file on disk, reading each version from a copy git takes out of it, its tab named after the file and the two versions', async () => {
    const story = path.join(repository.root, 'story.txt');
    await repository.commit('one', { 'story.txt': 'one\n' });
    await repository.commit('two', { 'story.txt': 'two\n' });
    const [one, two] = await repository.resolve('HEAD~1', 'HEAD');
    fs.writeFileSync(story, 'three\n');
    const versions = {
      old: story,
      new: story,
      oldVersion: { rev: one ?? '', file: story },
      newVersion: { rev: two ?? '', file: story },
    };
    const { newVersion: _disk, ...onDisk } = versions;
    assert.deepStrictEqual(
      [
        diffOf(opened.view)
          .names([{ id: '11', tool: 'diff', compare: versions }])
          .get('11'),
        diffOf(opened.view)
          .names([{ id: '12', tool: 'diff', compare: onDisk }])
          .get('12'),
      ],
      [
        { name: 'story.txt', folder: `${short(one)} → ${short(two)}` },
        {
          name: 'story.txt',
          folder: `${short(one)} → ${strings.commits.uncommittedSide}`,
        },
      ],
    );

    await opened.store.update(tabsKey, [
      { id: '1', tool: 'git', root: repository.root },
      { id: '11', tool: 'diff', compare: versions },
      { id: '12', tool: 'diff', compare: onDisk },
    ]);
    await opened.connection.receive({ type: 'selectTab', tab: '11' });
    const between = lastCompare();
    assert.deepStrictEqual(
      [between?.oldVersion, between?.newVersion, between?.error],
      [one, two, undefined],
    );
    assert.deepStrictEqual(linesOf(between), ['one', 'two']);
    await toDiff({
      type: 'loadTexts',
      requests: [{ path: 'story.txt', side: 'old', blob: '' }],
    });
    assert.deepStrictEqual(
      textsIn(opened.page)
        .at(-1)
        ?.map((each) => each.text),
      ['one\n'],
    );

    await opened.connection.receive({ type: 'selectTab', tab: '12' });
    assert.deepStrictEqual(linesOf(lastCompare()), ['one', 'three']);
    assert.strictEqual(lastCompare()?.newVersion, undefined);
  });

  test('lists the versions of each side of a compare tab once it shows, and switches a side to a version listed, the new side moving the old to the version below it, saved with the tab', async () => {
    const tale = path.join(repository.root, 'tale.txt');
    await repository.commit('a', { 'tale.txt': 'a\n' });
    await repository.commit('b', { 'tale.txt': 'b\n' });
    await repository.commit('c', { 'tale.txt': 'c\n' });
    const [a, b, c] = await repository.resolve('HEAD~2', 'HEAD~1', 'HEAD');
    fs.writeFileSync(tale, 'disk\n');
    const at = (rev: string | undefined) =>
      rev === undefined ? undefined : { rev, file: tale };
    const compare = { old: tale, new: tale, oldVersion: at(c) };
    await opened.store.update(tabsKey, [
      { id: '1', tool: 'git', root: repository.root },
      { id: '13', tool: 'diff', compare },
    ]);
    await opened.connection.receive({ type: 'selectTab', tab: '13' });
    assert.deepStrictEqual(
      diffSent(opened.page).flatMap((message) =>
        message.type === 'versions' && message.tab === '13'
          ? [[message.side, message.versions.map((each) => each.rev)]]
          : [],
      ),
      [
        ['old', [c, b, a]],
        ['new', [c, b, a]],
      ],
    );
    const sides = () => {
      const tabs: unknown = opened.store.get(tabsKey);
      const compared = (Array.isArray(tabs) ? tabs : [])
        .map((tab: unknown) => savedTabOf(tab))
        .find((tab) => tab?.id === '13')?.compare;
      return [compared?.oldVersion, compared?.newVersion];
    };

    await choose('new', b);
    assert.deepStrictEqual(sides(), [at(a), at(b)]);
    assert.deepStrictEqual(linesOf(lastCompare()), ['a', 'b']);
    await choose('new');
    assert.deepStrictEqual(sides(), [at(c), undefined]);
    await choose('old', a);
    assert.deepStrictEqual(sides(), [at(a), undefined]);
    await choose('new', a);
    assert.deepStrictEqual(sides(), [at(a), at(a)]);
    await choose('old', 'f'.repeat(40));
    assert.deepStrictEqual(sides(), [at(a), at(a)]);
  });

  test('opens the history of one file in a compare tab: its uncommitted changes against its last commit, what its last commit changed while it has none, the index while it is staged, a version chosen against the one before it, and tells when git keeps no earlier version', async () => {
    const saga = path.join(repository.root, 'saga.txt');
    const lone = path.join(repository.root, 'lone.txt');
    const untracked = path.join(repository.root, 'untracked.txt');
    await repository.commit('first', {
      'saga.txt': 'first\n',
      'lone.txt': 'lone\n',
    });
    await repository.commit('second', { 'saga.txt': 'second\n' });
    const [first, second] = await repository.resolve('HEAD~1', 'HEAD');
    fs.writeFileSync(untracked, 'untracked\n');
    const compare = (file: string, kind: 'file' | 'folder' = 'file') => {
      host.facts.set(file, { kind, inRepository: true, gitMissing: false });
      return opened.connection.receive({
        type: 'pathCommand',
        path: file,
        command: 'compare',
      });
    };
    const sides = () => {
      const shown = lastCompare();
      return [shown?.old, shown?.new, shown?.oldVersion, shown?.newVersion];
    };

    await compare(saga);
    assert.deepStrictEqual(sides(), [saga, saga, first, undefined]);
    fs.writeFileSync(saga, 'third\n');
    await compare(saga);
    assert.deepStrictEqual(sides(), [saga, saga, second, undefined]);
    assert.deepStrictEqual(linesOf(lastCompare()), ['second', 'third']);
    await repository.git('add', 'saga.txt');
    fs.writeFileSync(saga, 'fourth\n');
    await compare(saga);
    assert.deepStrictEqual(sides(), [saga, saga, 'index', undefined]);
    await toDiff({ type: 'chooseVersion', side: 'new', rev: second });
    assert.deepStrictEqual(sides(), [saga, saga, first, second]);

    await withNotices(opened.page, 'info', async (messages) => {
      await compare(lone);
      await compare(untracked);
      await compare(repository.root, 'folder');
      assert.deepStrictEqual(messages, [
        plainOf(strings.diff.noEarlierVersion(lone)),
        plainOf(strings.diff.noEarlierVersion(untracked)),
      ]);
    });
    assert.deepStrictEqual(sides(), [saga, saga, first, second]);
    await repository.git('reset', '--hard', 'HEAD');
    fs.rmSync(untracked);
    await opened.connection.receive({ type: 'selectTab', tab: '1' });
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
    const tab = { id: '10', tool: 'diff', compare } as const;
    assert.strictEqual(
      diffOf(opened.view).names([tab]).get('10')?.name,
      strings.messages.compareTab('left/same.txt', 'right/same.txt'),
    );

    await opened.store.update(tabsKey, [
      { id: '1', tool: 'git', root: repository.root },
      tab,
    ]);
    await opened.connection.receive({ type: 'selectTab', tab: '10' });
    assert.strictEqual(lastCompare()?.same, 'identical');
    assert.strictEqual(lastCompare()?.name, 'right/same.txt');

    await toDiff({
      type: 'loadTexts',
      requests: [
        { path: 'right/same.txt', side: 'old', blob: 'a' },
        { path: 'right/same.txt', side: 'new', blob: 'b' },
      ],
    });
    assert.deepStrictEqual(textsIn(opened.page).at(-1), [
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
      { id: '12', tool: 'diff', compare },
    ]);
    await opened.connection.receive({ type: 'selectTab', tab: '12' });
    const [file] = parsePatch(lastCompare()?.patch ?? '');
    const shown = await imageOf('12', 'before.png', file?.blobs?.old ?? '');
    assert.strictEqual(shown.status, 200);
    assert.strictEqual(shown.headers.get('content-type'), 'image/png');
    assert.deepStrictEqual(
      Buffer.from(await shown.arrayBuffer()),
      Buffer.from('\0before'),
    );
    assert.deepStrictEqual(
      Buffer.from(
        await (
          await imageOf('12', 'after.png', file?.blobs?.new ?? '')
        ).arrayBuffer(),
      ),
      Buffer.from('\0after'),
    );
    for (const refused of [
      imageOf('12', 'old.txt', file?.blobs?.old ?? ''),
      imageOf('12', 'before.png', 'any', true),
    ]) {
      assert.strictEqual((await refused).status, 404);
    }

    await opened.connection.receive({ type: 'selectTab', tab: '1' });
    assert.strictEqual(
      (await imageOf('12', 'before.png', file?.blobs?.old ?? '')).status,
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
      { id: '11', tool: 'diff', compare },
    ]);
    await opened.connection.receive({ type: 'selectTab', tab: '11' });
    const asked = { path: 'new.txt', side: 'new', blob: 'b' } as const;
    const before = textsIn(opened.page).length;
    const answered = () => textsIn(opened.page).slice(before);
    await toDiff(
      JSON.parse(
        JSON.stringify({
          type: 'loadTexts',
          requests: [asked, { ...asked, side: 'sideways' }],
        }),
      ),
    );
    assert.deepStrictEqual(answered(), []);
    await toDiff({
      type: 'loadTexts',
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
    fs.writeFileSync(compare.old, Buffer.from('\0moved before'));
    fs.writeFileSync(compare.new, Buffer.from('\0moved after'));
    const first = await openView(log, [], false);
    await first.store.update(tabsKey, [
      { id: '1', tool: 'git', root: repository.root },
      { id: '2', tool: 'diff', compare },
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
    const moved = comparesIn(second.page).at(-1);
    const [file] = parsePatch(moved?.patch ?? '');
    const shown = await diffOf(first.view).image(
      new URL(
        imageUrl(comparedImageRoute, {
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
    const comparisons: unknown = Reflect.get(diffOf(view.view), 'comparisons');
    assert.ok(comparisons instanceof Comparisons);
    await view.connection.receive({ type: 'selectTab', tab: '14' });
    const first = comparisons.of('14');
    await view.connection.receive({ type: 'selectTab', tab: '15' });
    assert.deepStrictEqual(
      [
        first?.running?.signal.aborted,
        [...comparisons.shown.values()].map((comparing) => comparing.tab),
        comparisons.of('15')?.running?.signal.aborted,
      ],
      [true, ['15'], false],
    );
  });
});
