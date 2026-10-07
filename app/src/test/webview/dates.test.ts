import * as assert from 'node:assert';
import { formatDateTime } from '../../webview/dates';

suite('Dates', () => {
  test('read like 2022-12-14 16:12, in local time', () => {
    assert.strictEqual(
      formatDateTime(new Date(2022, 11, 14, 16, 12, 59).getTime()),
      '2022-12-14 16:12',
    );
    assert.strictEqual(
      formatDateTime(new Date(2026, 0, 2, 3, 4).getTime()),
      '2026-01-02 03:04',
    );
  });
});
