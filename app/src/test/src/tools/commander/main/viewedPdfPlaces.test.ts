import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, suite, test } from 'vitest';
import type { Tab } from '../../../../../shell/main/toolContract';
import { removeFolder, tempFolder } from '../../../../helpers/repositories';
import { commander, forged } from './commanderFixtures';

suite('Commander tool remembering the place in a PDF viewed', () => {
  let opened: string;

  beforeEach(() => {
    opened = tempFolder('commander');
  });

  afterEach(() => removeFolder(opened));

  test('remembers the place in a PDF viewed by its ID, and tells it again once asked, checking what the page sends', async () => {
    const book = path.join(opened, 'book.pdf');
    fs.writeFileSync(book, '%PDF-1.7');
    const { tool, page, send } = commander({});
    await tool.show(page, {
      id: '3',
      tool: 'commander',
      root: book,
      view: true,
    });
    const place = {
      page: 12,
      zoom: 'page-width',
      left: 0,
      top: 400,
    } as const;

    await send({
      type: 'savePdfPlace',
      tab: '3',
      fingerprint: 'ab12',
      place,
    });
    await send({
      type: 'readPdfPlace',
      tab: '3',
      fingerprint: 'ab12',
      request: 4,
    });
    await send({
      type: 'readPdfPlace',
      tab: '3',
      fingerprint: 'cd34',
      request: 5,
    });

    assert.deepStrictEqual(page.of('pdfPlace'), [
      { type: 'pdfPlace', tab: '3', request: 4, place },
      { type: 'pdfPlace', tab: '3', request: 5 },
    ]);
    for (const bad of [
      { tab: '4' },
      { fingerprint: '../places' },
      { place: { ...place, page: 0 } },
    ]) {
      await send({
        type: 'savePdfPlace',
        tab: '3',
        fingerprint: 'ab12',
        place: { ...place, page: 99 },
        ...bad,
      });
    }
    await send(
      forged(
        '{ "type": "savePdfPlace", "tab": "3", "fingerprint": "ab12", "place": "page=99" }',
      ),
    );
    await send({
      type: 'readPdfPlace',
      tab: '3',
      fingerprint: 'ab12',
      request: 6,
    });
    assert.deepStrictEqual(page.of('pdfPlace').at(-1), {
      type: 'pdfPlace',
      tab: '3',
      request: 6,
      place,
    });
  });

  test('remembers the last place in a PDF the page sends as its viewer closes, for the file that tab viewed', async () => {
    const book = path.join(opened, 'book.pdf');
    fs.writeFileSync(book, '%PDF-1.7');
    const { tool, page, send } = commander({});
    const viewer: Tab = {
      id: '3',
      tool: 'commander',
      root: book,
      view: true,
    };
    await tool.show(page, viewer);
    const place = { page: 40, zoom: 'auto', left: 0, top: 0 } as const;

    tool.closed(page, viewer);
    await send({
      type: 'savePdfPlace',
      tab: '3',
      fingerprint: 'ab12',
      place,
    });
    await send({
      type: 'savePdfPlace',
      tab: '9',
      fingerprint: 'ab12',
      place: { ...place, page: 2 },
    });
    await tool.show(page, { ...viewer, id: '4' });
    await send({
      type: 'readPdfPlace',
      tab: '4',
      fingerprint: 'ab12',
      request: 5,
    });

    assert.deepStrictEqual(page.of('pdfPlace').at(-1), {
      type: 'pdfPlace',
      tab: '4',
      request: 5,
      place,
    });
  });

  test('remembers no place for a file viewed that is not a PDF', async () => {
    const notes = path.join(opened, 'notes.txt');
    fs.writeFileSync(notes, 'text');
    const { tool, page, send } = commander({});
    await tool.show(page, {
      id: '3',
      tool: 'commander',
      root: notes,
      view: true,
    });

    await send({
      type: 'savePdfPlace',
      tab: '3',
      fingerprint: 'ab12',
      place: { page: 2, zoom: 'auto', left: 0, top: 0 },
    });
    await send({
      type: 'readPdfPlace',
      tab: '3',
      fingerprint: 'ab12',
      request: 4,
    });

    assert.deepStrictEqual(page.of('pdfPlace'), []);
  });
});
