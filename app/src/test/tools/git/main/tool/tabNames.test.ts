import * as assert from 'node:assert';
import * as os from 'node:os';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import { strings } from '../../../../../shared/strings';
import { tabInfos, tabName } from '../../../../../tools/git/main/tool';

function foldersOf(roots: string[], paths = path.posix) {
  return tabInfos(roots, paths).map((tab) => tab.folder);
}

suite('Git tool naming tabs', () => {
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

  test('tells tabs named the same apart by the nearest folder above them that differs, leaving the others be', () => {
    assert.deepStrictEqual(
      foldersOf(['/code/site', '/code/x/site', '/code/app']),
      ['code', 'x', undefined],
    );
    assert.deepStrictEqual(
      foldersOf(['/work/a/shop/app', '/work/b/shop/app']),
      ['a', 'b'],
    );
  });

  test('names every folder that tells a tab apart from the others named the same, marking those it skips', () => {
    assert.deepStrictEqual(foldersOf(['/a/x/app', '/b/x/app', '/a/y/app']), [
      'a/x',
      'b/x',
      'y',
    ]);
    assert.deepStrictEqual(
      foldersOf(['/a/s/x/app', '/b/s/x/app', '/a/s/y/app']),
      ['a/…/x', 'b/…/x', 'y'],
    );
  });

  test('tells repositories apart from the folder holding them, whether bare or not', () => {
    assert.deepStrictEqual(
      foldersOf(['/a/app/.git', '/b/app.git', '/c/app/.bare']),
      ['a', 'b', 'c'],
    );
  });

  test('ignores case on Windows, and names the drive when nothing else differs', () => {
    assert.deepStrictEqual(
      foldersOf(['C:\\One\\Code\\App', 'c:\\Two\\code\\app'], path.win32),
      ['One', 'Two'],
    );
    assert.deepStrictEqual(
      foldersOf(['C:\\Code\\app', 'D:\\Code\\app'], path.win32),
      ['C:\\', 'D:\\'],
    );
    assert.deepStrictEqual(
      foldersOf(['C:\\x\\app', 'D:\\x\\app', 'C:\\y\\app'], path.win32),
      ['C:\\x', 'D:\\x', 'y'],
    );
  });

  test('labels a tab with the folder that tells it apart', () => {
    assert.strictEqual(strings.tabs.label('app', 'x'), 'app (x)');
    assert.strictEqual(strings.tabs.label('app'), 'app');
  });
});
