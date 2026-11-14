import { images } from './gitImages.mts';
import { commit, searchable, type Change } from './gitImport.mts';
import {
  decoded,
  diagrams,
  emojiGrid,
  everything,
  everythingChanged,
  imageKinds,
  languages,
  paddedTable,
  png,
  sentence,
  shade,
  vector,
} from './samples.mts';

const manyLines = (word: string) =>
  `${Array.from({ length: 30_000 }, (_, i) => `${word} ${i + 1}`).join('\n')}\n`;
const everyWay = (file: string) => `showcase/everything/${file}`;
const numberedLines = (name: string, count = 12) =>
  Array.from({ length: count }, (_, i) => `line ${i + 1} of ${name}`);
const numbered = (name: string) => `${numberedLines(name).join('\n')}\n`;
const numberedChanged = (name: string) =>
  `${numberedLines(name)
    .map((line, i) => (i === 5 ? `${line}, changed` : line))
    .join('\n')}\n`;
const guide = (note: string) =>
  `# A guide renamed later\n\n${numberedLines('the guide', 10)
    .map((line) => `- ${line}`)
    .join('\n')}\n${note}`;
const swapped = {
  left: 'The left file, swapped with the right later.\n',
  right: 'The right file, swapped with the left later.\n',
};

export function changesOnMain(start: number): number {
  let main = start;
  const onMain = (message: string, changes: readonly Change[]) => {
    main = commit('refs/heads/main', { from: main, changes, message });
  };
  onMain(
    searchable('Add files to show every kind of change in a diff', [
      'diff',
      'whitespace',
      'crlf',
      'newline',
      'empty',
      'executable',
      'symlink',
    ]),
    [
      { path: 'diffs/whitespace.txt', content: 'if (ready) {\n  go();\n}\n' },
      { path: 'diffs/line-endings.txt', content: 'one\ntwo\nthree\n' },
      { path: 'diffs/no-newline.txt', content: 'a final newline\n' },
      { path: 'diffs/empty.txt', content: '' },
      { path: 'diffs/tool.sh', content: '#!/bin/sh\necho "a tool"\n' },
      { path: 'diffs/becomes-link', content: 'A file that becomes a link.\n' },
    ],
  );
  onMain(
    searchable('Change only the whitespace of a file', [
      'whitespace',
      'spaces',
      'tabs',
      'indent',
    ]),
    [{ path: 'diffs/whitespace.txt', content: 'if (ready)  {\n\tgo();\n}\n' }],
  );
  onMain(
    searchable('Turn the line endings of a file into CRLF', [
      'crlf',
      'lf',
      'line endings',
      'eol',
    ]),
    [{ path: 'diffs/line-endings.txt', content: 'one\r\ntwo\r\nthree\r\n' }],
  );
  onMain(
    searchable('Drop the final newline of a file', [
      'newline',
      'eof',
      'no newline at end of file',
    ]),
    [{ path: 'diffs/no-newline.txt', content: 'no final newline' }],
  );
  onMain(searchable('Delete an empty file', ['empty', 'delete']), [
    { delete: 'diffs/empty.txt' },
  ]);
  onMain(
    searchable('Make a script executable', [
      'executable',
      'mode',
      'chmod',
      'permission',
    ]),
    [
      {
        path: 'diffs/tool.sh',
        content: '#!/bin/sh\necho "a tool"\n',
        mode: '100755',
      },
    ],
  );
  onMain(
    searchable('Link to the readme, and turn a file into a link', [
      'symlink',
      'link',
      'type change',
    ]),
    [
      { path: 'diffs/link-to-readme', content: '../README.md', mode: '120000' },
      { path: 'diffs/becomes-link', content: '../README.md', mode: '120000' },
    ],
  );
  commit('refs/heads/many-files', {
    from: main,
    message: searchable('Add three thousand files at once', [
      'many files',
      'bulk',
      'thousands',
    ]),
    changes: Array.from({ length: 3000 }, (_, i) => ({
      path: `bulk/file-${String(i + 1).padStart(4, '0')}.txt`,
      content: `file ${i + 1}\n`,
    })),
  });

  onMain(
    searchable('Add a Markdown file with everything its preview renders', [
      'markdown',
      'md',
      'preview',
      'rendered',
      'document',
      'table',
      'task list',
      'code block',
      'html',
    ]),
    [{ path: 'showcase/markdown/everything.md', content: everything }],
  );
  onMain(
    searchable('Change the Markdown file, so its preview shows a diff', [
      'markdown',
      'md',
      'preview',
      'diff',
      'change',
    ]),
    [{ path: 'showcase/markdown/everything.md', content: everythingChanged }],
  );
  onMain(
    searchable('Add Markdown files with every extension the preview knows', [
      'markdown',
      'md',
      'mdown',
      'mkd',
      'mkdn',
      'extension',
      'preview',
    ]),
    ['markdown', 'mdown', 'mkd', 'mkdn'].map((extension) => ({
      path: `showcase/markdown/extension.${extension}`,
      content: `# A .${extension} file\n\nPreviewed like any **Markdown**.\n`,
    })),
  );
  onMain(
    searchable('Add Markdown whose HTML the preview sanitizes', [
      'markdown',
      'md',
      'html',
      'sanitize',
      'script',
      'security',
      'xss',
    ]),
    [
      {
        path: 'showcase/markdown/sanitized.md',
        content:
          '# Sanitized\n\n<script>alert("never runs")</script>\n\n<iframe src="https://example.com"></iframe>\n\n<img src="x" onerror="alert(1)" alt="An image whose handler is dropped">\n\n<a href="javascript:alert(1)">A link whose script is dropped</a>\n\n<p style="color: red">A paragraph whose style is dropped</p>\n',
      },
    ],
  );
  onMain(
    searchable(
      'Add Markdown with images from the repository, the web and nowhere',
      ['markdown', 'md', 'image', 'picture', 'alt', 'preview'],
    ),
    [
      {
        path: 'showcase/markdown/images.md',
        content:
          '# Images\n\nFrom the repository:\n\n![The logo](../../images/logo.png)\n\nFrom the web, shown as its alt text:\n\n![A picture on the web](https://example.com/picture.png)\n\nMissing:\n\n![A picture that is not there](missing.png)\n',
      },
    ],
  );
  onMain(
    searchable(
      'Add Markdown with Mermaid diagrams and plain text architecture diagrams',
      [
        'markdown',
        'md',
        'mermaid',
        'diagram',
        'flowchart',
        'sequence',
        'state',
        'ascii',
        'architecture',
        'preview',
      ],
    ),
    [{ path: 'showcase/markdown/diagrams.md', content: diagrams }],
  );
  for (const { extension, terms, versions } of imageKinds) {
    const [added, changed] = versions();
    const image = `showcase/images/sample.${extension}`;
    onMain(
      searchable(`Add a ${extension.toUpperCase()} image`, [
        'image',
        'picture',
        'preview',
        ...terms,
      ]),
      [{ path: image, content: added }],
    );
    onMain(
      searchable(`Change the ${extension.toUpperCase()} image`, [
        'image',
        'picture',
        'preview',
        'change',
        ...terms,
      ]),
      [{ path: image, content: changed }],
    );
  }
  onMain(
    searchable(
      'Add an animated GIF, a PNG with transparency and a very wide image',
      [
        'image',
        'picture',
        'gif',
        'animated',
        'animation',
        'png',
        'transparent',
        'transparency',
        'alpha',
        'wide',
        'size',
      ],
    ),
    [
      {
        path: 'showcase/images/animated.gif',
        content: decoded(images.animated),
      },
      {
        path: 'showcase/images/transparent.png',
        content: decoded(images.transparent),
      },
      {
        path: 'showcase/images/wide.png',
        content: png(1600, 48, (x, y) => [shade(x), shade(y), shade(1 - x)]),
      },
    ],
  );
  onMain(
    searchable(
      'Add an image that fails to load, and an SVG carrying a script an image never runs',
      [
        'image',
        'broken',
        'corrupt',
        'invalid',
        'error',
        'png',
        'svg',
        'script',
        'security',
      ],
    ),
    [
      {
        path: 'showcase/images/broken.png',
        content: 'This is not a PNG at all.\n',
      },
      {
        path: 'showcase/images/scripted.svg',
        content:
          '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96">\n  <script>alert("never runs")</script>\n  <rect width="96" height="96" fill="#6a6"/>\n</svg>\n',
      },
    ],
  );
  onMain(
    searchable('Add code in many more languages, for syntax colors', [
      'syntax',
      'highlight',
      'colors',
      'language',
      'code',
      ...Object.keys(languages).map((file) =>
        file.slice(file.lastIndexOf('.') + 1).toLowerCase(),
      ),
    ]),
    Object.entries(languages).map(([file, content]) => ({
      path: `showcase/languages/${file}`,
      content,
    })),
  );
  onMain(
    searchable('Change the code in every language, word by word', [
      'syntax',
      'language',
      'code',
      'word diff',
      'change',
    ]),
    Object.entries(languages).map(([file, content]) => ({
      path: `showcase/languages/${file}`,
      content: content.replaceAll('world', 'playground'),
    })),
  );
  onMain(
    searchable('Add a file with a NUL byte, which git takes for binary', [
      'binary',
      'nul',
      'null byte',
    ]),
    [
      {
        path: 'showcase/text/nul-byte.txt',
        content: Buffer.from('text\0with a NUL byte\n'),
      },
    ],
  );
  onMain(
    searchable('Add a file larger than 2 MB, shown as a large file', [
      'large',
      'big',
      'huge',
      'size',
      'mb',
      'large file',
    ]),
    [
      {
        path: 'showcase/text/larger-than-2-mb.txt',
        content: `${Array.from({ length: 70_000 }, (_, i) => `line ${i + 1}: ${sentence(i, 6)}`).join('\n')}\n`,
      },
    ],
  );
  onMain(
    searchable('Add 30,000 lines at once, which collapses the diff', [
      'large diff',
      'collapse',
      'lines',
      'many lines',
    ]),
    [{ path: 'showcase/text/large-diff.txt', content: manyLines('line') }],
  );
  onMain(
    searchable('Change 30,000 lines at once, which collapses the diff', [
      'large diff',
      'collapse',
      'lines',
      'many lines',
      'change',
    ]),
    [
      {
        path: 'showcase/text/large-diff.txt',
        content: manyLines('changed line'),
      },
    ],
  );
  onMain(
    searchable(
      'Add code with a line too long to color, and code too long to color whole',
      ['syntax', 'long line', 'long file', 'many lines', 'wrap', 'code'],
    ),
    [
      {
        path: 'showcase/text/long-line.ts',
        content: `export const short = 1;\nexport const long = '${sentence(1, 600)}';\n`,
      },
      {
        path: 'showcase/text/many-lines.ts',
        content: `${Array.from({ length: 5500 }, (_, i) => `export const value${i + 1} = ${i + 1};`).join('\n')}\n`,
      },
    ],
  );
  onMain(
    searchable(
      'Add text in many scripts, with emoji, right to left and invisible characters',
      [
        'unicode',
        'emoji',
        'rtl',
        'right to left',
        'cjk',
        'arabic',
        'hebrew',
        'zero width',
        'combining',
      ],
    ),
    [
      {
        path: 'showcase/text/unicode.txt',
        content:
          'English: Hello, world!\nMagyar: Árvíztűrő tükörfúrógép\nΕλληνικά: Γειά σου κόσμε\nРусский: Привет, мир\n日本語: こんにちは世界\n中文: 你好，世界\n한국어: 안녕하세요 세계\nעברית: שלום עולם\nالعربية: مرحبا بالعالم\nEmoji: 👋🌍🎉 👩‍💻 🏳️‍🌈\nCombining: é ä ñ\nZero width: a​b‌c‍d\n',
      },
    ],
  );
  onMain(
    searchable(
      'Add emoji and Chinese, Japanese and Korean characters in a monospace grid, whose bars line up where widths are counted right',
      ['emoji', 'grid', 'width', 'wide', 'cjk', 'zwj', 'skin tone', 'flag'],
    ),
    [{ path: 'showcase/text/emoji-grid.md', content: emojiGrid(1) }],
  );
  onMain(
    searchable(
      'Change a skin tone and a member of a family in the emoji grid',
      ['emoji', 'grid', 'skin tone', 'zwj', 'change'],
    ),
    [{ path: 'showcase/text/emoji-grid.md', content: emojiGrid(2) }],
  );
  onMain(
    searchable(
      'Add a Markdown table padded as prettier pads it, with lines of more than a thousand spaces',
      ['whitespace', 'padded', 'table', 'prettier', 'spaces', 'markdown'],
    ),
    [{ path: 'showcase/text/padded-table.md', content: paddedTable(1) }],
  );
  onMain(
    searchable(
      'Rename a feature of the padded table, reword one without padding it again and drop a row',
      ['whitespace', 'padded', 'table', 'change'],
    ),
    [{ path: 'showcase/text/padded-table.md', content: paddedTable(2) }],
  );
  onMain(
    searchable('Add a file mixing tabs, spaces and trailing whitespace', [
      'whitespace',
      'tabs',
      'spaces',
      'trailing',
      'indent',
    ]),
    [
      {
        path: 'showcase/text/whitespace.txt',
        content:
          'spaces    between\n\ttab at the start\n    four spaces at the start\ntrailing spaces   \ntrailing tab\t\n\t \tmixed\n',
      },
      {
        path: 'showcase/text/to-rename.txt',
        content: `${Array.from({ length: 12 }, (_, i) => `line ${i + 1} of a file renamed later`).join('\n')}\n`,
      },
    ],
  );
  onMain(
    searchable('Copy a file to a new name', ['copy', 'copied', 'duplicate']),
    [{ copy: ['showcase/languages/sample.html', 'showcase/text/copied.html'] }],
  );
  onMain(
    searchable('Rename a file and change it', [
      'rename',
      'renamed',
      'move',
      'moved',
      'change',
    ]),
    [
      { rename: ['showcase/text/to-rename.txt', 'showcase/text/renamed.txt'] },
      {
        path: 'showcase/text/renamed.txt',
        content: `${Array.from({ length: 12 }, (_, i) => (i === 5 ? 'line 6, changed while renamed' : `line ${i + 1} of a file renamed later`)).join('\n')}\n`,
      },
    ],
  );
  onMain(
    searchable('Delete an image', [
      'delete',
      'deleted',
      'remove',
      'image',
      'png',
    ]),
    [{ delete: 'showcase/images/wide.png' }],
  );
  onMain(
    searchable('Add files to change in every way at once', [
      'everything',
      'every kind',
      'rename',
      'delete',
      'change',
    ]),
    [
      ...[
        'kept/modified.txt',
        'kept/deleted.txt',
        'kept/becomes-link',
        'moved/pure.txt',
        'moved/changed.txt',
        'moved/to-folder.txt',
        'moved/with spaces.txt',
        'moved/Case.txt',
        'moved/rewritten.txt',
        'chain/a.txt',
        'chain/b.txt',
        'copy/source.txt',
        'folder/one.txt',
        'folder/two.txt',
        'folder/three.txt',
      ].map((file) => ({ path: everyWay(file), content: numbered(file) })),
      {
        path: everyWay('kept/tool.sh'),
        content: '#!/bin/sh\necho "a tool made executable"\n',
      },
      {
        path: everyWay('moved/tool.sh'),
        content: '#!/bin/sh\necho "a tool renamed and made executable"\n',
      },
      {
        path: everyWay('moved/link'),
        content: '../../../notes.txt',
        mode: '120000',
      },
      ...Object.entries(swapped).map(([side, content]) => ({
        path: everyWay(`swap/${side}.txt`),
        content,
      })),
      {
        path: everyWay('images/pure.png'),
        content: png(48, 48, (x, y) => [shade(y), 120, shade(x)]),
      },
      { path: everyWay('images/changed.svg'), content: vector('#393') },
      { path: everyWay('markdown/guide.md'), content: guide('') },
    ],
  );
  onMain(
    searchable('Change files in every way at once', [
      'everything',
      'every kind',
      'all at once',
      'rename',
      'renamed',
      'move',
      'moved',
      'folder',
      'case',
      'swap',
      'add',
      'delete',
      'change',
      'copy',
      'executable',
      'symlink',
      'type change',
    ]),
    [
      { path: everyWay('added.txt'), content: 'A file added.\n' },
      {
        path: everyWay('kept/modified.txt'),
        content: numberedChanged('kept/modified.txt'),
      },
      { delete: everyWay('kept/deleted.txt') },
      {
        path: everyWay('kept/tool.sh'),
        content: '#!/bin/sh\necho "a tool made executable"\n',
        mode: '100755',
      },
      {
        path: everyWay('kept/becomes-link'),
        content: '../../../README.md',
        mode: '120000',
      },
      ...[
        ['moved/pure.txt', 'moved/pure-renamed.txt'],
        ['moved/changed.txt', 'moved/changed-renamed.txt'],
        ['moved/to-folder.txt', 'elsewhere/to-folder.txt'],
        ['moved/with spaces.txt', 'moved/ünïcödé – 名前.txt'],
        ['moved/Case.txt', 'moved/CASE.txt'],
        ['moved/rewritten.txt', 'moved/rewritten-renamed.txt'],
        ['moved/tool.sh', 'moved/tool-renamed.sh'],
        ['moved/link', 'moved/link-renamed'],
        ['chain/b.txt', 'chain/c.txt'],
        ['chain/a.txt', 'chain/b.txt'],
        ['folder/one.txt', 'renamed-folder/one.txt'],
        ['folder/two.txt', 'renamed-folder/two.txt'],
        ['folder/three.txt', 'renamed-folder/three.txt'],
        ['images/pure.png', 'images/pure-renamed.png'],
        ['images/changed.svg', 'images/changed-renamed.svg'],
        ['markdown/guide.md', 'markdown/renamed-guide.md'],
      ].map(([from, to]): Change => ({
        rename: [everyWay(from), everyWay(to)],
      })),
      {
        path: everyWay('moved/changed-renamed.txt'),
        content: numberedChanged('moved/changed.txt'),
      },
      {
        path: everyWay('moved/rewritten-renamed.txt'),
        content: 'Rewritten while renamed, so git no longer pairs it.\n',
      },
      {
        path: everyWay('moved/tool-renamed.sh'),
        content: '#!/bin/sh\necho "a tool renamed and made executable"\n',
        mode: '100755',
      },
      {
        path: everyWay('images/changed-renamed.svg'),
        content: vector('#939'),
      },
      {
        path: everyWay('markdown/renamed-guide.md'),
        content: guide('\nA paragraph added while renamed.\n'),
      },
      { copy: [everyWay('copy/source.txt'), everyWay('copy/copied.txt')] },
      { path: everyWay('swap/left.txt'), content: swapped.right },
      { path: everyWay('swap/right.txt'), content: swapped.left },
    ],
  );
  return main;
}
