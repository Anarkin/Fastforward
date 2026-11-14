import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { addNotice } from '../../../../shell/shared/notices';
import type { Notice } from '../../../../shell/page/noticeFading';

const notice = (id: number, message = `notice ${id}`): Notice => ({
  id,
  level: 'error',
  message,
  shownAt: 0,
});

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

  test('shows a repeated message once, as the newest, whether its names are the same parts or a new copy of them', () => {
    const pushed = (id: number): Notice => ({
      ...notice(id),
      message: ['Pushed ', { name: 'main' }],
    });
    const shown = addNotice(
      addNotice(addNotice([], pushed(1)), notice(2)),
      pushed(3),
    );
    assert.deepStrictEqual(
      shown.map((shownNotice) => shownNotice.id),
      [2, 3],
    );
  });
});
