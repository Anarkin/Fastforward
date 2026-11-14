import * as assert from 'node:assert';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { beforeAll, suite, test } from 'vitest';
import { imageType, maxImageSize } from '../lib/shared/images';
import { maxMatches } from '../lib/shared/textMatches';
import { rowBytes } from '../tools/commander/main/textRows';
import { decodedText } from '../tools/commander/main/textCodec';
import {
  encodingMenu,
  type EncodingChoice,
} from '../tools/commander/page/encodings';
import { fileColorOf, fileColorsOf } from '../tools/commander/page/fileColors';
import { previewOf } from '../tools/commander/page/previews';
import {
  maxColoredBytes,
  maxPreviewBytes,
  wholeLineBytes,
} from '../tools/commander/shared/protocol';
import { languageIds, languageOf } from '../lib/page/languages';
import { defaultSettings } from './fixtures';

type Platform = 'win32' | 'darwin' | 'linux';

type Content = string | Buffer;

interface Item {
  readonly kind: string;
  readonly path: string;
  readonly content?: () => Content;
  readonly chunks?: () => Iterable<Content>;
  readonly size?: number;
  readonly mode?: number;
  readonly hidden?: true;
  readonly system?: true;
  readonly unreadable?: true;
  readonly target?: string;
}

interface Plan {
  readonly items: readonly Item[];
  readonly pairs: readonly (readonly [string, string])[];
  readonly encodings: readonly {
    readonly path: string;
    readonly encoding: string;
    readonly text: string;
  }[];
}

interface FilesPlan {
  readonly plan: (options: {
    readonly platform: Platform;
    readonly large?: boolean;
  }) => Plan;
  readonly limits: Readonly<Record<string, number>>;
}

const platforms: readonly Platform[] = ['win32', 'darwin', 'linux'];

let filesPlan: FilesPlan;
const plans = new Map<string, Plan>();

const planFor = (platform: Platform, large = false): Plan => {
  const key = `${platform} ${large}`;
  const known = plans.get(key);
  if (known !== undefined) {
    return known;
  }
  const made = filesPlan.plan({ platform, large });
  plans.set(key, made);
  return made;
};

const itemAt = (made: Plan, where: string): Item => {
  const found = made.items.find((item) => item.path === where);
  assert.ok(found !== undefined, where);
  return found;
};

const contentOf = (item: Item): Buffer => {
  assert.ok(item.content !== undefined, item.path);
  return Buffer.from(item.content());
};

const sizeOf = (item: Item): number => item.size ?? contentOf(item).length;

const longestLine = (item: Item) =>
  Math.max(
    ...contentOf(item)
      .toString('latin1')
      .split('\n')
      .map((line) => line.length),
  );

const childrenOf = (made: Plan, folder: string) =>
  made.items.filter(
    (item) =>
      path.posix.dirname(item.path) === folder &&
      (item.kind === 'file' || item.kind === 'folder'),
  );

const countUnder = (made: Plan, folder: string) =>
  made.items.filter((item) => item.path.startsWith(`${folder}/`)).length;

const planHas = (platform: Platform, check: (item: Item) => boolean) =>
  planFor(platform).items.some(check);

const madeOnlyOnWindows = (item: Item) =>
  item.hidden === true || item.system === true || item.kind === 'junction';

const refusedByWindows = (item: Item) => item.path === 'names/a:colon.txt';

const differingInCase = (item: Item) => item.path === 'names/Readme.md';

const sortedColors = (colors: Iterable<string | undefined>) =>
  [...colors].toSorted((a, b) => String(a).localeCompare(String(b)));

