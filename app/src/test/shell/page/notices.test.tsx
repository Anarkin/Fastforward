import * as assert from 'node:assert';
import { isValidElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { suite, test } from 'vitest';
import { addNotice } from '../../../shell/shared/notices';
import {
  fading,
  Notices,
  shownFor,
  type Notice,
} from '../../../shell/page/notices';
import { noop, renderedBy } from '../../fixtures';
import { createShellStore } from '../../../shell/page/store';
import { withStores } from '../../componentFixtures';

const withNotices = (notices: readonly Notice[]) =>
  withStores(<Notices />, { shell: createShellStore(noop, { notices }) });

const notice = (id: number, message = `notice ${id}`): Notice => ({
  id,
  level: 'error',
  message,
  shownAt: 0,
});

const info = (id: number, shownAt: number): Notice => ({
  ...notice(id),
  level: 'info',
  shownAt,
});

const shownOfLength = (level: Notice['level'], length: number) =>
  shownFor({ ...notice(1, 'x'.repeat(length)), level });

suite('Notices', () => {
  test('keeps the 4 newest, newest last, dropping the oldest, also while the page loads again', () => {
    let shown: readonly Notice[] = [];
    for (let id = 1; id <= 5; id++) {
      shown = addNotice(shown, notice(id));
    }
    assert.deepStrictEqual(
      shown.map((shownNotice) => shownNotice.id),
      [2, 3, 4, 5],
    );
  });

  test('shows a repeated message once, as the newest', () => {
    const shown = addNotice(
      addNotice(addNotice([], notice(1, 'same')), notice(2)),
      notice(3, 'same'),
    );
    assert.deepStrictEqual(
      shown.map((shownNotice) => shownNotice.id),
      [2, 3],
    );
  });

  test('shows the newest notice last, nearest the corner it stacks in', () => {
    const html = renderToStaticMarkup(withNotices([notice(1), notice(2)]));
    assert.ok(html.indexOf('notice 1') < html.indexOf('notice 2'));
  });

  test('marks errors apart from information by an icon of an error', () => {
    const html = renderToStaticMarkup(
      withNotices([notice(1), { ...notice(2, 'fyi'), level: 'info' }]),
    );
    assert.match(
      html,
      /class="notice error"[^>]*><svg class="icon error-icon"[^]*?<\/svg><span[^>]*>notice 1</,
    );
    assert.match(html, /class="notice info"[^>]*><span[^>]*>fyi</);
  });

  test('dismisses a notice by its close button, which takes no focus, as it goes and would leave the keys with nothing', () => {
    const shell = createShellStore(noop, {
      notices: [notice(1), notice(2)],
    });
    const drawn = renderedBy(Notices, {}, { shell });
    assert.ok(isValidElement<{ children: React.ReactElement[] }>(drawn));
    const older = drawn.props.children[0];
    assert.ok(isValidElement<{ children: React.ReactElement[] }>(older));
    const close = older.props.children[2];
    assert.ok(
      isValidElement<{
        onClick: () => void;
        onMouseDown: (event: { preventDefault: () => void }) => void;
      }>(close),
    );
    let prevented = 0;
    close.props.onMouseDown({ preventDefault: () => prevented++ });
    assert.strictEqual(prevented, 1);
    close.props.onClick();
    assert.deepStrictEqual(
      shell.getState().notices.map((left) => left.id),
      [2],
    );
  });

  test('shows information for 6 seconds and 40 milliseconds more for each character, up to 15 seconds, and an error three times as long, 20 to 45 seconds, as long as a message takes to read', () => {
    assert.deepStrictEqual(
      [0, 50, 225, 1000].map((length) => shownOfLength('info', length)),
      [6000, 8000, 15000, 15000],
    );
    assert.deepStrictEqual(
      [0, 50, 150, 1000].map((length) => shownOfLength('error', length)),
      [20000, 24000, 36000, 45000],
    );
  });

  test('fades every notice, errors too, its own time after it came, whatever came since', () => {
    const short = info(2, 6000);
    assert.deepStrictEqual(fading([info(1, 1000), short, notice(3)], 7000), [
      { id: 1, after: shownFor(info(1, 0)) - 6000 },
      { id: 2, after: shownFor(short) - 1000 },
      { id: 3, after: shownFor(notice(3)) - 7000 },
    ]);
    assert.deepStrictEqual(fading([info(1, 0)], 60_000), [{ id: 1, after: 0 }]);
  });

  test('holds a notice the pointer is over, giving it its whole time again once the pointer leaves it', () => {
    const shell = createShellStore(noop, { notices: [info(1, 0)] });
    const drawn = renderedBy(Notices, {}, { shell });
    assert.ok(isValidElement<{ children: React.ReactElement[] }>(drawn));
    const [shown] = drawn.props.children;
    assert.ok(
      isValidElement<{ onMouseEnter: () => void; onMouseLeave: () => void }>(
        shown,
      ),
    );
    const before = performance.now();
    shown.props.onMouseEnter();
    shown.props.onMouseLeave();
    const [restarted] = shell.getState().notices;
    assert.ok(restarted !== undefined && restarted.shownAt >= before);
  });

  test('keeps its live region, empty, while it shows no notice, as a screen reader announces nothing a region comes with', () => {
    assert.strictEqual(
      renderToStaticMarkup(withNotices([])),
      '<div class="notices" role="status"></div>',
    );
  });
});
