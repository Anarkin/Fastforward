import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import type { Sorts } from '../../../../../tools/commander/shared/sorts';
import { commander, tab, forged } from './commanderFixtures';
import { CommanderPage } from './fakePage';
import { root, at, folder } from './entryFixtures';
import { defaultColumns, defaultSorts } from './defaultSettings';

suite('Commander tool', () => {
  test('holds the widths of the columns and the size of the tiles the settings give in the range they may take, as a width too wide failed every drag after it and a size below the least drew no tiles', async () => {
    const { tool, page, settings } = commander({ [root]: [] });
    settings.columns = { extension: 10.4, size: 0, date: 120 };
    settings.thumbnailSize = -16;
    tool.ready(page);
    const told = page.of('settings').at(-1);
    assert.deepStrictEqual(told?.columns, {
      extension: 10,
      size: 1,
      date: 100,
    });
    assert.strictEqual(told.thumbnailSize, 16);
    settings.thumbnailSize = 5000;
    tool.ready(page);
    assert.strictEqual(page.of('settings').at(-1)?.thumbnailSize, 1024);
  });

  test('saves the order of the side whose header was clicked, or whose files are grouped by color, keeping the other, and tells the page', async () => {
    const { tool, page, send, saved } = commander({});
    tool.ready(page);

    await send({
      type: 'sort',
      side: 'right',
      sort: { column: 'size', descending: true, groupByColor: true },
    });
    await send(
      forged(
        '{ "type": "sort", "side": "right", "sort": { "column": "owner", "descending": true, "groupByColor": false } }',
      ),
    );
    await send(
      forged(
        '{ "type": "sort", "side": "right", "sort": { "column": "size", "descending": "yes", "groupByColor": false } }',
      ),
    );
    await send(
      forged(
        '{ "type": "sort", "side": "right", "sort": { "column": "size", "descending": true, "groupByColor": "yes" } }',
      ),
    );
    await send(
      forged(
        '{ "type": "sort", "side": "middle", "sort": { "column": "size", "descending": true, "groupByColor": false } }',
      ),
    );

    const sorted: Sorts = {
      left: defaultSorts.left,
      right: { column: 'size', descending: true, groupByColor: true },
    };
    assert.deepStrictEqual(saved, [sorted]);
    assert.deepStrictEqual(page.of('settings').at(-1)?.sort, sorted);
  });

  test('tells the page the size of the thumbnails, and saves no layout, which each tab keeps for itself', async () => {
    const { tool, page, send, saved } = commander({});
    tool.ready(page);
    assert.strictEqual(page.of('settings').at(-1)?.thumbnailSize, 144);
    const told = page.of('settings').length;

    await send(
      forged('{ "type": "layout", "side": "right", "layout": "thumbnails" }'),
    );

    assert.deepStrictEqual(saved, []);
    assert.strictEqual(page.of('settings').length, told);
  });

  test('saves whether the hidden files are shown, and tells the page', async () => {
    const { tool, page, send, saved } = commander({});
    tool.ready(page);

    await send({ type: 'showHidden', shown: false });
    await send(forged('{ "type": "showHidden", "shown": "no" }'));

    assert.deepStrictEqual(saved, [false]);
    assert.deepStrictEqual(
      page.of('settings').map((each) => each.showHidden),
      [true, false],
    );
  });

  test('saves the widths of the columns the page resized, whole and within bounds, and tells the page with the defaults', async () => {
    const { tool, page, send, saved } = commander({});
    tool.ready(page);

    await send({
      type: 'columns',
      columns: { extension: 6, size: 12, date: 16 },
    });
    await send(
      forged(
        '{ "type": "columns", "columns": { "extension": 0, "size": 12, "date": 16 } }',
      ),
    );
    await send(
      forged(
        '{ "type": "columns", "columns": { "extension": 6.5, "size": 12, "date": 16 } }',
      ),
    );
    await send(
      forged(
        '{ "type": "columns", "columns": { "extension": 6, "size": 12 } }',
      ),
    );
    await send(
      forged(
        '{ "type": "columns", "columns": { "extension": 6, "size": 12, "date": 16, "name": 40 } }',
      ),
    );

    assert.deepStrictEqual(saved, [
      { extension: 6, size: 12, date: 16 },
      { extension: 6, size: 12, date: 16 },
    ]);
    assert.deepStrictEqual(page.of('settings').at(-1), {
      type: 'settings',
      showHidden: true,
      sort: defaultSorts,
      columns: { extension: 6, size: 12, date: 16 },
      defaultColumns,
      canElevate: false,
      platform: 'linux',
      thumbnailSize: 144,
      fileColors: [],
      bookmarks: [],
    });
  });

  test('bookmarks the folder a side shows, saving it after the bookmarks written before, and tells the page the bookmarks it can open, sorted, but none for a folder the side doesn’t show or one bookmarked already', async () => {
    const work = at('work');
    const { tool, page, send, saved, settings } = commander({
      [root]: [folder('work')],
      [work]: [],
    });
    settings.bookmarks = [at('zeta'), 'Downloads'];
    tool.ready(page);
    await tool.show(page, tab);
    await send({ type: 'open', tab: '1', side: 'right', name: 'work' });

    await send({ type: 'addBookmark', tab: '1', side: 'right', folder: work });
    await send({ type: 'addBookmark', tab: '1', side: 'right', folder: work });
    await send({ type: 'addBookmark', tab: '1', side: 'left', folder: work });
    await send({ type: 'addBookmark', tab: '2', side: 'right', folder: work });
    await send(
      forged(
        `{ "type": "addBookmark", "tab": "1", "side": "middle", "folder": ${JSON.stringify(work)} }`,
      ),
    );

    assert.deepStrictEqual(saved, [[at('zeta'), 'Downloads', work]]);
    assert.deepStrictEqual(
      page.of('settings').map((each) => each.bookmarks),
      [[at('zeta')], [work, at('zeta')]],
    );
  });

  test('removes a bookmark however it was written, keeping the others as written, and tells the page, saving nothing for a folder not bookmarked', async () => {
    const { tool, page, send, saved, settings } = commander({});
    settings.bookmarks = [at('work'), at('zeta'), 'Downloads'];
    tool.ready(page);

    await send({ type: 'removeBookmark', folder: at('work') });
    await send({ type: 'removeBookmark', folder: at('gone') });
    await send(forged('{ "type": "removeBookmark", "folder": 2 }'));

    assert.deepStrictEqual(saved, [[at('zeta'), 'Downloads']]);
    assert.deepStrictEqual(
      page.of('settings').map((each) => each.bookmarks),
      [[at('work'), at('zeta')], [at('zeta')]],
    );
  });

  test('tells the page to close brackets as they are typed in the editor once the settings say so', () => {
    const { tool, page, closing } = commander({ [root]: [] });
    tool.reloadSettings();
    assert.strictEqual(page.of('settings').at(-1)?.closeBrackets, undefined);
    closing.now = true;
    tool.reloadSettings();
    assert.strictEqual(page.of('settings').at(-1)?.closeBrackets, true);
  });

  test('tells every window the settings once they change', () => {
    const { tool, page, pages } = commander({ [root]: [] });
    const other = new CommanderPage();
    pages.push(other);
    tool.reloadSettings();
    assert.strictEqual(page.of('settings').length, 1);
    assert.strictEqual(other.of('settings').length, 1);
  });
});
