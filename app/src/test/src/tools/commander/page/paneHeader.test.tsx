import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { renderToStaticMarkup as markupOf } from 'react-dom/server';
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
import { pane } from './paneFixtures';

const renderToStaticMarkup = (node: React.ReactNode) =>
  markupOf(withStores(node));

const bookmarkStar = (bookmarks: readonly string[], platform: string) =>
  new JSDOM(
    renderToStaticMarkup(
      <CommanderStore
        value={createCommanderStore(noop, {
          view: {
            ...emptyView,
            tab: '1',
            active: 'left',
            platform,
            bookmarks,
            panes: { left: pane(false, []), right: undefined },
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
  ).window.document
    .querySelector(
      `button[aria-label="${strings.commander.bookmarks}"] .bookmark-icon`,
    )
    ?.getAttribute('class');

suite('Commander pane', () => {
  test('fills the star of the bookmarks of a side once its folder is bookmarked, whatever the case of its letters on Windows, and outlines it otherwise', () => {
    assert.strictEqual(
      bookmarkStar(['C:\\config.msi'], 'win32'),
      'icon bookmark-icon filled',
    );
    assert.strictEqual(
      bookmarkStar(['C:\\config.msi'], 'linux'),
      'icon bookmark-icon',
    );
    assert.strictEqual(bookmarkStar([], 'win32'), 'icon bookmark-icon');
  });
});
