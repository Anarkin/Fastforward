import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, suite, test } from 'vitest';
import { plainOf } from '../../../../../lib/shared/sentences';
import { commander, forged } from './commanderFixtures';
import { removeFolder, tempFolder } from '../../../../helpers/tempFolders';

suite('Commander tool finding in a file viewed', () => {
  let opened: string;

  beforeEach(() => {
    opened = tempFolder('commander');
  });

  afterEach(() => removeFolder(opened));

  test('finds text in a file viewed in the encoding asked for, answering with the bytes of each match, and checks what the page asks', async () => {
    const notes = path.join(opened, 'find.txt');
    fs.writeFileSync(notes, 'Árvíz\nnothing\nÁRVÍZ\n');
    const { tool, page, send } = commander({});
    await tool.show(page, {
      id: '3',
      tool: 'commander',
      root: notes,
      view: true,
    });

    await send({
      type: 'findText',
      tab: '3',
      encoding: 'utf-8',
      query: 'árvíz',
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
        request: 5,
        ...bad,
      });
    }
    await send(
      forged(
        '{ "type": "findText", "tab": "3", "encoding": "utf-8", "query": 7, "request": 5 }',
      ),
    );
    assert.strictEqual(page.of('found').length, 1);
  });

  test('stops a find the page no longer wants, telling nothing more of it, and leaves a find of another request going', async () => {
    const notes = path.join(opened, 'stop.txt');
    fs.writeFileSync(notes, 'needle '.repeat(1000));
    const { tool, page, send } = commander({});
    await tool.show(page, {
      id: '3',
      tool: 'commander',
      root: notes,
      view: true,
    });
    const ask = (request: number) =>
      send({
        type: 'findText',
        tab: '3',
        encoding: 'utf-8',
        query: 'needle',
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
    const { tool, page, send } = commander({});
    await tool.show(page, {
      id: '3',
      tool: 'commander',
      root: notes,
      view: true,
    });
    fs.rmSync(notes);
    await send({
      type: 'findText',
      tab: '3',
      encoding: 'utf-8',
      query: 'needle',
      request: 1,
    });
    assert.deepStrictEqual(page.of('found'), []);
    const told = page.of('viewing').at(-1);
    assert.strictEqual(told?.size, undefined);
    assert.match(plainOf(told?.error ?? ''), /gone\.txt/);
  });
});
