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
import { plainSearch } from '../../../../../lib/shared/searchOptions';

const renderToStaticMarkup = (node: React.ReactNode) =>
  markupOf(withStores(node));

const paneDocument = (
  elevated: boolean,
  hidden: readonly boolean[] = [],
  filter?: string,
) =>
  new JSDOM(
    renderToStaticMarkup(
      <CommanderStore
        value={createCommanderStore(noop, {
          view: {
            ...emptyView,
            tab: '1',
            active: 'left',
            panes: { left: pane(elevated, hidden), right: undefined },
          },
          ...(filter !== undefined && {
            filters: new Map([
              [
                JSON.stringify(['1', 'left']),
                {
                  folder: 'C:\\Config.Msi',
                  query: filter,
                  options: plainSearch,
                },
              ],
            ]),
          }),
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
const pathLine = (elevated: boolean, hidden: readonly boolean[] = []) =>
  paneDocument(elevated, hidden).querySelector('.commander-path')?.innerHTML;
const pathOf = (elevated: boolean, hidden: readonly boolean[] = []) =>
  paneDocument(elevated, hidden).querySelector('.path-title')?.innerHTML;
const pathPlace = (document: Document) => ({
  inButtons: document.querySelector('.column-title .path-title') !== null,
  underButtons: document.querySelector(
    '.column-title + .commander-path.commander-line > .path-title',
  )?.textContent,
  aboveHeadings:
    document.querySelector('.commander-path + .commander-header') !== null,
});

suite('Commander pane', () => {
  test('puts the path of a side on a line of its own under its buttons and above the headings of its columns, while the side is filtered too', () => {
    const filtered = paneDocument(false, [], 'msi');
    assert.notStrictEqual(
      filtered.querySelector('.column-title.searching'),
      null,
    );
    assert.deepStrictEqual(
      [pathPlace(paneDocument(false)), pathPlace(filtered)],
      [
        {
          inButtons: false,
          underButtons: 'C:\\Config.Msi',
          aboveHeadings: true,
        },
        {
          inButtons: false,
          underButtons: 'C:\\Config.Msi',
          aboveHeadings: true,
        },
      ],
    );
  });

  test('marks a folder read as administrator where the icons of its rows are, before its path, and no other', () => {
    assert.match(
      pathLine(true) ?? '',
      new RegExp(
        `^<span class="commander-icon"><span class="elevated-mark" data-tip="${strings.commander.readAsAdministrator}">.*</span></span><span class="column-name path-title"><span class="path-text">`,
      ),
    );
    assert.match(
      pathLine(false) ?? '',
      /^<span class="commander-icon"><\/span><span class="column-name path-title"><span class="path-text">/,
    );
  });

  test('dims each hidden folder of its path, as its row is, and no other', () => {
    assert.strictEqual(
      pathOf(false, [false, true]),
      '<span class="path-text"><span class="path-folder"><span dir="ltr"><span class="path-part">C:\\</span></span></span><span class="path-end"><span class="path-name path-part hidden">Config.Msi</span></span></span>',
    );
    assert.strictEqual(
      pathOf(false),
      '<span class="path-text"><span class="path-folder"><span dir="ltr"><span class="path-part">C:\\</span></span></span><span class="path-end"><span class="path-name path-part">Config.Msi</span></span></span>',
    );
  });
});

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

const button = (document: Document) =>
  document.querySelector(`button[data-tip="${strings.commander.flatView}"]`);

suite('Commander pane in flat view', () => {
  test('ends the path of a flat side in ** past a separator, and presses the button of flat view, turning it while reading', () => {
    const reading = side('C:\\Downloads', progress({ reading: true }));
    const read = side('C:\\', progress());
    const plain = side('C:\\Downloads', undefined);

    assert.strictEqual(
      reading.querySelector('.path-title')?.textContent,
      'C:\\Downloads\\**',
    );
    assert.strictEqual(
      reading.querySelector('.path-flat')?.textContent,
      '\\**',
    );
    assert.strictEqual(read.querySelector('.path-flat')?.textContent, '**');
    assert.strictEqual(plain.querySelector('.path-flat'), null);
    assert.strictEqual(button(reading)?.getAttribute('aria-pressed'), 'true');
    assert.strictEqual(
      button(reading)?.className,
      'nav-button toggle active running',
    );
    assert.strictEqual(button(read)?.className, 'nav-button toggle active');
    assert.strictEqual(button(plain)?.getAttribute('aria-pressed'), 'false');
    assert.strictEqual(button(plain)?.className, 'nav-button toggle');
  });

  test('puts the button of flat view between the layout and the filter', () => {
    const document = side('C:\\Downloads', undefined);
    assert.deepStrictEqual(
      Array.from(
        document.querySelector('.column-actions')?.children ?? [],
        (child) => child.className,
      ),
      ['commander-layout', 'nav-button toggle', 'nav-button search-button'],
    );
  });
});
