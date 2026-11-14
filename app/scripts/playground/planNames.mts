import * as path from 'node:path';
import { docx, gzip, tar, wav, xlsx, zip } from './formats.mts';
import { csvFiles, csvRows } from './projectSamples.mts';
import { binary, sentence } from './samples.mts';
import type { PlanBuilder, PlanOptions } from './filesPlan.mts';
import { kib, mib, gib, lines, randomOfSize } from './planContents.mts';

const photo = () => Buffer.concat([...randomOfSize(300 * kib, 7)]);

export function planNames(builder: PlanBuilder, options: PlanOptions): void {
  const { items, file, folder, section } = builder;
  const { platform } = options;
  const windows = platform === 'win32';
  section(
    'sizes',
    'Files of 0 bytes up to 1 MiB around the edges a size is shown at, and one over 4 GiB stored sparse, which takes no room on the disk.',
  );
  for (const [name, size] of [
    ['0-bytes.txt', 0],
    ['1-byte.txt', 1],
    ['999-bytes.bin', 999],
    ['1000-bytes.bin', 1000],
    ['1023-bytes.bin', 1023],
    ['1024-bytes.bin', 1024],
    ['1-mib.bin', mib],
  ] as const) {
    file(`sizes/${name}`, () => binary(size, size + 1));
  }
  items.push({
    kind: 'sparse',
    path: 'sizes/over-4-gib-sparse.bin',
    size: 5 * gib + 3,
  });

  section(
    'dates',
    'Files and a folder dated from 1980 to 2100, in the time of this computer as their names say, past the year 2038 when 32-bit times end. Sort by Date.',
  );
  for (const [name, date] of [
    ['1980-01-01.txt', '1980-01-01T12:00:00'],
    ['1999-12-31.txt', '1999-12-31T23:59:00'],
    ['2000-01-01.txt', '2000-01-01T00:00:00'],
    ['2026-02-01.txt', '2026-02-01T09:30:00'],
    ['2038-01-19-after-32-bit.txt', '2038-01-19T03:14:08'],
    ['2100-01-01.txt', '2100-01-01T00:00:00'],
  ] as const) {
    file(`dates/${name}`, `Dated ${date}.\n`, { modified: new Date(date) });
  }
  items.push({
    kind: 'folder',
    path: 'dates/folder-of-1999',
    modified: new Date('1999-06-15T10:00:00'),
  });

  section(
    'names',
    'Names in many scripts, with emoji, spaces and odd characters, sorted naturally, with many dots or none, too long to show whole, in a path longer than Windows allowed once, and on macOS and Linux the names Windows refuses; on Linux two names differing only in case.',
  );
  for (const name of [
    'Árvíztűrő tükörfúrógép.txt',
    'こんにちは 世界.txt',
    '中文名字.txt',
    '한국어 이름.txt',
    'עברית.txt',
    'العربية.txt',
    'emoji 😀 👩‍💻 🇭🇺.txt',
    'two  spaces  inside.txt',
    ' a leading space.txt',
    '[brackets] and (parentheses).txt',
    "it's quoted.txt",
    '#hash %percent &ampersand.txt',
    'semi;colon,comma.txt',
    'archive.tar.gz',
    'many.dots.in.one.name.txt',
    '.env',
    'no-extension',
    'UPPERCASE.TXT',
    'report.pdf',
    'report.docx',
    'report.md',
    'file1.txt',
    'file2.txt',
    'file10.txt',
    'file 2 (copy).txt',
    `${'a name far too long to show whole in the column '.repeat(4).trim()}.txt`,
  ]) {
    file(`names/${name}`, '');
  }
  if (!windows) {
    for (const name of [
      'a:colon.txt',
      'back\\slash.txt',
      'trailing dot.',
      'trailing space ',
      'CON.txt',
      'a|pipe and a?question.txt',
    ]) {
      file(`names/${name}`, '');
    }
  }
  if (platform === 'linux') {
    file('names/Readme.md', '# Readme\n');
    file('names/README.md', '# README\n');
  }
  file(
    `names/${Array.from({ length: 5 }, (_, i) => `a-folder-with-a-name-long-enough-to-pass-the-old-limit-of-windows-${i + 1}`).join('/')}/deep.txt`,
    'A file in a path longer than 260 characters.\n',
  );

  section(
    'attributes',
    'Hidden files and folders, by their attribute on Windows and a leading dot elsewhere, a system file, a read-only one, a folder of only hidden files, an empty folder and a folder no one may read. Show hidden files with Ctrl+H.',
  );
  file(
    'attributes/.dot-file',
    'Hidden on macOS and Linux, shown on Windows.\n',
  );
  folder('attributes/.dot-folder');
  file('attributes/.dot-folder/inside.txt', '');
  if (windows) {
    file('attributes/hidden.txt', 'Hidden by its attribute.\n', {
      hidden: true,
    });
    folder('attributes/hidden-folder', { hidden: true });
    file('attributes/hidden-folder/inside.txt', '');
    file('attributes/desktop.ini', '[.ShellClassInfo]\n', {
      hidden: true,
      system: true,
    });
    folder('attributes/only-hidden-files');
    file('attributes/only-hidden-files/one.txt', '', { hidden: true });
    file('attributes/only-hidden-files/two.txt', '', { hidden: true });
  } else {
    folder('attributes/only-hidden-files');
    file('attributes/only-hidden-files/.one', '');
    file('attributes/only-hidden-files/.two', '');
  }
  if (platform === 'darwin') {
    file(
      'attributes/hidden-by-a-flag.txt',
      'Hidden in the Finder by its flag; the commander goes by the leading dot.\n',
      { flaggedHidden: true },
    );
  }
  file('attributes/read-only.txt', 'A file no one may change.\n', {
    readOnly: true,
  });
  folder('attributes/empty-folder');
  folder('attributes/unreadable', { unreadable: true });
  file('attributes/unreadable/secret.txt', 'Never listed.\n');

  section(
    'links',
    'Links to a file and a folder, a broken one, one to a link, two pointing at each other, one to the unreadable folder and, on Windows, a junction. Windows makes links only in Developer Mode or for an administrator; the script says when it could not.',
  );
  file('links/target.txt', 'The file the links point to.\n');
  folder('links/target-folder');
  file('links/target-folder/inside.txt', '');
  for (const [name, target, isFolder] of [
    ['link-to-file.txt', 'target.txt', false],
    ['link-to-folder', 'target-folder', true],
    ['broken-link.txt', 'missing.txt', false],
    ['link-to-link.txt', 'link-to-file.txt', false],
    ['loop-a', 'loop-b', false],
    ['loop-b', 'loop-a', false],
    ['link-to-unreadable', '../attributes/unreadable', true],
  ] as const) {
    items.push({
      kind: 'link',
      path: `links/${name}`,
      target,
      folder: isFolder,
    });
  }
  if (windows) {
    items.push({
      kind: 'junction',
      path: 'links/junction-to-folder',
      target: 'target-folder',
    });
  }

  section(
    'duplicates',
    'Files with copies of the same content under other names and in other folders, deeper ones for flat view, six copies of one text, files of one size that differ at their start or only past the first 64 KiB, a hard link to a file that has no copy, empty files and a link, to try Ctrl+Shift+G in the folder and in flat view.',
  );
  for (const where of [
    'duplicates/photo.jpg',
    'duplicates/photo (1).jpg',
    'duplicates/backup/photo.jpg',
    'duplicates/backup/2024/IMG_0412.jpg',
    'duplicates/deep/a/b/c/photo copy.jpg',
  ]) {
    file(where, photo);
  }
  const notes =
    'Meeting notes\n\n- Ship the duplicates view\n- Look at the scrollbars\n';
  for (const where of [
    'duplicates/notes.txt',
    'duplicates/archive/notes-old.md',
    'duplicates/archive/2025/notes.txt',
  ]) {
    file(where, notes);
  }
  for (let copy = 1; copy <= 6; copy++) {
    file(`duplicates/many/copy-${copy}.txt`, 'One of six copies.\n');
  }
  file('duplicates/same-size-a.txt', 'AAAA: the same size as b\n');
  file('duplicates/same-size-b.txt', 'BBBB: the same size as a\n');
  const sameStart = Buffer.alloc(64 * kib, 'x');
  file(
    'duplicates/same-start-a.bin',
    Buffer.concat([sameStart, Buffer.from('ends as a')]),
  );
  file(
    'duplicates/same-start-b.bin',
    Buffer.concat([sameStart, Buffer.from('ends as b')]),
  );
  file(
    'duplicates/same-start-copy-of-a.bin',
    Buffer.concat([sameStart, Buffer.from('ends as a')]),
  );
  file('duplicates/unique.txt', 'No other file holds this.\n');
  items.push({
    kind: 'hardLink',
    path: 'duplicates/hard-link-to-unique.txt',
    target: 'duplicates/unique.txt',
  });
  file('duplicates/empty-1.txt', '');
  file('duplicates/empty-2.txt', '');
  items.push({
    kind: 'link',
    path: 'duplicates/link-to-notes.txt',
    target: 'notes.txt',
    folder: false,
  });

  section(
    'executables',
    'A real program of the system, scripts with and without an extension, a macOS app, a Linux launcher, a script without its exec bit and a text file with one.',
  );
  items.push({
    kind: 'copy',
    path: windows ? 'executables/where.exe' : 'executables/echo',
    from: windows
      ? path.join(
          process.env.SystemRoot ?? 'C:\\Windows',
          'System32',
          'where.exe',
        )
      : '/bin/echo',
  });
  file('executables/tool', '#!/bin/sh\necho "a tool without an extension"\n', {
    mode: 0o755,
  });
  file('executables/python3.12', '#!/bin/sh\necho "a versioned program"\n', {
    mode: 0o755,
  });
  file('executables/build.sh', '#!/bin/sh\necho "built"\n', { mode: 0o755 });
  file(
    'executables/start.command',
    '#!/bin/sh\necho "started from the Finder"\n',
    { mode: 0o755 },
  );
  file('executables/not-executable.sh', '#!/bin/sh\necho "no exec bit"\n', {
    mode: 0o644,
  });
  file(
    'executables/notes-with-exec-bit.txt',
    'A text file with its exec bit set.\n',
    { mode: 0o755 },
  );
  file('executables/build.bat', '@echo off\necho built\n');
  file('executables/build.cmd', '@echo off\necho built\n');
  file('executables/build.ps1', 'Write-Output "built"\n');
  file(
    'executables/playground.desktop',
    '[Desktop Entry]\nType=Application\nName=Playground\nExec=echo playground\n',
    { mode: 0o755 },
  );
  folder('executables/Playground.app');
  file(
    'executables/Playground.app/Contents/Info.plist',
    '<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0"><dict><key>CFBundleExecutable</key><string>Playground</string></dict></plist>\n',
  );
  file(
    'executables/Playground.app/Contents/MacOS/Playground',
    '#!/bin/sh\necho "Hello from an app bundle"\n',
    { mode: 0o755 },
  );

  section(
    'formats',
    'Real files of common formats, which open in their apps with Enter: a Word document, a spreadsheet, rich text, an email, CSV with quoted fields, with semicolons and decimal commas as Excel writes in Hungary, separated by tabs, beyond ASCII, 200 columns wide and 100,000 rows long, a zip, a tar, a gzipped tar and file, and a WAV of one second.',
  );
  file('formats/letter.docx', () =>
    docx([
      'Dear playground,',
      'This document was written by the playground script.',
      'Árvíztűrő tükörfúrógép 😀',
    ]),
  );
  file('formats/budget.xlsx', () =>
    xlsx([
      ['Item', 'Cost'],
      ['Coffee', 4.5],
      ['Cake', 3.25],
    ]),
  );
  file(
    'formats/notes.rtf',
    '{\\rtf1\\ansi{\\fonttbl\\f0 Helvetica;}\\f0\\fs24 Notes in {\\b rich} text.\\par}\n',
  );
  file(
    'formats/reply.eml',
    'From: Playground <playground@example.com>\r\nTo: You <you@example.com>\r\nSubject: A saved email\r\nDate: Sun, 1 Feb 2026 09:30:00 +0000\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nAn email saved as a file.\r\n',
  );
  file(
    'formats/data.csv',
    'name,branches,tags\nplayground,47,true\nfiles,0,false\n',
  );

  for (const [name, content] of Object.entries(csvFiles)) {
    file(`formats/${name}`, content);
  }
  file('formats/csv-of-100000-rows.csv', () => csvRows(100_000));

  const packed = [
    { name: 'readme.txt', content: 'Packed by the playground.\n' },
    { name: 'folder/inside.txt', content: 'In a folder.\n' },
    { name: 'ünïcödé – 名前.txt', content: 'A name beyond ASCII.\n' },
  ];
  file('formats/bundle.zip', () => zip(packed));
  file('formats/bundle.tar', () => tar(packed));
  file('formats/bundle.tar.gz', () => gzip(tar(packed)));
  file('formats/notes.txt.gz', () => gzip(lines(1000, (i) => sentence(i, 8))));

  file('formats/tone.wav', () => wav(1, 440));
}
