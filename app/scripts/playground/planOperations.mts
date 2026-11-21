import * as fs from 'node:fs';
import * as path from 'node:path';
import { encoded } from './encodings.mts';
import { dotnetPair } from './dotnetSamples.mts';
import { rustPair } from './rustSamples.mts';
import { binary } from './samples.mts';
import { emojiGrid } from './emojiGrid.mts';
import { asciiGrid } from './asciiGrid.mts';
import { imageKinds } from './imageSamples.mts';
import { paddedTable } from './paddedTable.mts';
import type { PlanBuilder, PlanOptions } from './filesPlan.mts';
import type { Content } from './planContents.mts';
import { appRoot, realSources } from './appFacts.mts';
import { mib, gib, lines, randomOfSize } from './sizedContents.mts';
import { unicodeText, changedCode, prose, three } from './planContents.mts';

export function planOperations(
  builder: PlanBuilder,
  options: PlanOptions,
): void {
  const { pairs, file, chunks, section } = builder;
  const { large } = options;
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
  pair('ascii', ['v1.md', asciiGrid(1)], ['v2.md', asciiGrid(2)]);
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
}
