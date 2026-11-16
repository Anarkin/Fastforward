import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import type { Tab } from '../../../../../shell/main/toolContract';
import {
  iconUrl,
  viewerIconUrl,
} from '../../../../../tools/commander/shared/icons';
import { commander, tab, forged } from './commanderFixtures';
import { root, at, folder, file } from './entryFixtures';

suite('Commander tool serving icons', () => {
  test('gives an editing tab the icon of its file, at an address naming the file, served for that tab and file only', async () => {
    const { tool, tabs, iconsLoaded } = commander({});
    const editing: Tab = {
      id: '6',
      tool: 'commander',
      root: at('code.ts'),
      edit: true,
    };
    tabs.push({ id: '4', tool: 'commander', root }, editing);
    const served = async (url: string) =>
      (await tool.icon(new URL(`fastforward://app${url}`))).status;
    assert.strictEqual(
      tool.names([editing]).get('6')?.icon,
      viewerIconUrl('6', at('code.ts')),
    );
    assert.strictEqual(await served(viewerIconUrl('6', at('code.ts'))), 200);
    assert.strictEqual(await served(viewerIconUrl('6', at('other.md'))), 404);
    assert.strictEqual(await served(viewerIconUrl('4', root)), 404);
    assert.deepStrictEqual(iconsLoaded, [at('code.ts')]);
    assert.strictEqual(
      tool.names([{ id: '4', tool: 'commander', root }]).get('4')?.icon,
      undefined,
    );
  });
  test('serves the icon of a file a side lists, and nothing else, as folders keep the icon of the app', async () => {
    const { tool, page, iconsLoaded } = commander({
      [root]: [folder('Users'), file('notes.txt')],
    });
    await tool.show(page, tab);
    const icon = async (query: Record<string, string>) => {
      const response = await tool.icon(
        new URL(
          `fastforward://app${iconUrl({ tab: '1', side: 'left', folder: root, name: 'notes.txt', ...query })}`,
        ),
      );
      return response.ok
        ? [response.headers.get('content-type'), await response.text()]
        : response.status;
    };

    assert.deepStrictEqual(await icon({}), [
      'image/png',
      `icon of ${at('notes.txt')}`,
    ]);
    assert.strictEqual(await icon({ name: 'Users' }), 404);
    assert.strictEqual(await icon({ name: '..' }), 404);
    assert.strictEqual(await icon({ name: 'secret.txt' }), 404);
    assert.strictEqual(await icon({ folder: at('Users') }), 404);
    assert.strictEqual(await icon({ tab: '2' }), 404);
    assert.strictEqual(await icon({ side: 'middle' }), 404);
    assert.deepStrictEqual(iconsLoaded, [at('notes.txt')]);
  });
  test('loads no icon for a row the page dropped before its icon came, taking only tickets it can read', async () => {
    const { tool, page, send, iconsLoaded } = commander({
      [root]: [file('a.zip'), file('b.txt'), file('c.md')],
    });
    await tool.show(page, tab);
    const icon = async (name: string, ticket: string) =>
      (
        await tool.icon(
          new URL(
            `fastforward://app${iconUrl({ tab: '1', side: 'left', folder: root, name }, ticket)}`,
          ),
        )
      ).status;

    await send({ type: 'dropIcons', tickets: ['7'] });
    await send(forged('{ "type": "dropIcons", "tickets": [8] }'));
    await send(forged('{ "type": "dropIcons", "tickets": "9" }'));

    assert.strictEqual(await icon('a.zip', '7'), 404);
    assert.strictEqual(await icon('b.txt', '8'), 200);
    assert.strictEqual(await icon('c.md', '9'), 200);
    assert.deepStrictEqual(iconsLoaded, [at('b.txt'), at('c.md')]);
  });
});
