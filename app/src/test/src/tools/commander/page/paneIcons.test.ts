import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { suite, test } from 'vitest';
import {
  iconUrl,
  type IconSource,
} from '../../../../../tools/commander/shared/icons';
import { iconWait } from '../../../../../tools/commander/page/iconAsks';
import {
  PaneIcons,
  type IconLoads,
  type IconTickets,
} from '../../../../../tools/commander/page/paneIcons';

const source = (name: string): IconSource => ({
  tab: '1',
  side: 'left',
  folder: '/work',
  name,
});

const rested = () =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, iconWait + 30);
  });

const settled = () => new Promise<void>((resolve) => setTimeout(resolve));

function fakes(came: Map<string, string> = new Map()) {
  const asked: string[] = [];
  const dropped: string[] = [];
  const told: string[] = [];
  const pending = new Map<
    string,
    { resolve: (blob: Blob) => void; reject: (error: Error) => void }
  >();
  let tickets = 0;
  const loads: IconLoads<{ close: () => void }> = {
    fetch: (url, signal) =>
      new Promise((resolve, reject) => {
        asked.push(url);
        pending.set(url, { resolve, reject });
        signal.addEventListener('abort', () => reject(new Error('aborted')));
      }),
    decode: () => Promise.resolve({ close: () => undefined }),
    ticket: () => `t${++tickets}`,
  };
  const iconTickets: IconTickets = {
    iconTicketOf: (url) => came.get(url),
    iconCame: (url, ticket) => {
      came.set(url, ticket);
      told.push(url);
    },
    dropIcon: (ticket) => dropped.push(ticket),
  };
  return { asked, dropped, told, pending, loads, iconTickets };
}

async function withPage(run: () => Promise<void>): Promise<void> {
  const dom = new JSDOM('<!doctype html><main></main>');
  const saved = Reflect.get(globalThis, 'document');
  Reflect.set(globalThis, 'document', dom.window.document);
  try {
    await run();
  } finally {
    Reflect.set(globalThis, 'document', saved);
  }
}

suite('Icons of the files a side draws', () => {
  test('asks for the icon of a file only once the list has rested, drawing the generic one meanwhile, and tells the store the address it came by', async () => {
    await withPage(async () => {
      const page = fakes();
      let redrawn = 0;
      const icons = new PaneIcons(
        page.iconTickets,
        () => redrawn++,
        page.loads,
      );
      const notes = source('notes.txt');

      assert.strictEqual(icons.shown(notes), undefined);
      assert.deepStrictEqual(page.asked, []);
      await rested();
      assert.deepStrictEqual(page.asked, [iconUrl(notes, 't1')]);

      page.pending.get(iconUrl(notes, 't1'))?.resolve(new Blob());
      await settled();
      assert.notStrictEqual(icons.shown(notes), undefined);
      assert.notStrictEqual(icons.shown(notes), 'failed');
      assert.deepStrictEqual([page.told, redrawn], [[iconUrl(notes)], 1]);
      icons.dispose();
    });
  });

  test('hands back the ticket of an icon whose row went before it came, and none of one that came, failed or came before by its address, which it asks for at once', async () => {
    await withPage(async () => {
      const page = fakes(new Map([[iconUrl(source('kept.txt')), 'old']]));
      const icons = new PaneIcons(
        page.iconTickets,
        () => undefined,
        page.loads,
      );
      const [gone, failing, kept] = ['gone.txt', 'failing.txt', 'kept.txt'].map(
        source,
      );
      icons.shown(gone);
      icons.shown(failing);
      icons.shown(kept);
      assert.deepStrictEqual(page.asked, [iconUrl(kept, 'old')]);
      await rested();

      page.pending.get(iconUrl(failing, 't2'))?.reject(new Error('none'));
      await settled();
      icons.keep(new Set([iconUrl(kept)]));
      await settled();

      assert.deepStrictEqual(
        [page.dropped, icons.shown(failing)],
        [['t1'], 'failed'],
      );
      icons.dispose();
    });
  });

  test('looks for no icon of a row that went before the list rested', async () => {
    await withPage(async () => {
      const page = fakes();
      const icons = new PaneIcons(
        page.iconTickets,
        () => undefined,
        page.loads,
      );
      icons.shown(source('passed.txt'));
      icons.keep(new Set());
      await rested();
      assert.deepStrictEqual([page.asked, page.dropped], [[], []]);
      icons.dispose();
    });
  });
});
