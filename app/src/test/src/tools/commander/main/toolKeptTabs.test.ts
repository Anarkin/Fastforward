import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import type { Tab } from '../../../../../shell/main/toolContract';
import { commander, forged, tab } from './commanderFixtures';
import { CommanderPage } from './fakePage';
import { root } from './entryFixtures';

const keptOf = (page: CommanderPage) => page.of('show').at(-1)?.kept;

const opened = (tabs: Tab[], ...more: Tab[]) => {
  tabs.push(tab, ...more);
};

suite('Commander tool keeping its tabs', () => {
  test('hands what a page kept of a tab back with the tab once another page shows it, as a window reloaded or the window it moved to', async () => {
    const { tool, page, send, tabs } = commander({ [root]: [] });
    opened(tabs);
    const other = new CommanderPage();
    tool.ready(page);
    tool.ready(other);
    await tool.show(page, tab);

    await send({ type: 'keepTab', tab: '1', kept: { sides: { share: 0.3 } } });
    tool.hide(page);
    await tool.show(other, tab);

    assert.deepStrictEqual(keptOf(other), { sides: { share: 0.3 } });
  });

  test('hands nothing back to the page that kept it last, which holds it already', async () => {
    const { tool, page, send, tabs } = commander({ [root]: [] });
    opened(tabs);
    tool.ready(page);
    await tool.show(page, tab);
    await send({ type: 'keepTab', tab: '1', kept: { sides: { share: 0.3 } } });
    tool.hide(page);

    await tool.show(page, tab);

    assert.strictEqual(keptOf(page), undefined);
  });

  test('hands back with a viewer tab and an editor tab what their page kept', async () => {
    const { tool, page, send, tabs } = commander({ [root]: [] });
    const viewed: Tab = {
      id: '2',
      tool: 'commander',
      root: 'gone.txt',
      view: true,
    };
    const edited: Tab = {
      id: '3',
      tool: 'commander',
      root: 'gone.txt',
      edit: true,
    };
    opened(tabs, viewed, edited);
    const other = new CommanderPage();
    tool.ready(page);
    tool.ready(other);
    await tool.show(page, viewed);
    await send({ type: 'keepTab', tab: '2', kept: { viewer: { place: 7 } } });
    await tool.show(page, edited);
    await send({
      type: 'keepTab',
      tab: '3',
      kept: { editor: { finding: true } },
    });

    await tool.show(other, viewed);
    assert.deepStrictEqual(keptOf(other), { viewer: { place: 7 } });
    await tool.show(other, edited);
    assert.deepStrictEqual(keptOf(other), { editor: { finding: true } });
  });

  test('keeps what a page sends of the tab it showed last, as it sends that tab once told to show another, which may have moved the tab to another window already', async () => {
    const { tool, page, send, tabs, windows } = commander({ [root]: [] });
    const next: Tab = { id: '2', tool: 'commander' };
    opened(tabs, next);
    const moved = new CommanderPage();
    tool.ready(page);
    tool.ready(moved);
    windows.set(page, [next]);
    windows.set(moved, [tab]);
    await tool.show(page, tab);
    await tool.show(page, next);

    await send({ type: 'keepTab', tab: '1', kept: { sides: { share: 0.3 } } });
    await tool.show(moved, tab);

    assert.deepStrictEqual(keptOf(moved), { sides: { share: 0.3 } });
  });

  test('keeps what a page sends of a tab moved into another window that showed it before the page showed another', async () => {
    const { tool, page, send, tabs, windows } = commander({ [root]: [] });
    const next: Tab = { id: '2', tool: 'commander' };
    opened(tabs, next);
    const there = new CommanderPage();
    tool.ready(page);
    tool.ready(there);
    await tool.show(page, tab);
    windows.set(page, [next]);
    windows.set(there, [tab]);
    await tool.show(there, tab);
    await tool.show(page, next);

    await send({ type: 'keepTab', tab: '1', kept: { sides: { share: 0.3 } } });
    tool.hide(there);
    await tool.show(there, tab);

    assert.deepStrictEqual(keptOf(there), { sides: { share: 0.3 } });
  });

  test("refuses what a page sends of a tab of another window, of another tool's tab, of a tab closed or not named, and what is too large", async () => {
    const { tool, page, send, tabs, windows } = commander({ [root]: [] });
    const elsewhere: Tab = { id: '2', tool: 'commander' };
    const git: Tab = { id: '3', tool: 'git' };
    opened(tabs, elsewhere, git);
    const other = new CommanderPage();
    tool.ready(page);
    tool.ready(other);
    windows.set(page, [tab, git]);
    windows.set(other, [elsewhere]);
    await tool.show(page, tab);
    await send({ type: 'keepTab', tab: '1', kept: { sides: { share: 0.3 } } });

    await send({ type: 'keepTab', tab: '2', kept: { sides: { share: 0.4 } } });
    await send({ type: 'keepTab', tab: '3', kept: { sides: { share: 0.4 } } });
    await send({ type: 'keepTab', tab: '4', kept: { sides: { share: 0.4 } } });
    await send(forged('{"type":"keepTab","tab":1,"kept":{}}'));
    await send({
      type: 'keepTab',
      tab: '1',
      kept: 'x'.repeat(2 * 1024 * 1024),
    });
    tool.hide(page);
    await tool.show(other, elsewhere);
    assert.strictEqual(keptOf(other), undefined);
    await tool.show(other, tab);

    assert.deepStrictEqual(keptOf(other), { sides: { share: 0.3 } });
  });

  test('forgets what was kept of a tab once it is closed', async () => {
    const { tool, page, send, tabs } = commander({ [root]: [] });
    opened(tabs);
    const other = new CommanderPage();
    tool.ready(page);
    tool.ready(other);
    await tool.show(page, tab);
    await send({ type: 'keepTab', tab: '1', kept: { sides: { share: 0.3 } } });

    tool.closed(page, tab);
    await tool.show(other, tab);

    assert.strictEqual(keptOf(other), undefined);
  });
});
