import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { dropTargetOf } from '../../../../tools/commander/page/dropping';

suite('Commander dropping', () => {
  test('names the folder files dropped go into: that of the side, the folder dropped on in it, or its parent', () => {
    assert.strictEqual(
      dropTargetOf('C:\\work', undefined, 'win32'),
      'C:\\work',
    );
    assert.strictEqual(
      dropTargetOf('C:\\work', 'docs', 'win32'),
      'C:\\work\\docs',
    );
    assert.strictEqual(dropTargetOf('C:\\', 'docs', 'win32'), 'C:\\docs');
    assert.strictEqual(dropTargetOf('C:\\work\\a', '..', 'win32'), 'C:\\work');
    assert.strictEqual(dropTargetOf('C:\\work', '..', 'win32'), 'C:\\');
    assert.strictEqual(
      dropTargetOf('/home/me', 'docs', 'linux'),
      '/home/me/docs',
    );
    assert.strictEqual(dropTargetOf('/', 'home', 'darwin'), '/home');
    assert.strictEqual(dropTargetOf('/home/me', '..', 'linux'), '/home');
  });
});
