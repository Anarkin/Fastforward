import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { renderToStaticMarkup as markupOf } from 'react-dom/server';
import type { FlatProgress } from '../../../../../tools/commander/shared/protocol';
import { emptyView } from '../../../../../tools/commander/page/view';
import {
  CommanderStore,
  createCommanderStore,
} from '../../../../../tools/commander/page/store';
import { strings } from '../../../../../lib/shared/strings';
import { noop } from '../../../../helpers/fixtures';
import { JSDOM } from 'jsdom';
import { withStores } from '../../../../helpers/componentFixtures';
import { Pane } from '../../../../../tools/commander/page/pane';
import { flatPane, pane, progress } from './paneFixtures';

const renderToStaticMarkup = (node: React.ReactNode) =>
  markupOf(withStores(node));

const side = (
  folder: string,
  flat: FlatProgress | undefined,
  selected?: string,
) => {
  const view = flatPane(folder, flat, selected);
  return new JSDOM(
    renderToStaticMarkup(
      <CommanderStore
        value={createCommanderStore(noop, {
          view: {
            ...emptyView,
            tab: '1',
            active: 'left',
            panes: { left: view, right: undefined },
          },
        })}
      >
        <Pane
          side="left"
          driveTrigger={null}
          bookmarkTrigger={null}
          resizer={null}
        />
      </CommanderStore>,
    ),
  ).window.document;
};

const status = (document: Document) => ({
  text: document.querySelector('.column-status-text')?.textContent,
  end: document.querySelector('.column-status-end')?.textContent,
  tone: document.querySelector('.column-status')?.className,
  role: document.querySelector('.column-status-text')?.getAttribute('role'),
});

const end = (selected: string) =>
  side('C:\\a', progress(), selected).querySelector('.column-status-end')
    ?.textContent;

suite('Commander pane in flat view', () => {
  test('says under a flat side how many files it read in how many folders, that Esc stops it while reading, and what could not be read', () => {
    assert.deepStrictEqual(
      status(side('C:\\a', progress({ reading: true, folders: 1 }))),
      {
        text: `${strings.commander.flatReading(2, 1)} · ${strings.commander.escapeStops}`,
        end: undefined,
        tone: 'column-status',
        role: 'status',
      },
    );
    assert.deepStrictEqual(status(side('C:\\a', progress({ failed: 3 }))), {
      text: `${strings.commander.flatRead(2, 2)} · ${strings.commander.flatFailed(3)}`,
      end: undefined,
      tone: 'column-status',
      role: 'status',
    });
    assert.deepStrictEqual(status(side('C:\\a', progress({ stopped: true }))), {
      text: strings.commander.flatStopped(2, 2),
      end: undefined,
      tone: 'column-status warning',
      role: 'status',
    });
    assert.strictEqual(
      side('C:\\a', undefined).querySelector('.column-status'),
      null,
    );
  });

  test('ends the line under a flat side with the folder the selected file is in, and nothing for a file in the folder of the side', () => {
    assert.strictEqual(end('sub\\b.txt'), 'sub');
    assert.strictEqual(end('a.txt'), undefined);
    assert.strictEqual(end('..'), undefined);
  });
});

const counting = (folders: number) =>
  new JSDOM(
    renderToStaticMarkup(
      <CommanderStore
        value={createCommanderStore(noop, {
          view: {
            ...emptyView,
            tab: '1',
            active: 'left',
            panes: {
              left: { ...pane(false, []), counting: folders },
              right: undefined,
            },
          },
        })}
      >
        <Pane
          side="left"
          driveTrigger={null}
          bookmarkTrigger={null}
          resizer={null}
        />
      </CommanderStore>,
    ),
  ).window.document;

suite('Commander pane counting the sizes of folders', () => {
  test('says under a side how many folders it counts the sizes of, and that Esc stops it, and nothing once it counts none', () => {
    assert.deepStrictEqual(status(counting(2)), {
      text: `${strings.commander.countingSizes(2)} · ${strings.commander.escapeStops}`,
      end: undefined,
      tone: 'column-status',
      role: 'status',
    });
    assert.strictEqual(counting(0).querySelector('.column-status'), null);
  });
});
