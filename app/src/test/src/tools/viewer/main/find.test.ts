import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, suite, test } from 'vitest';
import { plainSearch } from '../../../../../lib/shared/searchOptions';
import { plainOf } from '../../../../../lib/shared/sentences';
import { viewer, forged } from './viewerFixtures';
import { removeFolder, tempFolder } from '../../../../helpers/tempFolders';
import { inThread } from '../../../../../lib/main/patternSearch';
import { strings } from '../../../../../lib/shared/strings';

suite('Viewer tool finding in a file viewed', () => {
  let opened: string;

  beforeEach(() => {
    opened = tempFolder('commander');
  });

  afterEach(() => removeFolder(opened));

  test('searches by a regular expression through the pattern search it is given, ending the search with the matches found so far and a notice once a line takes the pattern too long', async () => {
    const notes = path.join(opened, 'find.txt');
    fs.writeFileSync(notes, 'ab\nab\n');
    const { tool, page, send, notices } = viewer({
      patterns: { ...inThread, ranges: () => Promise.resolve('slow') },
    });
    await tool.show(page, { id: '3', tool: 'viewer', root: notes });

    await send({
      type: 'findText',
      tab: '3',
      encoding: 'utf-8',
      query: 'a.',
      options: { caseSensitive: false, wholeWord: false, regex: true },
      request: 4,
    });

    assert.deepStrictEqual(page.of('found').at(-1), {
      type: 'found',
      tab: '3',
      request: 4,
      matches: [],
      capped: false,
      done: true,
    });
    assert.deepStrictEqual(notices, [
      { level: 'error', message: strings.find.tooSlow },
    ]);
  });

  test('finds text in a file viewed in the encoding and with the options asked for, answering with the bytes of each match, and checks what the page asks, its options included', async () => {
    const notes = path.join(opened, 'find.txt');
    fs.writeFileSync(notes, 'Árvíz\nnothing\nÁRVÍZ\n');
    const { tool, page, send } = viewer();
    await tool.show(page, {
      id: '3',
      tool: 'viewer',
      root: notes,
    });

    await send({
      type: 'findText',
      tab: '3',
      encoding: 'utf-8',
      query: 'árvíz',
      options: plainSearch,
      request: 4,
    });

    assert.deepStrictEqual(page.of('found').at(-1), {
      type: 'found',
      tab: '3',
      request: 4,
      matches: [
        { start: 0, end: 7 },
        { start: 16, end: 23 },
      ],
      capped: false,
      done: true,
    });
    for (const bad of [
      { tab: '4' },
      { query: 'x'.repeat(1001) },
      { request: 1.5 },
    ]) {
      await send({
        type: 'findText',
        tab: '3',
        encoding: 'utf-8',
        query: 'a',
        options: plainSearch,
        request: 5,
        ...bad,
      });
    }
    for (const options of [
      '',
      '"options": null, ',
      '"options": [false, false, false], ',
      '"options": { "caseSensitive": false, "wholeWord": false }, ',
      '"options": { "caseSensitive": "yes", "wholeWord": false, "regex": false }, ',
      '"options": { "caseSensitive": false, "wholeWord": false, "regex": false, "more": true }, ',
    ]) {
      await send(
        forged(
          `{ "type": "findText", "tab": "3", "encoding": "utf-8", "query": "a", ${options}"request": 5 }`,
        ),
      );
    }
    await send(
      forged(
        '{ "type": "findText", "tab": "3", "encoding": "utf-8", "query": 7, "options": { "caseSensitive": false, "wholeWord": false, "regex": false }, "request": 5 }',
      ),
    );
    assert.strictEqual(page.of('found').length, 1);

    await send({
      type: 'findText',
      tab: '3',
      encoding: 'utf-8',
      query: 'Á',
      options: { ...plainSearch, caseSensitive: true, wholeWord: true },
      request: 6,
    });
    assert.deepStrictEqual(page.of('found').at(-1)?.matches, []);
    await send({
      type: 'findText',
      tab: '3',
      encoding: 'utf-8',
      query: '^Á.+Z$',
      options: { ...plainSearch, caseSensitive: true, regex: true },
      request: 7,
    });
    assert.deepStrictEqual(page.of('found').at(-1)?.matches, [
      { start: 16, end: 23 },
    ]);
  });

  test('stops a find the page no longer wants, telling nothing more of it, and leaves a find of another request going', async () => {
    const notes = path.join(opened, 'stop.txt');
    fs.writeFileSync(notes, 'needle '.repeat(1000));
    const { tool, page, send } = viewer();
    await tool.show(page, {
      id: '3',
      tool: 'viewer',
      root: notes,
    });
    const ask = (request: number) =>
      send({
        type: 'findText',
        tab: '3',
        encoding: 'utf-8',
        query: 'needle',
        options: plainSearch,
        request,
      });

    const stopped = ask(6);
    await send({ type: 'stopFind', tab: '3', request: 6 });
    await stopped;
    assert.deepStrictEqual(page.of('found'), []);

    const going = ask(7);
    await send({ type: 'stopFind', tab: '3', request: 6 });
    await going;
    assert.strictEqual(page.of('found').at(-1)?.done, true);
  });

  test('says the file viewed could not be read when a find cannot read it, rather than that nothing was found', async () => {
    const notes = path.join(opened, 'gone.txt');
    fs.writeFileSync(notes, 'needle');
    const { tool, page, send } = viewer();
    await tool.show(page, {
      id: '3',
      tool: 'viewer',
      root: notes,
    });
    fs.rmSync(notes);
    await send({
      type: 'findText',
      tab: '3',
      encoding: 'utf-8',
      query: 'needle',
      options: plainSearch,
      request: 1,
    });
    assert.deepStrictEqual(page.of('found'), []);
    const told = page.of('viewing').at(-1);
    assert.strictEqual(told?.size, undefined);
    assert.match(plainOf(told?.error ?? ''), /gone\.txt/);
  });
});
