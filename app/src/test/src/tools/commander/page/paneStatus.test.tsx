import * as assert from 'node:assert';
import { act } from 'react';
import { afterEach, suite, test, vi } from 'vitest';
import { renderToStaticMarkup as markupOf } from 'react-dom/server';
import type { FlatProgress } from '../../../../../tools/commander/shared/protocol';
import { emptyView } from '../../../../../tools/commander/page/view';
import type { PaneView } from '../../../../../tools/commander/page/paneView';
import {
  CommanderStore,
  createCommanderStore,
} from '../../../../../tools/commander/page/store';
import { strings } from '../../../../../lib/shared/strings';
import { noop } from '../../../../helpers/fixtures';
import { JSDOM } from 'jsdom';
import { withStores } from '../../../../helpers/componentFixtures';
import { Pane } from '../../../../../tools/commander/page/pane';
import { flatPane, inSide, pane, progress } from './paneFixtures';

const renderToStaticMarkup = (node: React.ReactNode) =>
  markupOf(withStores(node));

const paneElement = (
  <Pane side="left" driveTrigger={null} bookmarkTrigger={null} resizer={null} />
);

const sideOf = (shown: PaneView, reads = 0) =>
  new JSDOM(
    renderToStaticMarkup(
      <CommanderStore
        value={createCommanderStore(noop, {
          view: {
            ...emptyView,
            tab: '1',
            active: 'left',
            platform: 'win32',
            panes: { left: shown, right: undefined },
          },
          readingSides: new Map(reads === 0 ? [] : [['1 left', reads]]),
        })}
      >
        {paneElement}
      </CommanderStore>,
    ),
  ).window.document;

const side = (
  folder: string,
  flat: FlatProgress | undefined,
  selected?: string,
) => sideOf(flatPane(folder, flat, selected));

const status = (document: Document | Element) => {
  const line = document.querySelector('.column-status');
  return line === null
    ? undefined
    : {
        text: line.querySelector('.column-status-text')?.textContent,
        className: line.className,
        role: line.querySelector('.column-status-text')?.getAttribute('role'),
      };
};

const duplicates = (
  groups: readonly (readonly string[])[],
  reading: boolean,
  flat: FlatProgress | undefined,
  selected: string,
) =>
  status(
    sideOf({
      ...flatPane('C:\\a', flat, selected),
      duplicates: { look: 1, groups, reading },
    }),
  );

const pathLine = (path: string) => ({
  text: path,
  className: 'column-status monospace',
  role: null,
});

const readingLine = {
  text: strings.common.reading,
  className: 'column-status monospace',
  role: 'status',
};

const waited = (time: number) =>
  act(async () => {
    vi.advanceTimersByTime(time);
  });

suite('Commander side status', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test('gives the full path of the file selected under a side listed flat once it is read or stopped, in the monospace font, without counting anything, and the path of the folder listed flat for .. or nothing selected, so the line never comes and goes as the selection moves, and nothing for a side not flat', () => {
    assert.deepStrictEqual(
      status(side('C:\\a', progress(), 'sub\\b.txt')),
      pathLine('C:\\a\\sub\\b.txt'),
    );
    assert.deepStrictEqual(
      status(side('C:\\a', progress({ stopped: true, failed: 3 }), 'a.txt')),
      pathLine('C:\\a\\a.txt'),
    );
    assert.deepStrictEqual(
      status(side('C:\\a', progress(), '..')),
      pathLine('C:\\a'),
    );
    assert.deepStrictEqual(
      status(side('C:\\a', progress())),
      pathLine('C:\\a'),
    );
    assert.strictEqual(status(side('C:\\a', undefined, 'a.txt')), undefined);
  });

  test('gives the full path of the file selected under a side showing duplicates once they are looked for, listed flat or not, and nothing while it looks or once it found none', () => {
    const found = [['a.txt', 'sub\\b.txt']];
    assert.deepStrictEqual(
      duplicates(found, false, undefined, 'a.txt'),
      pathLine('C:\\a\\a.txt'),
    );
    assert.deepStrictEqual(
      duplicates(found, false, progress(), 'sub\\b.txt'),
      pathLine('C:\\a\\sub\\b.txt'),
    );
    assert.strictEqual(duplicates(found, true, undefined, 'a.txt'), undefined);
    assert.strictEqual(duplicates([], false, undefined, 'a.txt'), undefined);
    assert.strictEqual(duplicates([], false, progress(), 'a.txt'), undefined);
  });

  test('says nothing under a side the first half second it reads flat, not even the path of the file selected, and then that it reads', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await inSide(
      paneElement,
      async ({ main }) => {
        assert.strictEqual(status(main), undefined);
        await waited(499);
        assert.strictEqual(status(main), undefined);
        await waited(1);
        assert.deepStrictEqual(status(main), readingLine);
      },
      'details',
      flatPane('C:\\a', progress({ reading: true }), 'sub\\b.txt'),
    );
  });

  test('says under a side that it reads once it has counted the sizes of folders for half a second, and nothing once it counts none', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await inSide(
      paneElement,
      async ({ main }) => {
        assert.strictEqual(status(main), undefined);
        await waited(500);
        assert.deepStrictEqual(status(main), readingLine);
      },
      'details',
      { ...pane(false, []), counting: 2 },
    );
    assert.strictEqual(
      status(sideOf({ ...pane(false, []), counting: 0 })),
      undefined,
    );
  });

  test('says under a side that it reads as soon as the main process tells it reads a folder or an archive there, as the main process waits the half second itself', () => {
    assert.deepStrictEqual(status(sideOf(pane(false, []), 1)), readingLine);
    assert.deepStrictEqual(
      status(sideOf(flatPane('C:\\a', progress(), 'a.txt'), 2)),
      readingLine,
    );
  });
});
