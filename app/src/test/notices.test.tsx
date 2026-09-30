import * as assert from 'node:assert';
import { renderToStaticMarkup } from 'react-dom/server';
import { addNotice, fading, Notices, type Notice } from '../webview/notices';
import { repositoryMenuItems } from '../webview/repositoryMenu';

const notice = (id: number, message = `notice ${id}`): Notice => ({
  id,
  level: 'error',
  message,
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
        notices={[notice(1), { id: 2, level: 'info', message: 'fyi' }]}
        onDismiss={() => {}}
      />,
    );
    assert.match(html, /class="notice error"[^>]*><span[^>]*>notice 1</);
    assert.match(html, /class="notice info"[^>]*><span[^>]*>fyi</);
  });

  test('lets information fade by itself, but keeps errors until dismissed', () => {
    assert.deepStrictEqual(
      fading([notice(1), { id: 2, level: 'info', message: 'fyi' }]),
      [2],
    );
  });

  test('shows nothing without notices', () => {
    assert.strictEqual(
      renderToStaticMarkup(<Notices notices={[]} onDismiss={() => {}} />),
      '',
    );
  });
});

suite('Repository menu', () => {
  test('lists the recent repositories by name, then Browse...', () => {
    const opened: string[] = [];
    let browsed = 0;
    const items = repositoryMenuItems(
      [{ root: '/code/app', name: 'app' }],
      (root) => opened.push(root),
      () => browsed++,
    );
    assert.deepStrictEqual(
      items.map((item) =>
        'separator' in item ? '-' : `${item.label} ${item.title ?? ''}`,
      ),
      ['app /code/app', '-', 'Browse... '],
    );
    for (const item of items) {
      if (!('separator' in item)) {
        item.onClick?.();
      }
    }
    assert.deepStrictEqual(opened, ['/code/app']);
    assert.strictEqual(browsed, 1);
  });
});
