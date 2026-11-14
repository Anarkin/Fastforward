import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { strings } from '../../../../lib/shared/strings';
import { waitFor } from '../../../fixtures';
import { FakeStore } from '../../../fakeStore';
import {
  root,
  at,
  folder,
  file,
  commander,
  tab,
  lastFolder,
  archiveItem,
  zipped,
} from './commanderFixtures';

suite('Commander tool in archives', () => {
  test('enters an archive the page asks to, listing it as a folder by a path through the archive, going into its folders and out again with .., selecting where it came from', async () => {
    const { tool, page, send, archived } = commander({
      [root]: [file('a.zip'), file('notes.txt')],
    });
    archived.set(at('a.zip'), zipped);
    await tool.show(page, tab);

    await send({
      type: 'enterArchive',
      tab: '1',
      side: 'right',
      name: 'a.zip',
    });
    await send({ type: 'open', tab: '1', side: 'right', name: 'docs' });
    await send({ type: 'open', tab: '1', side: 'right', name: '..' });
    await send({ type: 'open', tab: '1', side: 'right', name: '..' });

    assert.deepStrictEqual(page.listings().slice(2), [
      `right ${at('a.zip')} ↑: docs top.txt`,
      `right ${at('a.zip', 'docs')} ↑: readme.md deep`,
      `right ${at('a.zip')} ↑: docs top.txt [docs]`,
      `right ${root}: a.zip notes.txt [a.zip]`,
    ]);
    assert.deepStrictEqual(
      page
        .of('listing')
        .slice(2)
        .map((listing) => listing.archive),
      [at('a.zip'), at('a.zip'), at('a.zip'), undefined],
    );
  });

  test('says why a file could not be entered as an archive, staying where it was, and enters nothing a side does not list or a folder', async () => {
    const { tool, page, send, notices, archived } = commander({
      [root]: [file('a.zip'), file('notes.txt'), folder('Users')],
    });
    archived.set(at('a.zip'), [archiveItem('inner.zip')]);
    archived.set(at('a.zip', 'inner.zip'), zipped);
    await tool.show(page, tab);

    await send({
      type: 'enterArchive',
      tab: '1',
      side: 'right',
      name: 'notes.txt',
    });
    assert.deepStrictEqual(notices, [
      {
        level: 'error',
        message: strings.commander.notArchive(
          'notes.txt',
          'Cannot open the file as archive',
        ),
      },
    ]);
    for (const name of ['gone.zip', 'Users', '..']) {
      await send({ type: 'enterArchive', tab: '1', side: 'right', name });
    }
    await send({
      type: 'enterArchive',
      tab: '1',
      side: 'right',
      name: 'a.zip',
    });

    assert.strictEqual(notices.length, 1);
    assert.deepStrictEqual(page.listings().slice(2), [
      `right ${at('a.zip')} ↑: inner.zip`,
    ]);
  });

  test('enters an archive inside an archive from the menu or on a side, by a path through both, leaving it with .. for the archive around it', async () => {
    const { tool, page, send, archived } = commander({
      [root]: [file('a.zip')],
    });
    archived.set(at('a.zip'), [
      archiveItem('inner.zip'),
      archiveItem('top.txt'),
    ]);
    archived.set(at('a.zip', 'inner.zip'), zipped);
    await tool.show(page, tab);

    for (const name of ['a.zip', 'inner.zip']) {
      await send({ type: 'enterArchive', tab: '1', side: 'right', name });
    }
    await send({ type: 'open', tab: '1', side: 'right', name: 'docs' });
    await send({ type: 'open', tab: '1', side: 'right', name: '..' });
    await send({ type: 'open', tab: '1', side: 'right', name: '..' });
    await send({
      type: 'openOnSide',
      tab: '1',
      from: 'right',
      side: 'left',
      name: 'inner.zip',
    });

    assert.deepStrictEqual(page.listings().slice(2), [
      `right ${at('a.zip')} ↑: inner.zip top.txt`,
      `right ${at('a.zip', 'inner.zip')} ↑: docs top.txt`,
      `right ${at('a.zip', 'inner.zip', 'docs')} ↑: readme.md deep`,
      `right ${at('a.zip', 'inner.zip')} ↑: docs top.txt [docs]`,
      `right ${at('a.zip')} ↑: inner.zip top.txt [inner.zip]`,
      `left ${at('a.zip', 'inner.zip')} ↑: docs top.txt`,
    ]);
  });

  test('lists a folder inside an archive inside another it has not opened, opening both on the way, as a side comes back there after a restart', async () => {
    const state = new FakeStore();
    await state.update('sides', {
      1: { right: at('a.zip', 'inner.zip', 'docs') },
    });
    const { tool, page, archived } = commander(
      { [root]: [file('a.zip')] },
      [],
      undefined,
      state,
    );
    archived.set(at('a.zip'), [archiveItem('inner.zip')]);
    archived.set(at('a.zip', 'inner.zip'), zipped);

    await tool.show(page, tab);

    assert.deepStrictEqual(
      page.listings().filter((listing) => listing.startsWith('right')),
      [`right ${at('a.zip', 'inner.zip', 'docs')} ↑: readme.md deep`],
    );
  });

  test('enters on a side an archive the other side has selected, shows there the folder of a file 7-Zip sees no archive in, as before, and says why an archive it could not open was not entered, staying where it was', async () => {
    const { tool, page, send, archived, notices } = commander({
      [root]: [file('a.zip'), file('broken.zip'), file('notes.txt')],
    });
    archived.set(at('a.zip'), zipped);
    archived.set(at('broken.zip'), 'Unexpected end of archive');
    await tool.show(page, tab);

    for (const name of ['a.zip', 'notes.txt', 'broken.zip']) {
      await send({
        type: 'openOnSide',
        tab: '1',
        from: 'left',
        side: 'right',
        name,
      });
    }
    await send({
      type: 'openOnSide',
      tab: '1',
      from: 'left',
      side: 'left',
      name: 'a.zip',
    });

    assert.deepStrictEqual(page.listings().slice(2), [
      `right ${at('a.zip')} ↑: docs top.txt`,
      `right ${root}: a.zip broken.zip notes.txt [a.zip]`,
      `left ${at('a.zip')} ↑: docs top.txt`,
    ]);
    assert.deepStrictEqual(notices, [
      {
        level: 'error',
        message: strings.commander.notArchive(
          'broken.zip',
          'Unexpected end of archive',
        ),
      },
    ]);
  });

  test('lists a folder inside an archive it has not opened, going through the archive the path runs through, as a side comes back there after a restart', async () => {
    const state = new FakeStore();
    await state.update('sides', { 1: { right: at('a.zip', 'docs') } });
    const { tool, page, archived } = commander(
      { [root]: [file('a.zip')] },
      [],
      undefined,
      state,
    );
    archived.set(at('a.zip'), zipped);

    await tool.show(page, tab);

    assert.deepStrictEqual(
      page.listings().filter((listing) => listing.startsWith('right')),
      [`right ${at('a.zip', 'docs')} ↑: readme.md deep`],
    );
  });

  test('watches the archive a side is inside, listing it again once it changes, and goes to the nearest folder still there once the folder shown is gone from it', async () => {
    const { tool, page, send, watched, change, archived } = commander({
      [root]: [file('a.zip')],
    });
    archived.set(at('a.zip'), zipped);
    await tool.show(page, tab);
    await send({
      type: 'enterArchive',
      tab: '1',
      side: 'right',
      name: 'a.zip',
    });
    await send({ type: 'open', tab: '1', side: 'right', name: 'docs' });
    await send({ type: 'open', tab: '1', side: 'right', name: 'deep' });
    assert.deepStrictEqual(watched(), [root, at('a.zip')].toSorted());

    archived.set(at('a.zip'), [...zipped, archiveItem('docs/deep/more.md')]);
    await change(at('a.zip'));
    assert.strictEqual(
      page.listings().at(-1),
      `right ${at('a.zip', 'docs', 'deep')} ↑: notes.md more.md`,
    );

    archived.set(at('a.zip'), [archiveItem('docs/readme.md')]);
    await change(at('a.zip'));
    await waitFor(
      () =>
        page.listings().at(-1) ===
        `right ${at('a.zip', 'docs')} ↑: readme.md [deep]`,
      'the folder inside the archive still there',
    );
  });

  test('asks for the password of an archive whose names are encrypted, entering it once given, asking again when it was wrong, and stays where it was when none is given', async () => {
    const { tool, page, send, archived, secrets, notices } = commander({
      [root]: [file('a.zip')],
    });
    archived.set(at('a.zip'), zipped);
    secrets.set(at('a.zip'), 'right');
    await tool.show(page, tab);
    const asked = () => page.of('askPassword');
    const answer = (password?: string) =>
      send({
        type: 'password',
        ask: asked().at(-1)?.ask ?? 0,
        ...(password !== undefined && { password }),
      });

    const cancelled = send({
      type: 'enterArchive',
      tab: '1',
      side: 'right',
      name: 'a.zip',
    });
    await waitFor(() => asked().length === 1, 'the password to be asked');
    await answer();
    await cancelled;
    assert.strictEqual(page.listings().length, 2);

    const entering = send({
      type: 'enterArchive',
      tab: '1',
      side: 'right',
      name: 'a.zip',
    });
    await waitFor(() => asked().length === 2, 'the password asked again');
    await answer('wrong');
    await waitFor(() => asked().length === 3, 'the password asked once more');
    await answer('right');
    await entering;

    assert.deepStrictEqual(
      asked().map(({ name, wrong }) => [name, wrong]),
      [
        ['a.zip', false],
        ['a.zip', false],
        ['a.zip', true],
      ],
    );
    assert.strictEqual(
      page.listings().at(-1),
      `right ${at('a.zip')} ↑: docs top.txt`,
    );
    assert.deepStrictEqual(notices, []);
  });

  test('stays inside an archive read again once changed while its watch tells of the change, the refresh waiting for that reading rather than stopping it', async () => {
    const {
      tool,
      page,
      send,
      archived,
      opensHeld,
      change,
      removedFromArchives,
      settled,
    } = commander({ [root]: [file('a.zip')] });
    archived.set(at('a.zip'), zipped);
    await tool.show(page, tab);
    await send({
      type: 'enterArchive',
      tab: '1',
      side: 'right',
      name: 'a.zip',
    });
    const { promise: held, resolve: release } = Promise.withResolvers();
    opensHeld.until = held;

    await send({
      type: 'delete',
      tab: '1',
      side: 'right',
      folder: at('a.zip'),
      names: ['top.txt'],
      permanently: true,
    });
    await waitFor(
      () => page.of('readingArchive').length === 1,
      'the archive to be read again once changed',
    );
    await change(at('a.zip'));
    release(undefined);
    await settled();

    assert.deepStrictEqual(removedFromArchives, [[at('a.zip'), ['top.txt']]]);
    assert.strictEqual(lastFolder(page, '1', 'right'), at('a.zip'));
  });

  test('tells the page a side is reading an archive once it takes a while, stopping on Esc and staying where it was', async () => {
    const { tool, page, send, archived, opensHeld, notices } = commander({
      [root]: [file('a.zip')],
    });
    archived.set(at('a.zip'), zipped);
    await tool.show(page, tab);
    opensHeld.until = new Promise(() => {});

    const entering = send({
      type: 'enterArchive',
      tab: '1',
      side: 'right',
      name: 'a.zip',
    });
    await waitFor(
      () => page.of('readingArchive').length === 1,
      'the page to be told the archive is being read',
    );
    await send({ type: 'stopReading', tab: '1', side: 'right' });
    await entering;

    assert.deepStrictEqual(page.of('readingArchive'), [
      { type: 'readingArchive', tab: '1', side: 'right', name: 'a.zip' },
      { type: 'readingArchive', tab: '1', side: 'right' },
    ]);
    assert.strictEqual(page.listings().length, 2);
    assert.deepStrictEqual(notices, []);
  });

  test('shows the folder of an archive with it selected when the reading of it is stopped for a side coming back inside it', async () => {
    const state = new FakeStore();
    await state.update('sides', { 1: { right: at('a.zip', 'docs') } });
    const { tool, page, send, archived, opensHeld } = commander(
      { [root]: [file('a.zip')] },
      [],
      undefined,
      state,
    );
    archived.set(at('a.zip'), zipped);
    opensHeld.until = new Promise(() => {});

    const showing = tool.show(page, tab);
    await waitFor(
      () => page.of('readingArchive').length === 1,
      'the page to be told the archive is being read',
    );
    opensHeld.until = undefined;
    await send({ type: 'stopReading', tab: '1', side: 'right' });
    await showing;

    assert.deepStrictEqual(
      page.listings().filter((listing) => listing.startsWith('right')),
      [`right ${root}: a.zip [a.zip]`],
    );
  });

  test('gives the folder holding the archive as the folder of the tab while its active side is inside the archive', async () => {
    const { tool, page, send, archived } = commander({
      [root]: [file('a.zip')],
    });
    archived.set(at('a.zip'), zipped);
    await tool.show(page, tab);
    await send({
      type: 'enterArchive',
      tab: '1',
      side: 'right',
      name: 'a.zip',
    });
    await send({ type: 'open', tab: '1', side: 'right', name: 'docs' });

    assert.strictEqual(tool.folderOf(tab), root);
  });
});
