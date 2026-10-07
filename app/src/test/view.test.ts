import * as assert from 'node:assert';
import * as os from 'node:os';
import * as path from 'node:path';
import { tabName } from '../view';

suite('View', () => {
  const folder = os.tmpdir();

  test('names a tab after its folder, or after the whole root of a repository at the top of a drive', () => {
    assert.strictEqual(tabName(path.join(folder, 'main')), 'main');
    const top = path.parse(folder).root;
    assert.strictEqual(tabName(top), top);
  });

  test('names a bare repository after its folder without .git, or after the folder holding it', () => {
    assert.strictEqual(tabName(path.join(folder, 'app.git')), 'app');
    assert.strictEqual(tabName(path.join(folder, 'app', '.bare')), 'app');
    assert.strictEqual(tabName(path.join(folder, 'app', '.git')), 'app');
  });
});