suite('Playground of files', () => {
  beforeAll(async () => {
    const loaded: FilesPlan = await import(
      pathToFileURL(
        path.join(
          __dirname,
          '..',
          '..',
          'scripts',
          'playground',
          'filesPlan.mts',
        ),
      ).href
    );
    filesPlan = loaded;
  });

  test('holds a file of every extension of every default color group, a program by its exec bit outside Windows, and files no group colors, so that every group shows', () => {
    const groups = defaultSettings().tools.commander.fileColors;
    const executables = groups.findIndex(
      ({ extensions }) => extensions === 'executables',
    );
    const numbered = fileColorsOf(
      groups.map(({ extensions }, i) => ({
        extensions,
        colors: { light: `#${i}`, dark: `#${i}` },
      })),
    );
    for (const platform of platforms) {
      const made = planFor(platform);
      for (const { extensions } of groups) {
        for (const extension of Array.isArray(extensions) ? extensions : []) {
          itemAt(made, `colors/sample.${extension}`);
        }
      }
      const shown = new Set(
        childrenOf(made, 'colors').map((item) => {
          const executable =
            platform !== 'win32' && ((item.mode ?? 0) & 0o111) !== 0;
          return fileColorOf(
            {
              name: path.posix.basename(item.path),
              folder: item.kind === 'folder',
              link: false,
              hidden: false,
              size: 0,
              modified: 0,
              ...(executable && { executable: true }),
            },
            numbered,
          );
        }),
      );
      assert.deepStrictEqual(
        sortedColors(shown),
        sortedColors([
          ...groups
            .map((_, i) => `light-dark(#${i}, #${i})`)
            .filter((_, i) => platform !== 'win32' || i !== executables),
          undefined,
        ]),
        platform,
      );
    }
  });

  test('previews an image of every type the viewer previews, Markdown of every extension the viewer reads as Markdown, PDFs and an image too large to preview', () => {
    const made = planFor('linux');
    const extensions = new Set(
      defaultSettings().tools.commander.fileColors.flatMap((group) =>
        Array.isArray(group.extensions) ? group.extensions : [],
      ),
    );
    const imageExtensions = [...extensions].filter(
      (extension) => imageType(`file.${extension}`) !== undefined,
    );
    assert.ok(imageExtensions.length >= 9, imageExtensions.join());
    for (const extension of imageExtensions) {
      assert.strictEqual(
        previewOf(itemAt(made, `images/sample.${extension}`).path),
        'image',
      );
    }
    const markdown = [...languageIds]
      .filter(([, id]) => id === 'markdown')
      .map(([name]) => name);
    for (const name of markdown) {
      assert.ok(
        made.items.some(
          (item) =>
            item.path.startsWith('markdown/') && item.path.endsWith(`.${name}`),
        ),
        name,
      );
    }
    assert.ok(
      childrenOf(made, 'pdf').filter((item) => previewOf(item.path) === 'pdf')
        .length >= 4,
    );
  });

  test('writes a text in every encoding the viewer offers, in a script it is for, which reads back as written', () => {
    const offered: EncodingChoice[] = [];
    for (const item of encodingMenu('auto', 'utf-8', (choice) =>
      offered.push(choice),
    )) {
      if ('onClick' in item) {
        item.onClick?.();
      }
    }
    const made = planFor('win32');
    const encodings = offered.filter(
      (choice) => choice !== 'auto' && choice !== 'bytes',
    );
    assert.ok(encodings.length > 30, encodings.join());
    for (const encoding of encodings) {
      assert.ok(
        made.encodings.some((sample) => sample.encoding === encoding),
        encoding,
      );
    }
    for (const { path: where, encoding, text } of made.encodings) {
      assert.strictEqual(
        new TextDecoder(encoding)
          .decode(contentOf(itemAt(made, where)))
          .normalize('NFC'),
        text.normalize('NFC'),
        where,
      );
      assert.ok(/\P{ASCII}/u.test(text.slice(encoding.length)), where);
    }
  });

  test('holds files of every line ending, mixed ones and ones without any, and folders where the .editorconfig, the attributes or the config of git, or the settings give the new lines of a file with no line break their ending, and one trimming as it saves', () => {
    const made = planFor('win32');
    const endingsOf = (where: string) =>
      decodedText(contentOf(itemAt(made, where)), 'utf-8').endings;
    const none = { lf: 0, crlf: 0, cr: 0 };
    assert.deepStrictEqual(endingsOf('line-endings/lf.txt'), {
      ...none,
      lf: 3,
    });
    assert.deepStrictEqual(endingsOf('line-endings/crlf.txt'), {
      ...none,
      crlf: 3,
    });
    assert.deepStrictEqual(endingsOf('line-endings/cr.txt'), {
      ...none,
      cr: 3,
    });
    assert.deepStrictEqual(endingsOf('line-endings/mixed-mostly-lf.txt'), {
      lf: 3,
      crlf: 1,
      cr: 1,
    });
    assert.deepStrictEqual(endingsOf('line-endings/mixed-mostly-crlf.txt'), {
      lf: 1,
      crlf: 3,
      cr: 0,
    });
    assert.deepStrictEqual(endingsOf('line-endings/mixed-tie.txt'), {
      lf: 2,
      crlf: 2,
      cr: 0,
    });
    assert.strictEqual(
      decodedText(
        contentOf(itemAt(made, 'line-endings/mixed-tie.txt')),
        'utf-8',
      ).ending,
      'crlf',
    );
    assert.deepStrictEqual(endingsOf('line-endings/no-final-newline.txt'), {
      ...none,
      lf: 2,
    });
    for (const where of [
      'line-endings/no-line-break.txt',
      'line-endings/empty.txt',
      'line-endings/from-editorconfig/one-line.txt',
      'line-endings/from-git-attributes/one-line.txt',
      'line-endings/from-git-config/one-line.txt',
      'line-endings/from-settings/run.cmd',
      'line-endings/from-settings/one-line.html',
    ]) {
      assert.deepStrictEqual(endingsOf(where), none, where);
    }
    const textOf = (where: string) => contentOf(itemAt(made, where)).toString();
    assert.match(
      textOf('line-endings/from-editorconfig/.editorconfig'),
      /end_of_line = crlf/,
    );
    assert.match(
      textOf('line-endings/from-git-attributes/.gitattributes'),
      /eol=crlf/,
    );
    assert.deepStrictEqual(
      made.items.filter(
        (item) =>
          item.kind === 'repository' && item.path.startsWith('line-endings/'),
      ),
      [
        { kind: 'repository', path: 'line-endings/from-git-attributes' },
        {
          kind: 'repository',
          path: 'line-endings/from-git-config',
          config: { 'core.autocrlf': 'true' },
        },
      ],
    );
    assert.ok(
      defaultSettings().editor.files.some(
        ({ extensions, endOfLine }) =>
          extensions.includes('cmd') && endOfLine === 'crlf',
      ),
    );
    assert.match(
      textOf('line-endings/trim-on-save/.editorconfig'),
      /trim_trailing_whitespace = true[\s\S]*insert_final_newline = true/,
    );
    assert.match(
      textOf('line-endings/trim-on-save/trailing-spaces.txt'),
      / +\n/,
    );
  });

  test('crosses every limit of the viewer, knowing each as the app does: the size it colors, the length of a line it shows whole, the rows it breaks longer ones into, the size of Markdown it previews and of an image, and the matches it counts', () => {
    assert.deepStrictEqual(filesPlan.limits, {
      maxColoredBytes,
      wholeLineBytes,
      rowBytes,
      maxPreviewBytes,
      maxImageSize,
      maxMatches,
    });
    const made = planFor('linux');
    const under = (where: string, limit: number, measure = sizeOf) =>
      assert.ok(measure(itemAt(made, where)) < limit, where);
    const over = (where: string, limit: number, measure = sizeOf) =>
      assert.ok(measure(itemAt(made, where)) > limit, where);
    under(
      'syntax/limit-size-just-under-the-coloring-limit.ts',
      maxColoredBytes,
    );
    over('syntax/limit-size-over-the-coloring-limit.ts', maxColoredBytes);
    under('text/long-line-just-under-64-kib.txt', wholeLineBytes, longestLine);
    over('text/long-line-just-over-64-kib.txt', wholeLineBytes, longestLine);
    under('markdown/just-under-the-preview-limit.md', maxPreviewBytes);
    over('markdown/over-the-preview-limit.md', maxPreviewBytes);
    over('images/over-the-image-limit.png', maxImageSize);
    over(
      'text/find-more-matches-than-counted.txt',
      maxMatches,
      (item) => contentOf(item).toString().split('needle').length - 1,
    );
  });

  test('holds code in more than 30 languages the viewer colors, every sample in one but the classic solution of .NET, which no grammar colors', () => {
    const samples = childrenOf(planFor('linux'), 'syntax').filter(
      (item) => item.kind === 'file',
    );
    assert.deepStrictEqual(
      samples
        .filter((item) => languageOf(item.path) === undefined)
        .map((item) => path.posix.basename(item.path)),
      ['Playground.sln'],
    );
    assert.ok(new Set(samples.map((item) => languageOf(item.path))).size > 30);
  });

  test('holds a .NET solution in C#, F#, Visual Basic, Razor and XAML with its projects and settings, a Rust crate with its Cargo files, pairs of each to compare, and CSV and TSV of many kinds', () => {
    const made = planFor('linux');
    const languagesOf = (folder: string, pattern: RegExp) =>
      new Set(
        childrenOf(made, folder)
          .filter((item) => pattern.test(path.posix.basename(item.path)))
          .map((item) => languageOf(item.path)),
      );
    assert.deepStrictEqual(
      [
        ...languagesOf(
          'syntax',
          /\.(cs|csx|fs|fsx|vb|razor|cshtml|xaml|resx|csproj|fsproj|slnx|props)$|^(global\.json|nuget\.config|\.editorconfig)$/,
        ),
      ].toSorted((a, b) => String(a).localeCompare(String(b))),
      ['csharp', 'fsharp', 'ini', 'json', 'razor', 'vb', 'xml'],
    );
    assert.deepStrictEqual(
      [...languagesOf('syntax', /\.rs$|^Cargo\./)].toSorted((a, b) =>
        String(a).localeCompare(String(b)),
      ),
      ['rust', 'toml'],
    );
    for (const pair of ['csharp', 'rust']) {
      assert.ok(
        made.pairs.some(([one]) => one.startsWith(`compare/${pair}-`)),
        pair,
      );
    }
    const tables = childrenOf(made, 'formats').filter((item) =>
      /\.(csv|tsv)$/.test(item.path),
    );
    assert.ok(tables.length >= 7, String(tables.length));
    assert.deepStrictEqual(
      [...new Set(tables.map((item) => languageOf(item.path)))].toSorted(
        (a, b) => String(a).localeCompare(String(b)),
      ),
      ['csv', 'tsv'],
    );
  });

  test('holds files with copies of the same content under other names and in deeper folders, files of one size that differ at their start or only past the first 64 KiB, a hard link, empty files and a link, for the view of duplicates', () => {
    const made = planFor('linux');
    const head = 64 * 1024;
    const files = made.items.filter(
      (item) => item.kind === 'file' && item.path.startsWith('duplicates/'),
    );
    const contents = new Map(files.map((item) => [item, contentOf(item)]));
    const byContent = new Map<string, string[]>();
    for (const [item, content] of contents) {
      if (content.length > 0) {
        const key = content.toString('base64');
        byContent.set(key, [...(byContent.get(key) ?? []), item.path]);
      }
    }
    const groups = [...byContent.values()].filter((group) => group.length > 1);
    const pairs = [...contents].flatMap(([one, first]) =>
      [...contents].flatMap(([other, second]) =>
        one !== other && first.length > 0 && first.length === second.length
          ? [{ first, second }]
          : [],
      ),
    );
    const renamedDeep = groups.some(
      (group) =>
        new Set(group.map((each) => path.posix.basename(each))).size > 1 &&
        group.some((each) => each.split('/').length > 4),
    );
    const hardLink = made.items.find(
      (item) => item.kind === 'hardLink' && item.path.startsWith('duplicates/'),
    );

    assert.ok(groups.length >= 3, String(groups.length));
    assert.ok(renamedDeep, 'a group under other names, one of them deep');
    assert.ok(
      pairs.some(({ first, second }) => first[0] !== second[0]),
      'files of one size that differ at their start',
    );
    assert.ok(
      pairs.some(
        ({ first, second }) =>
          first.length > head &&
          first.subarray(0, head).equals(second.subarray(0, head)) &&
          !first.equals(second),
      ),
      'files of one size that differ only past their first 64 KiB',
    );
    assert.ok(
      [...contents.values()].filter((content) => content.length === 0).length >=
        2,
    );
    assert.ok(
      hardLink?.target !== undefined &&
        files.some((item) => item.path === hardLink.target),
    );
    assert.ok(
      made.items.some(
        (item) => item.kind === 'link' && item.path.startsWith('duplicates/'),
      ),
    );
  });

  test('pairs files to compare that differ, but for the pair that is identical', () => {
    const made = planFor('linux');
    assert.ok(made.pairs.length >= 12);
    for (const [one, other] of made.pairs) {
      const same = contentOf(itemAt(made, one)).equals(
        contentOf(itemAt(made, other)),
      );
      assert.strictEqual(same, one.startsWith('compare/identical-'), one);
    }
  });

  test('adds with --large a log of 200 MiB, a copy of 2 GiB, 100,000 files in one folder, 2,000 thumbnails and a PDF of thousands of pages, and leaves them out otherwise', () => {
    const large = planFor('linux', true);
    const small = planFor('linux');
    assert.strictEqual(
      sizeOf(itemAt(large, 'huge/log-of-200-mib.log')),
      200 * 1024 * 1024,
    );
    assert.strictEqual(
      sizeOf(itemAt(large, 'operations/copy-from/big-2-gib.bin')),
      2 * 1024 ** 3,
    );
    assert.ok(itemAt(large, 'huge/pdf-of-100-mib.pdf').chunks !== undefined);
    assert.strictEqual(countUnder(large, 'many'), 100_000);
    assert.strictEqual(countUnder(large, 'thumbnails'), 2000);
    assert.strictEqual(countUnder(small, 'huge'), 0);
    assert.ok(countUnder(small, 'many') > 5000);
    assert.strictEqual(countUnder(small, 'thumbnails'), 200);
  });

  test('makes only where a system can the files it alone can: attributes and a junction on Windows, names Windows refuses elsewhere and names differing only in case on Linux', () => {
    assert.deepStrictEqual(
      platforms.map((platform) => [
        platform,
        planHas(platform, madeOnlyOnWindows),
        planHas(platform, refusedByWindows),
        planHas(platform, differingInCase),
      ]),
      [
        ['win32', true, false, false],
        ['darwin', false, true, false],
        ['linux', false, true, true],
      ],
    );
    for (const platform of platforms) {
      assert.ok(
        planHas(platform, (item) => item.unreadable === true),
        platform,
      );
    }
  });
});
