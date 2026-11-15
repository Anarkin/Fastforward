import { zstdCompressSync } from 'node:zlib';
import { gzip, sevenZipEncrypted, tar, zip } from './archiveFormats.mts';
import { docx } from './formats.mts';
import { codePage852 } from './encodings.mts';
import { sentence } from './samples.mts';
import { plainPng } from './imageSamples.mts';
import type { PlanBuilder, PlanOptions } from './filesPlan.mts';
import { lines } from './sizedContents.mts';
import { prose } from './planContents.mts';

export function planArchives(builder: PlanBuilder, options: PlanOptions): void {
  const { file, section } = builder;
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
}
