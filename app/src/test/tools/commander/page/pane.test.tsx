import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { driveOf, Pane } from '../../../../tools/commander/page/pane';
import type { PaneView } from '../../../../tools/commander/page/view';
import { strings } from '../../../../shared/strings';
import { noop } from '../../../fixtures';
import { shareOf, sideToFocus } from '../../../../tools/commander/page/tool';
import { JSDOM } from 'jsdom';

const pane = (elevated: boolean, hidden: readonly boolean[]): PaneView => ({
  folder: 'C:\\Config.Msi',
  hidden,
  entries: [],
  parent: true,
  back: false,
  forward: false,
  elevated,
  sort: { column: 'extension', descending: false },
  rows: [],
  selected: undefined,
  marked: new Set(),
});
const header = (elevated: boolean, hidden: readonly boolean[] = []) =>
  /<span class="column-name path-title">(.*?)<\/span><div class="column-actions">/.exec(
    renderToStaticMarkup(
      <Pane
        tab="1"
        side="left"
        active
        pane={pane(elevated, hidden)}
        layout="details"
        thumbnailSize={144}
        fileColors={new Map()}
        onLayout={noop}
        onThumbnail={noop}
        columns={{ extension: 10, size: 15, date: 16 }}
        drives={[]}
        driveTrigger={null}
        onSelect={noop}
        onMark={noop}
        onCompare={noop}
        onOpen={noop}
        onSort={noop}
        onActivate={noop}
        onSwitchSide={noop}
        onDrive={noop}
        onDrivesOpening={noop}
        onStep={noop}
        onOpenOnSide={noop}
        onView={noop}
        onDelete={noop}
        onShellMenu={noop}
        onResize={noop}
        onResized={noop}
        onReset={noop}
        resizer={null}
      />,
    ),
  )?.[1];
suite('Commander pane', () => {
  test('shows the drive a folder is on, whatever the case of its letter', () => {
    const drives = ['C:\\', 'D:\\'];
    assert.strictEqual(driveOf('C:\\', drives), 'C:\\');
    assert.strictEqual(driveOf('d:\\backup\\2026', drives), 'D:\\');
    assert.strictEqual(driveOf('\\\\server\\share', drives), undefined);
    assert.strictEqual(driveOf('/home', []), undefined);
  });

  test('focuses the list of the side made active, unless the focus is in that side already, as in its drive menu', () => {
    const { document } = new JSDOM(
      '<section><button class="drive"></button><div data-column-focus tabindex="0"></div></section><button class="elsewhere"></button>',
    ).window;
    const column = document.querySelector('section') ?? undefined;
    const list = document.querySelector('[data-column-focus]');
    assert.strictEqual(
      sideToFocus(column, document.querySelector('.elsewhere')),
      list,
    );
    assert.strictEqual(sideToFocus(column, null), list);
    assert.strictEqual(
      sideToFocus(column, document.querySelector('.drive')),
      undefined,
    );
    assert.strictEqual(sideToFocus(undefined, null), undefined);
  });

  test('marks a folder read as administrator before its path, and no other', () => {
    assert.match(
      header(true) ?? '',
      new RegExp(
        `^<span class="elevated-mark" title="${strings.commander.readAsAdministrator}">.*<span class="path-folder">`,
      ),
    );
    assert.match(header(false) ?? '', /^<span class="path-folder">/);
  });

  test('dims each hidden folder of its path, as its row is, and no other', () => {
    assert.strictEqual(
      header(false, [false, true]),
      '<span class="path-folder"><span class="path-part">C:\\</span></span><span class="path-name hidden">Config.Msi</span>',
    );
    assert.strictEqual(
      header(false),
      '<span class="path-folder"><span class="path-part">C:\\</span></span><span class="path-name">Config.Msi</span>',
    );
  });

  test('splits the sides where the divider is dragged, leaving each some room, and evenly before it is laid out', () => {
    assert.strictEqual(shareOf(300, 1000), 0.3);
    assert.strictEqual(shareOf(10, 1000), 0.15);
    assert.strictEqual(shareOf(990, 1000), 0.85);
    assert.strictEqual(shareOf(10, 0), 0.5);
  });
});
