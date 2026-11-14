import * as fs from 'node:fs';
import * as path from 'node:path';
import { zstdCompressSync } from 'node:zlib';
import {
  docx,
  encoded,
  gzip,
  pdfParts,
  sevenZipEncrypted,
  tar,
  zip,
} from './formats.mts';
import { dotnetPair, rustPair } from './projectSamples.mts';
import {
  binary,
  emojiGrid,
  imageKinds,
  paddedTable,
  sentence,
} from './samples.mts';
import type { PlanBuilder, PlanOptions } from './filesPlan.mts';
import type { Content } from './planContents.mts';
import {
  mib,
  gib,
  appRoot,
  lines,
  oneLineOfSize,
  randomOfSize,
  logOfSize,
  unicodeText,
  realSources,
  changedCode,
  codePage852,
  prose,
  plainPng,
  largePdfPages,
  three,
} from './planContents.mts';

export function planArchives(builder: PlanBuilder, options: PlanOptions): void {
  const { items, pairs, file, chunks, section } = builder;
  const { platform, large } = options;
  const windows = platform === 'win32';
  section(
    'archives',
    `Archives to enter with Open with 7-Zip... in the menu of a file, or Mod+Left and Mod+Right on it: a zip of folders, tars plain and compressed, shown as the files of their tar, a document made of a zip, which Enter opens in its app, one compressed file, a zip inside a zip, an empty one, names Windows wrote in code page 852, names reaching outside the folder they would be extracted into, deep folders, ${(large ? 100_000 : 5000).toLocaleString('en-US')} files, a zip encrypted with the password playground, one with only some of its files encrypted with it, a 7z whose names are encrypted with it too, a zip encrypted with it holding a 7z whose names are encrypted with the password inner, a zip of images to see in thumbnails with Mod+2, flat with Ctrl+B too, a damaged one, one that is no archive${windows ? ', and one marked as downloaded' : ''}.`,
  );
  const project = [
    { name: 'README.md', content: '# A project packed by the playground\n' },
    { name: 'docs/guide.md', content: prose(1) },
    { name: 'src/app/main.ts', content: 'export const packed = true;\n' },
    { name: 'src/app/view.tsx', content: 'export const View = () => null;\n' },
    { name: 'ünïcödé – 名前.txt', content: 'A name beyond ASCII.\n' },
  ];
  const zippedProject = () =>
    zip([{ name: 'empty-folder/', content: '' }, ...project]);
  file('archives/project.zip', zippedProject);
  file('archives/project.tar', () => tar(project));
  file('archives/project.tar.gz', () => gzip(tar(project)));
  file('archives/project.tgz', () => gzip(tar(project)));
  file('archives/project.tar.zst', () => zstdCompressSync(tar(project)));
  file('archives/report.docx', () =>
    docx([
      'A document made of a zip.',
      'Enter opens it in its app, and Open with 7-Zip... shows the files it is made of.',
    ]),
  );
  file('archives/notes.txt.gz', () => gzip(lines(200, (i) => sentence(i, 8))));
  file('archives/nested.zip', () =>
    zip([
      { name: 'inner.zip', content: zippedProject() },
      { name: 'beside-it.txt', content: 'Beside the zip inside.\n' },
    ]),
  );
  file('archives/empty.zip', () => zip([]));
  file('archives/windows-cp852.zip', () =>
    zip([
      {
        name: codePage852('árvíztűrő tükörfúrógép.txt'),
        content: 'Named in code page 852.\n',
      },
      {
        name: codePage852('Mappa/ő.txt'),
        content: 'In a folder named in code page 852.\n',
      },
    ]),
  );
  file('archives/hostile-names.zip', () =>
    zip(
      [
        '../outside.txt',
        '../../further-outside.txt',
        'C:/absolute.txt',
        '/rooted.txt',
        'colon:stream.txt',
        'CON.txt',
        'trailing-dot.',
        'trailing-space ',
        'Same.txt',
        'same.txt',
        'back\\slash.txt',
        'question?.txt',
      ].map((name) => ({ name, content: `Named ${name} in the archive.\n` })),
    ),
  );
  file('archives/deep.zip', () =>
    zip([
      {
        name: `${Array.from({ length: 30 }, (_, i) => `level-${i + 1}`).join('/')}/bottom.txt`,
        content: 'Thirty folders down.\n',
      },
    ]),
  );
  file('archives/many-files.zip', () =>
    zip(
      Array.from({ length: large ? 100_000 : 5000 }, (_, i) => ({
        name: `folder-${String(Math.floor(i / 100)).padStart(4, '0')}/file-${String(i).padStart(6, '0')}.txt`,
        content: `File ${i}.\n`,
      })),
    ),
  );
  file('archives/encrypted.zip', () => zip(project, 'playground'));
  file('archives/partly-encrypted.zip', () =>
    zip(
      project.map((each) =>
        each.name.startsWith('docs/') || each.name.startsWith('src/')
          ? { ...each, password: 'playground' }
          : each,
      ),
    ),
  );
  file('archives/encrypted-names.7z', () =>
    sevenZipEncrypted(project, 'playground'),
  );
  file('archives/encrypted-nested.zip', () =>
    zip(
      [
        {
          name: 'inner-encrypted.7z',
          content: sevenZipEncrypted(project, 'inner'),
        },
        { name: 'beside-it.txt', content: 'Beside the 7z inside.\n' },
      ],
      'playground',
    ),
  );
  file('archives/images.zip', () =>
    zip(
      Array.from({ length: 80 }, (_, i) => ({
        name: `${i < 60 ? '' : 'more/'}image-${String(i + 1).padStart(2, '0')}.png`,
        content: plainPng(
          48 + ((i * 37) % 400),
          48 + ((i * 53) % 300),
          (i * 47) % 360,
        ),
      })),
    ),
  );
  file('archives/cut-short.zip', () => {
    const whole = zippedProject();
    return whole.subarray(0, Math.floor(whole.length / 2));
  });
  file('archives/not-an-archive.zip', 'Plain text, named as a zip.\n');
  if (windows) {
    file('archives/downloaded.zip', zippedProject);
    file(
      'archives/downloaded.zip:Zone.Identifier',
      '[ZoneTransfer]\r\nZoneId=3\r\nHostUrl=https://example.com/downloaded.zip\r\n',
    );
  }

  section(
    'thumbnails',
    `${large ? 2000 : 200} images of many sizes and colors, to scroll in thumbnails with Mod+2.`,
  );
  for (let i = 0; i < (large ? 2000 : 200); i++) {
    file(`thumbnails/image-${String(i + 1).padStart(4, '0')}.png`, () =>
      plainPng(48 + ((i * 37) % 400), 48 + ((i * 53) % 300), (i * 47) % 360),
    );
  }

  section(
    'compare',
    'Pairs of files to compare with Shift+F3 once both are marked, each differing in one way, or with one on each side.',
  );
  const pair = (
    name: string,
    one: [string, Content | (() => Content)],
    other: [string, Content | (() => Content)],
  ) => {
    file(`compare/${name}-${one[0]}`, one[1]);
    file(`compare/${name}-${other[0]}`, other[1]);
    pairs.push([`compare/${name}-${one[0]}`, `compare/${name}-${other[0]}`]);
  };
  pair('text', ['v1.md', prose(1)], ['v2.md', prose(2)]);
  const codeSource =
    realSources.find((source) => source.endsWith('.ts')) ?? realSources[0];
  pair(
    'code',
    ['v1.ts', () => fs.readFileSync(path.join(appRoot, codeSource))],
    [
      'v2.ts',
      () =>
        changedCode(fs.readFileSync(path.join(appRoot, codeSource), 'utf8')),
    ],
  );
  pair('emoji', ['v1.md', emojiGrid(1)], ['v2.md', emojiGrid(2)]);
  pair('padded-table', ['v1.md', paddedTable(1)], ['v2.md', paddedTable(2)]);
  pair(
    'whitespace-only',
    ['v1.ts', 'if (ready) {\n  go();\n}\n'],
    ['v2.ts', 'if (ready)  {\n\tgo();\n}\n'],
  );
  pair(
    'line-endings',
    ['lf.txt', `${three.join('\n')}\n`],
    ['crlf.txt', `${three.join('\r\n')}\r\n`],
  );
  pair(
    'encoding',
    ['utf-8.txt', () => encoded(unicodeText, 'utf-8')],
    ['utf-16le.txt', () => encoded(`\uFEFF${unicodeText}`, 'utf-16le')],
  );
  pair(
    'binary',
    ['v1.bin', () => binary(4096, 1)],
    ['v2.bin', () => binary(4096, 2)],
  );
  pair(
    'image',
    ['v1.png', () => imageKinds[0].versions()[0]],
    ['v2.png', () => imageKinds[0].versions()[1]],
  );
  pair('csharp', ['v1.cs', dotnetPair[0]], ['v2.cs', dotnetPair[1]]);
  pair('rust', ['v1.rs', rustPair[0]], ['v2.rs', rustPair[1]]);
  pair('identical', ['one.txt', prose(1)], ['two.txt', prose(1)]);
  pair('empty-and-full', ['empty.txt', ''], ['full.txt', prose(1)]);
  pair(
    'many-changes',
    ['v1.txt', () => lines(30_000, (i) => `line ${i + 1}`)],
    [
      'v2.txt',
      () =>
        lines(30_000, (i) =>
          i % 7 === 0 ? `changed line ${i + 1}` : `line ${i + 1}`,
        ),
    ],
  );
  file(
    'compare/settings-left.json',
    '{\n  "theme": "dark",\n  "fontSize": 13\n}\n',
  );
  file(
    'compare/settings-right.json',
    '{\n  "theme": "light",\n  "fontSize": 13,\n  "wrap": true\n}\n',
  );
  pairs.push(['compare/settings-left.json', 'compare/settings-right.json']);

  section(
    'operations',
    'Files to copy from copy-from into copy-to with F5 or move with F6, clashing in every way: the same file, another file of one name, a folder to merge and a read-only target; files to delete; and a file large enough to watch a copy go.',
  );
  file('operations/copy-from/same.txt', 'The same on both sides.\n');
  file('operations/copy-to/same.txt', 'The same on both sides.\n');
  file('operations/copy-from/different.txt', 'The one copied.\n', {
    modified: new Date('2026-02-02T10:00:00Z'),
  });
  file('operations/copy-to/different.txt', 'The one there, older.\n', {
    modified: new Date('2026-01-01T10:00:00Z'),
  });
  file('operations/copy-from/only-here.txt', 'Copied without a question.\n');
  file('operations/copy-from/merged/a.txt', 'Only in copy-from.\n');
  file('operations/copy-from/merged/b.txt', 'The one copied.\n');
  file('operations/copy-to/merged/b.txt', 'The one there.\n');
  file('operations/copy-to/merged/c.txt', 'Only in copy-to.\n');
  file('operations/copy-from/read-only-there.txt', 'The one copied.\n');
  file('operations/copy-to/read-only-there.txt', 'Read-only.\n', {
    readOnly: true,
  });
  file('operations/delete-me.txt', 'Delete me.\n');
  file('operations/delete-me-read-only.txt', 'Delete me too.\n', {
    readOnly: true,
  });
  file('operations/delete-me-folder/inside.txt', 'And me.\n');
  chunks(
    `operations/copy-from/big-${large ? '2-gib' : '64-mib'}.bin`,
    large ? 2 * gib : 64 * mib,
    () => randomOfSize(large ? 2 * gib : 64 * mib, 11),
  );

  const manyFiles = large ? 100_000 : 6000;
  section(
    'many',
    `${manyFiles.toLocaleString('en-US')} files in one folder, read a page at a time.`,
  );
  for (let i = 0; i < manyFiles; i++) {
    file(`many/file-${String(i + 1).padStart(6, '0')}.txt`, '');
  }

  const [fanOut, depth, perFolder] = large ? [6, 5, 10] : [5, 4, 5];
  section(
    'deep',
    `A tree ${depth} folders deep, ${fanOut} folders wide and ${perFolder} files in each, each named after the folders above it, of many sizes and dates, to list flat with Ctrl+B, sort and stop with Esc.`,
  );
  let grown = 0;
  const grow = (under: string, trail: string, level: number) => {
    for (let k = 0; k < perFolder; k++) {
      grown++;
      file(
        `${under}/file-${trail}${k + 1}.${['txt', 'ts', 'md', 'png', 'json'][k % 5]}`,
        'x'.repeat((grown * 7919) % 4096),
        {
          modified: new Date(
            2020 + (grown % 7),
            grown % 12,
            1 + (grown % 28),
            grown % 24,
            grown % 60,
          ),
        },
      );
    }
    if (level < depth) {
      for (let k = 0; k < fanOut; k++) {
        grow(
          `${under}/folder-${trail}${k + 1}`,
          `${trail}${k + 1}-`,
          level + 1,
        );
      }
    }
  };
  grow('deep', '', 1);

  section(
    'repository',
    'A git repository of its own, marked by the git icon, opened in a git tab with Shift+Enter; the other folders are in none, where the menu offers Clone... and Init.',
  );
  file('repository/README.md', '# A repository inside the playground\n');
  file('repository/main.ts', 'export const inside = "a repository";\n');
  items.push({ kind: 'repository', path: 'repository' });

  section(
    'churn',
    'Changed every half second while the script runs with --churn: files added, grown, renamed and deleted, to watch the commander follow.',
  );
  file(
    'churn/README.txt',
    'This folder stays as it is until the playground script runs with --churn:\n\n    npm run playground:files -- --churn\n\nIt then keeps the playground and changes this folder every half second, adding a file, growing growing.log, renaming a file back and forth and deleting the oldest added, until stopped with Ctrl+C, to watch the commander follow, in a folder and in flat view.\n',
  );

  if (large) {
    section(
      'huge',
      'A log of 200 MiB with one NEEDLE near its end, a padded table of 10 MiB, one line of 50 MiB and a PDF of 100 MiB.',
    );
    chunks('huge/log-of-200-mib.log', 200 * mib, () => logOfSize(200 * mib));
    file('huge/padded-table-of-10-mib.md', () => paddedTable(1, 7985));
    chunks('huge/one-line-of-50-mib.txt', 50 * mib, () =>
      oneLineOfSize(50 * mib),
    );
    items.push({
      kind: 'chunks',
      path: 'huge/pdf-of-100-mib.pdf',
      chunks: () => pdfParts(largePdfPages(2300), 2300),
    });
  }
}
