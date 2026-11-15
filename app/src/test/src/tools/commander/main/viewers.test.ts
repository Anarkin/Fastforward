import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, suite, test } from 'vitest';
import type { Tab } from '../../../../../shell/main/toolContract';
import {
  maxBytesAsked,
  maxColoredBytes,
} from '../../../../../tools/commander/shared/protocol';
import { plainOf } from '../../../../../lib/shared/sentences';
import { readBudgetBytes } from '../../../../../tools/commander/main/textRows';
import { sampledVersion } from '../../../../../tools/commander/main/fileVersions';
import { pathParts } from '../../../../../lib/shared/pathParts';
import { waitFor } from '../../../../helpers/fixtures';
import { commander, forged } from './commanderFixtures';
import { removeFolder, tempFolder } from '../../../../helpers/tempFolders';

suite('Commander tool viewing a file', () => {
  let opened: string;

  beforeEach(() => {
    opened = tempFolder('commander');
  });

  afterEach(() => removeFolder(opened));

  test('tells which parts of the path of a file viewed are hidden', async () => {
    const cache = path.join(opened, '.cache');
    fs.mkdirSync(cache);
    const notes = path.join(cache, '.notes.txt');
    fs.writeFileSync(notes, 'one');
    const { tool, page } = commander({});

    await tool.show(page, {
      id: '3',
      tool: 'commander',
      root: notes,
      view: true,
    });

    assert.deepStrictEqual(
      page.of('viewing').map((viewing) => viewing.hidden),
      [
        pathParts(notes).map(
          (part) => part.path === cache || part.path === notes,
        ),
      ],
    );
  });
  test('tells the size of a file viewed and reads its rows around a place, answering each request by its number', async () => {
    const notes = path.join(opened, 'notes.txt');
    fs.writeFileSync(notes, 'one\ntwo\nthree\nfour\n');
    const { tool, page, send } = commander({});
    const viewing: Tab = {
      id: '3',
      tool: 'commander',
      root: notes,
      view: true,
    };
    await tool.show(page, viewing);
    assert.deepStrictEqual(page.of('viewing'), [
      {
        type: 'viewing',
        tab: '3',
        size: 19,
        version: await sampledVersion(notes, fs.statSync(notes)),
        binary: false,
        hidden: pathParts(notes).map(() => false),
      },
    ]);

    await send({
      type: 'readRows',
      tab: '3',
      encoding: 'utf-8',
      request: 7,
      anchor: 9,
      exact: false,
      before: 1,
      after: 2,
      least: 0,
    });
    const answer = page.of('rows').at(-1);
    assert.deepStrictEqual(
      answer && [
        answer.request,
        answer.anchorIndex,
        answer.rows.map((row) => row.text),
      ],
      [7, 1, ['two', 'three', 'four']],
    );

    for (const bad of [
      { tab: '4' },
      { anchor: -1 },
      { before: 100_000 },
      { after: 1.5 },
      { least: -1 },
      { least: 0.5 },
    ]) {
      await send({
        type: 'readRows',
        tab: '3',
        encoding: 'utf-8',
        request: 8,
        anchor: 0,
        exact: true,
        before: 0,
        after: 1,
        least: 0,
        ...bad,
      });
    }
    await send(
      forged(
        '{ "type": "readRows", "tab": "3", "encoding": "ebcdic", "request": 8, "anchor": 0, "exact": true, "before": 0, "after": 1, "least": 0 }',
      ),
    );
    await send(
      forged(
        '{ "type": "readRows", "tab": "3", "encoding": "utf-8", "request": 8, "anchor": 0, "exact": true, "before": 0, "after": 1 }',
      ),
    );
    assert.strictEqual(page.of('rows').length, 1);
  });

  test('reads rows of a file viewed only until they hold half a megabyte each way once it has the rows the page asks for at least, as long lines kept whole could make a screen of rows megabytes', async () => {
    const longLines = path.join(opened, 'long lines.txt');
    const line = 'x'.repeat(60_000);
    fs.writeFileSync(longLines, `${line}\n`.repeat(30));
    const { tool, page, send } = commander({});
    await tool.show(page, {
      id: '3',
      tool: 'commander',
      root: longLines,
      view: true,
    });

    for (const least of [2, 12]) {
      await send({
        type: 'readRows',
        tab: '3',
        encoding: 'utf-8',
        request: least,
        anchor: 0,
        exact: true,
        before: 0,
        after: 30,
        least,
      });
      assert.strictEqual(
        page.of('rows').at(-1)?.rows.length,
        Math.max(least, Math.ceil(readBudgetBytes / (line.length + 1))),
        String(least),
      );
    }
  });

  test('says the file viewed could not be read once it is deleted, rather than going on showing what it held', async () => {
    const notes = path.join(opened, 'vanishing.txt');
    fs.writeFileSync(notes, 'here');
    const { tool, page, change } = commander({});
    await tool.show(page, {
      id: '3',
      tool: 'commander',
      root: notes,
      view: true,
    });
    fs.rmSync(notes);
    await change(notes);
    await new Promise((resolve) => setTimeout(resolve, 50));
    const told = page.of('viewing').at(-1);
    assert.strictEqual(told?.size, undefined);
    assert.match(plainOf(told?.error ?? ''), /vanishing\.txt/);
  });

  test('reads the rows and the whole text of a file viewed in the encoding asked for, the whole text with its byte order mark, from which the rows count their bytes, and tells of the encoding the mark names', async () => {
    const wide = path.join(opened, 'wide.txt');
    fs.writeFileSync(
      wide,
      Buffer.concat([
        Buffer.from([0xff, 0xfe]),
        Buffer.from('one\ntwo\n', 'utf16le'),
      ]),
    );
    const { tool, page, send } = commander({});
    await tool.show(page, {
      id: '3',
      tool: 'commander',
      root: wide,
      view: true,
    });
    assert.strictEqual(page.of('viewing').at(-1)?.detected, 'utf-16le');

    await send({
      type: 'readRows',
      tab: '3',
      encoding: 'utf-16le',
      request: 1,
      anchor: 0,
      exact: true,
      before: 0,
      after: 5,
      least: 0,
    });
    assert.deepStrictEqual(
      page
        .of('rows')
        .at(-1)
        ?.rows.map((row) => row.text),
      ['one', 'two'],
    );
    await send({
      type: 'readText',
      tab: '3',
      encoding: 'utf-16le',
      request: 2,
    });
    assert.strictEqual(page.of('text').at(-1)?.text, '﻿one\ntwo\n');
  });

  test('reads a UTF-16 file without a byte order mark as UTF-16 rather than as a binary one', async () => {
    const log = path.join(opened, 'pfro.log');
    fs.writeFileSync(log, Buffer.from('3/17/2026 PFRO Error', 'utf16le'));
    const { tool, page } = commander({});

    await tool.show(page, {
      id: '3',
      tool: 'commander',
      root: log,
      view: true,
    });

    assert.strictEqual(page.of('viewing').at(-1)?.detected, 'utf-16le');
  });

  test('reads a text file that is not UTF-8 in the code page of the system, and one that is as UTF-8', async () => {
    const legacy = path.join(opened, 'legacy.txt');
    const modern = path.join(opened, 'modern.txt');
    fs.writeFileSync(legacy, Buffer.from([0xe1, 0x72, 0x76, 0xed, 0x7a]));
    fs.writeFileSync(modern, 'árvíz');
    const { tool, page } = commander({});

    await tool.show(page, {
      id: '3',
      tool: 'commander',
      root: legacy,
      view: true,
    });
    assert.strictEqual(page.of('viewing').at(-1)?.detected, 'windows-1250');
    await tool.show(page, {
      id: '4',
      tool: 'commander',
      root: modern,
      view: true,
    });
    assert.strictEqual(page.of('viewing').at(-1)?.detected, undefined);
  });

  test('tells whether a file viewed is binary and sends the bytes asked for, answering each request by its number', async () => {
    const data = path.join(opened, 'data.bin');
    fs.writeFileSync(data, Buffer.from([1, 0, 2, 3, 4, 5]));
    const { tool, page, send } = commander({});
    await tool.show(page, {
      id: '3',
      tool: 'commander',
      root: data,
      view: true,
    });
    assert.strictEqual(page.of('viewing').at(-1)?.binary, true);

    await send({
      type: 'readBytes',
      tab: '3',
      request: 9,
      start: 2,
      length: 16,
    });
    assert.deepStrictEqual(page.of('bytes'), [
      { type: 'bytes', tab: '3', request: 9, start: 2, data: [2, 3, 4, 5] },
    ]);

    for (const bad of [
      { tab: '4' },
      { start: -1 },
      { start: 0.5 },
      { length: maxBytesAsked + 1 },
    ]) {
      await send({
        type: 'readBytes',
        tab: '3',
        request: 10,
        start: 0,
        length: 16,
        ...bad,
      });
    }
    assert.strictEqual(page.of('bytes').length, 1);
  });
  test('watches a file viewed once when its tab is shown again while it was still starting to view it, as the first watcher was left open until quitting', async () => {
    const twice = path.join(opened, 'twice.txt');
    fs.writeFileSync(twice, 'text');
    const { tool, page, watched } = commander({});
    const viewer = {
      id: '3',
      tool: 'commander',
      root: twice,
      view: true,
    } as const;

    await Promise.all([tool.show(page, viewer), tool.show(page, viewer)]);

    assert.deepStrictEqual(watched(), [twice]);
    tool.hide(page);
    assert.deepStrictEqual(watched(), []);
  });

  test('says nothing of a file that could not be read once another tab is shown, as the page took it for the tab shown and left it blank', async () => {
    const shown = path.join(opened, 'shown.txt');
    fs.writeFileSync(shown, 'text');
    const { tool, page } = commander({});

    await Promise.all([
      tool.show(page, {
        id: '3',
        tool: 'commander',
        root: path.join(opened, 'gone.txt'),
        view: true,
      }),
      tool.show(page, {
        id: '4',
        tool: 'commander',
        root: shown,
        view: true,
      }),
    ]);

    assert.deepStrictEqual(
      page.of('viewing').map((message) => message.tab),
      ['4'],
    );
  });

  test('sends the whole text of a file viewed for its colors, only up to the size colored', async () => {
    const small = path.join(opened, 'small.ts');
    const large = path.join(opened, 'large.ts');
    fs.writeFileSync(small, 'const one = 1;');
    fs.writeFileSync(large, 'x'.repeat(maxColoredBytes + 1));
    const { tool, page, send } = commander({});

    await tool.show(page, {
      id: '3',
      tool: 'commander',
      root: small,
      view: true,
    });
    await send({ type: 'readText', tab: '3', encoding: 'utf-8', request: 4 });
    await send({ type: 'readText', tab: '5', encoding: 'utf-8', request: 5 });
    assert.deepStrictEqual(page.of('text'), [
      { type: 'text', tab: '3', request: 4, text: 'const one = 1;' },
    ]);

    await tool.show(page, {
      id: '6',
      tool: 'commander',
      root: large,
      view: true,
    });
    await send({ type: 'readText', tab: '6', encoding: 'utf-8', request: 6 });
    assert.deepStrictEqual(page.of('text').at(-1), {
      type: 'text',
      tab: '6',
      request: 6,
      text: undefined,
    });
  });

  test('tells the page when the file viewed changes, with its new size, and that one gone can’t be read', async () => {
    const grown = path.join(opened, 'grows.log');
    fs.writeFileSync(grown, 'a\n');
    const { tool, page, change } = commander({});
    await tool.show(page, {
      id: '3',
      tool: 'commander',
      root: grown,
      view: true,
    });

    fs.appendFileSync(grown, 'b\n');
    await change(grown);
    await waitFor(
      () => page.of('viewing').at(-1)?.size === 4,
      'the new size to be told',
    );

    const gone = path.join(opened, 'gone.txt');
    await tool.show(page, {
      id: '4',
      tool: 'commander',
      root: gone,
      view: true,
    });
    const told = page.of('viewing').at(-1);
    assert.deepStrictEqual(told && [told.tab, told.size], ['4', undefined]);
    assert.ok(told?.error);
  });

  test('tells the page a new version of the file viewed when it changes though its size does not, as an image or PDF of the same size kept showing the one before', async () => {
    const picture = path.join(opened, 'same.png');
    fs.writeFileSync(picture, 'one\n');
    const { tool, page, change } = commander({});
    await tool.show(page, {
      id: '3',
      tool: 'commander',
      root: picture,
      view: true,
    });

    fs.writeFileSync(picture, 'two\n');
    const later = new Date(Date.now() + 10_000);
    fs.utimesSync(picture, later, later);
    await change(picture);
    await waitFor(
      () => page.of('viewing').length === 2,
      'the change to be told',
    );

    const [first, second] = page.of('viewing');
    assert.strictEqual(second?.size, first?.size);
    assert.notStrictEqual(second?.version, first?.version);
    assert.strictEqual(
      second?.version,
      await sampledVersion(picture, fs.statSync(picture)),
    );
  });

  test('tells the page a new version of the file viewed when its bytes change though its size and dates do not, as on a FAT drive or a share whose files have no id', async () => {
    const picture = path.join(opened, 'alike.png');
    const sameDate = new Date('2026-01-02T03:04:05Z');
    fs.writeFileSync(picture, 'one\n');
    fs.utimesSync(picture, sameDate, sameDate);
    const { tool, page, change } = commander({});
    await tool.show(page, {
      id: '3',
      tool: 'commander',
      root: picture,
      view: true,
    });

    fs.writeFileSync(picture, 'two\n');
    fs.utimesSync(picture, sameDate, sameDate);
    await change(picture);
    await waitFor(
      () => page.of('viewing').length === 2,
      'the change to be told',
    );

    const [first, second] = page.of('viewing');
    assert.strictEqual(second?.size, first?.size);
    assert.notStrictEqual(second?.version, first?.version);
  });
});
