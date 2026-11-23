import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  joinedPath,
  knownWith,
  newlyKnown,
  PathLooksContext,
  shownParts,
  type KnownLooks,
  type PathLooksSource,
} from '../../../../lib/page/pathLooks';
import { CutPathName, PathName } from '../../../../lib/page/pathName';
import { fileColorsOf } from '../../../../lib/page/fileColors';
import { searchFilter } from '../../../../lib/shared/filter';
import { plainSearch } from '../../../../lib/shared/searchOptions';
import { mounted } from '../../../helpers/mounted';

const colors = fileColorsOf([
  { extensions: ['log'], colors: { light: 'blue', dark: 'blue' } },
  { extensions: ['zip', 'app'], colors: { light: 'teal', dark: 'teal' } },
  { extensions: 'executables', colors: { light: 'red', dark: 'red' } },
]);

const folder = { hidden: false, file: false, executable: false };
const hiddenFolder = { hidden: true, file: false, executable: false };
const file = { hidden: false, file: true, executable: false };

const looked = (
  path: string,
  isFile: boolean,
  looks?: Parameters<typeof shownParts>[2],
) =>
  shownParts(path, isFile, looks, colors).map(
    ({ name, className, style }) =>
      `${name}:${className}${style === undefined ? '' : `:${style['--file-color']}`}`,
  );

function source(
  known: KnownLooks,
  asked: string[] = [],
  told: string[] = [],
): PathLooksSource {
  return {
    subscribe: () => () => {},
    fileColors: () => colors,
    known: () => known,
    ask: (path) => asked.push(path),
    know: (path) => told.push(path),
    dotHides: () => false,
  };
}

