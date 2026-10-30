import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { formatDate, formatDateTime } from '../../ui/dates';

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

  test('follow a pattern of the year, month, day, hours, minutes and seconds, keeping any other text', () => {
    const time = new Date(2026, 0, 2, 3, 4, 5).getTime();
    assert.strictEqual(
      formatDate(time, 'YYYY-MM-DD HH:mm'),
      '2026-01-02 03:04',
    );
    assert.strictEqual(
      formatDate(time, 'DD.MM.YYYY HH:mm:ss'),
      '02.01.2026 03:04:05',
    );
    assert.strictEqual(formatDate(time, 'MM/DD at HH h'), '01/02 at 03 h');
  });
});
