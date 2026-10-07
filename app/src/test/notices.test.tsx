import * as assert from 'node:assert';
import { isValidElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { addNotice, fading, Notices, type Notice } from '../webview/notices';
import { renderedBy } from './fixtures';

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

suite('Notices', () => {
  test('keeps the four newest, newest last', () => {
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

  test('marks errors apart from information', () => {
    const html = renderToStaticMarkup(
      <Notices
        notices={[notice(1), { ...notice(2, 'fyi'), level: 'info' }]}
        onDismiss={() => {}}
      />,
    );
    assert.match(html, /class="notice error"[^>]*><span[^>]*>notice 1</);
    assert.match(html, /class="notice info"[^>]*><span[^>]*>fyi</);
  });

  test('dismisses a notice by its close button', () => {
    const dismissed: number[] = [];
    const shown = renderedBy(Notices, {
      notices: [notice(1), notice(2)],
      onDismiss: (id) => dismissed.push(id),
    });
    assert.ok(isValidElement<{ children: React.ReactElement[] }>(shown));
    const second = shown.props.children[1];
    assert.ok(isValidElement<{ children: React.ReactElement[] }>(second));
    const close = second.props.children[1];
    assert.ok(isValidElement<{ onClick: () => void }>(close));
    close.props.onClick();
    assert.deepStrictEqual(dismissed, [2]);
  });

  test('lets information fade by itself, but keeps errors until dismissed', () => {
    assert.deepStrictEqual(
      fading([notice(1), { ...notice(2), level: 'info' }], 0).map(
        ({ id }) => id,
      ),
      [2],
    );
  });

  test('fades information eight seconds after it came, whatever came since', () => {
    assert.deepStrictEqual(fading([info(1, 1000), info(2, 6000)], 7000), [
      { id: 1, after: 2000 },
      { id: 2, after: 7000 },
    ]);
    assert.deepStrictEqual(fading([info(1, 0)], 9000), [{ id: 1, after: 0 }]);
  });

  test('shows nothing without notices', () => {
    assert.strictEqual(
      renderToStaticMarkup(<Notices notices={[]} onDismiss={() => {}} />),
      '',
    );
  });
});