suite('The parts of a path, as the commander lists them', () => {
  test('colors each part as its own row in the commander, a file by its kind and no folder, and dims the hidden ones', () => {
    assert.deepStrictEqual(
      looked('C:\\Temp\\HmxLib.log', true, [folder, hiddenFolder, file]),
      [
        'C:\\:path-part',
        'Temp:path-part hidden',
        'HmxLib.log:path-part colored:light-dark(blue, blue)',
      ],
    );
  });

  test('colors an archive the path goes into as its file, a macOS app as its folder, and a program by its exec bit', () => {
    assert.deepStrictEqual(
      looked('/Users/me/a.zip/docs', false, [
        folder,
        folder,
        folder,
        file,
        null,
      ]),
      [
        '/:path-part',
        'Users:path-part',
        'me:path-part',
        'a.zip:path-part colored:light-dark(teal, teal)',
        'docs:path-part',
      ],
    );
    assert.deepStrictEqual(
      looked('/Applications/Mail.app', false, [folder, folder, folder]),
      [
        '/:path-part',
        'Applications:path-part',
        'Mail.app:path-part colored:light-dark(teal, teal)',
      ],
    );
    assert.deepStrictEqual(
      looked('/bin/tool', true, [
        folder,
        folder,
        { hidden: false, file: true, executable: true },
      ]),
      [
        '/:path-part',
        'bin:path-part',
        'tool:path-part colored:light-dark(red, red)',
      ],
    );
  });

  test('takes a part nothing is known of by its name, the last a file when the path names one', () => {
    assert.deepStrictEqual(looked('C:\\Temp\\HmxLib.log', true), [
      'C:\\:path-part',
      'Temp:path-part',
      'HmxLib.log:path-part colored:light-dark(blue, blue)',
    ]);
    assert.deepStrictEqual(looked('C:\\Temp\\logs.log', false), [
      'C:\\:path-part',
      'Temp:path-part',
      'logs.log:path-part',
    ]);
  });

  test('keeps what is known of each part, so the folders of the next path are known at once, and tells when a header knows more', () => {
    const known = knownWith(new Map(), [
      { path: 'C:\\Temp\\a.log', parts: [folder, hiddenFolder, file] },
    ]);
    assert.deepStrictEqual(
      looked(
        'C:\\Temp\\b.log',
        true,
        ['C:\\', 'C:\\Temp', 'C:\\Temp\\b.log'].map((part) => known.get(part)),
      ),
      [
        'C:\\:path-part',
        'Temp:path-part hidden',
        'b.log:path-part colored:light-dark(blue, blue)',
      ],
    );
    assert.strictEqual(
      newlyKnown(known, 'C:\\Temp', [folder, hiddenFolder]),
      false,
    );
    assert.strictEqual(newlyKnown(known, 'C:\\Temp', [folder, folder]), true);
    assert.strictEqual(newlyKnown(known, 'C:\\Other', [folder, folder]), true);
  });

  test('joins a path in a repository to its folder, with the separator the folder uses', () => {
    assert.strictEqual(
      joinedPath('C:\\repo', 'src/a.ts'),
      'C:\\repo\\src/a.ts',
    );
    assert.strictEqual(
      joinedPath('/home/me/repo', 'src/a.ts'),
      '/home/me/repo/src/a.ts',
    );
    assert.strictEqual(joinedPath('C:\\', 'a.ts'), 'C:\\a.ts');
    assert.strictEqual(joinedPath(undefined, 'a.ts'), 'a.ts');
  });

  test('draws each part with its separator, marks what a filter found across them, and asks for the looks it does not know', () => {
    const asked: string[] = [];
    assert.strictEqual(
      renderToStaticMarkup(
        <PathLooksContext value={source(new Map(), asked)}>
          <PathName
            path={'C:\\Temp\\HmxLib.log'}
            file
            filter={searchFilter('temp\\hmx', plainSearch)}
          />
        </PathLooksContext>,
      ),
      '<span class="path-piece"><span class="path-part">C:\\</span></span><span class="path-piece"><span class="path-part"><mark class="match">Temp</mark></span><mark class="match">\\</mark></span><span class="path-piece"><span class="path-part colored" style="--file-color:light-dark(blue, blue)"><mark class="match">Hmx</mark>Lib.log</span></span>',
    );
  });

  test('draws a path in a repository by the looks of the file in its worktree, showing only the part in the repository', () => {
    const known = knownWith(new Map(), [
      {
        path: 'C:\\repo\\.config\\a.log',
        parts: [folder, folder, hiddenFolder, file],
      },
    ]);
    assert.strictEqual(
      renderToStaticMarkup(
        <PathLooksContext value={source(known)}>
          <PathName path=".config/a.log" file root={'C:\\repo'} />
        </PathLooksContext>,
      ),
      '<span class="path-piece"><span class="path-part hidden">.config</span>/</span><span class="path-piece"><span class="path-part colored" style="--file-color:light-dark(blue, blue)">a.log</span></span>',
    );
  });

  test('draws a path cut short in a box of the color of its last part, so the ellipsis that ends it is in the color of the name it cuts, the parts keeping their own', () => {
    assert.strictEqual(
      renderToStaticMarkup(
        <PathLooksContext value={source(new Map())}>
          <CutPathName className="path" path="src/a.log" file root="/repo" />
          <CutPathName className="path" path="src" root="/repo" />
        </PathLooksContext>,
      ),
      '<span class="path path-cut colored" style="--file-color:light-dark(blue, blue)"><span class="path-piece"><span class="path-part">src</span>/</span><span class="path-piece"><span class="path-part colored" style="--file-color:light-dark(blue, blue)">a.log</span></span></span><span class="path path-cut"><span class="path-piece"><span class="path-part">src</span></span></span>',
    );
  });

  test('tells the looks it was given of the folders of a whole path, so other paths in them show them at once, but nothing of a name without its folder, which no other path could find', async () => {
    const told: string[] = [];
    await mounted(
      <PathLooksContext value={source(new Map(), [], told)}>
        <PathName
          path={'C:\\Temp\\docs'}
          looks={[folder, hiddenFolder, folder]}
        />
        <PathName path="docs" looks={[folder]} />
      </PathLooksContext>,
      () => {},
    );
    assert.deepStrictEqual(told, ['C:\\Temp\\docs']);
  });
});
