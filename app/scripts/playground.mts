import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { deflateSync } from 'node:zlib';
import { images } from './playground-images.mts';

const flags = new Set(
  process.argv.slice(2).filter((arg) => arg.startsWith('--')),
);
const [given] = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const folder = path.resolve(
  given ?? path.join(import.meta.dirname, '..', '..', '..'),
);
const sibling = (suffix: string) =>
  path.join(folder, `Fastforward-playground${suffix}`);
const local = sibling('');
const remote = sibling('-remote.git');
const worktree = sibling('-worktree');
const conflict = sibling('-conflict');
const rebasing = sibling('-rebasing');
const detached = sibling('-detached');
const shallow = sibling('-shallow');
const partial = sibling('-partial');
const empty = sibling('-empty');
const noRemote = sibling('-no-remote');
const upstream = sibling('-upstream.git');
const marker = 'fastforward.playground';
const copies = 10;
const longHistory = 50_000;

const identity = {
  GIT_AUTHOR_NAME: 'Playground',
  GIT_AUTHOR_EMAIL: 'playground@example.com',
  GIT_COMMITTER_NAME: 'Playground',
  GIT_COMMITTER_EMAIL: 'playground@example.com',
  GIT_AUTHOR_DATE: '2026-02-01T00:00:00Z',
  GIT_COMMITTER_DATE: '2026-02-01T00:00:00Z',
};

const git = (cwd: string, args: readonly string[], input?: string | Buffer) =>
  execFileSync('git', ['-c', 'core.safecrlf=false', ...args], {
    cwd,
    input,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, ...identity },
    stdio: ['pipe', 'pipe', 'inherit'],
  });

const realPath = (where: string) => {
  try {
    return fs.realpathSync.native(where);
  } catch {
    return path.resolve(where);
  }
};

const samePath = (a: string, b: string) =>
  path.relative(realPath(a), realPath(b)) === '';

const madeHere = (repository: string, commonDir: string) => {
  try {
    const common = path.resolve(
      repository,
      git(repository, ['rev-parse', '--git-common-dir']).trim(),
    );
    return (
      samePath(common, commonDir) &&
      git(repository, ['config', '--get', marker]).trim() === 'true'
    );
  } catch {
    return false;
  }
};

const localGit = path.join(local, '.git');
const ours = [
  ...[worktree, conflict, rebasing, detached].map((tree) => [tree, localGit]),
  [local, localGit],
  [remote, remote],
  [upstream, upstream],
  ...[shallow, partial, empty, noRemote].map((repository) => [
    repository,
    path.join(repository, '.git'),
  ]),
];
for (const [repository, commonDir] of ours) {
  if (fs.existsSync(repository) && !madeHere(repository, commonDir)) {
    console.error(
      `${repository} wasn't made by this script, so it is left alone. Move it away to make the playground.`,
    );
    process.exit(1);
  }
}
for (const [repository] of ours) {
  fs.rmSync(repository, { recursive: true, force: true });
}

const stream: Buffer[] = [];
let mark = 0;
let minute = 0;
const data = (value: string | Buffer) => {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
  return [Buffer.from(`data ${bytes.length}\n`), bytes, Buffer.from('\n')];
};
const write = (...parts: (string | Buffer[])[]) => {
  for (const part of parts) {
    if (Array.isArray(part)) {
      stream.push(...part);
    } else {
      stream.push(Buffer.from(part));
    }
  }
};
const signature = () => {
  minute++;
  return `Playground <playground@example.com> ${1767225600 + minute * 60} +0000`;
};

const sourcePath = (file: string) =>
  /[ "\\\n]/.test(file) ? JSON.stringify(file) : file;

type Change =
  | { readonly delete: string }
  | { readonly rename: readonly [string, string] }
  | { readonly copy: readonly [string, string] }
  | {
      readonly path: string;
      readonly content: string | Buffer;
      readonly mode?: string;
    };

interface Commit {
  readonly from?: number;
  readonly merges?: readonly number[];
  readonly changes?: readonly Change[];
  readonly message: string;
  readonly author?: string;
}

function commit(
  ref: string,
  { from, merges = [], changes = [], message, author }: Commit,
) {
  mark++;
  write(
    `commit ${ref}\nmark :${mark}\nauthor ${author ?? signature()}\ncommitter ${author ?? signature()}\n`,
    data(message),
    from ? `from :${from}\n` : '',
    ...merges.map((other) => `merge :${other}\n`),
  );
  for (const change of changes) {
    if ('delete' in change) {
      write(`D ${change.delete}\n`);
    } else if ('rename' in change) {
      write(`R ${sourcePath(change.rename[0])} ${change.rename[1]}\n`);
    } else if ('copy' in change) {
      write(`C ${sourcePath(change.copy[0])} ${change.copy[1]}\n`);
    } else {
      write(
        `M ${change.mode ?? '100644'} inline ${change.path}\n`,
        data(change.content),
      );
    }
  }
  write('\n');
  return mark;
}

const lightweight = (name: string, at: number) =>
  write(`reset refs/tags/${name}\nfrom :${at}\n\n`);
const annotated = (name: string, at: number, message: string) =>
  write(`tag ${name}\nfrom :${at}\ntagger ${signature()}\n`, data(message));
const pointer = (ref: string, at: number) =>
  write(`reset ${ref}\nfrom :${at}\n\n`);
const searchable = (subject: string, words: readonly string[]) =>
  `${subject}\n\nSearch for: ${words.join(', ')}.\n`;

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return c >>> 0;
});
const crc32 = (bytes: Buffer) => {
  let c = 0xffffffff;
  for (const byte of bytes) {
    c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
};
const pngChunk = (type: string, body: Buffer) => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length);
  const typed = Buffer.concat([Buffer.from(type), body]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed));
  return Buffer.concat([length, typed, crc]);
};
type Color = (x: number, y: number) => readonly [number, number, number];

const png = (width: number, height: number, color: Color) => {
  const rows = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1);
    for (let x = 0; x < width; x++) {
      rows.set(color(x / width, y / height), row + 1 + x * 3);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(rows)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
};
const shade = (value: number) => Math.round(255 * value);
const binary = (length: number, seed: number) => {
  const bytes = Buffer.alloc(length);
  let state = seed;
  for (let i = 0; i < length; i++) {
    state = (state * 1103515245 + 12345) >>> 0;
    bytes[i] = state >>> 24;
  }
  return bytes;
};
const words = ['fast', 'forward', 'commit', 'branch', 'merge', 'rebase', 'tag'];
const sentence = (seed: number, count: number) =>
  Array.from(
    { length: count },
    (_, i) => words[(seed + i * 3) % words.length],
  ).join(' ');

const samples = {
  'samples/app.ts': [
    'export function greet(name: string): string {\n  return `Hello, ${name}!`;\n}\n',
    "export function greet(name: string, excited = false): string {\n  return `Hello, ${name}${excited ? '!' : '.'}`;\n}\n",
  ],
  'samples/main.py': [
    'def greet(name):\n    return f"Hello, {name}!"\n\n\nprint(greet("world"))\n',
    'def greet(name: str, excited: bool = False) -> str:\n    return f"Hello, {name}{\'!\' if excited else \'.\'}"\n\n\nprint(greet("world", True))\n',
  ],
  'samples/lib.rs': [
    'pub fn greet(name: &str) -> String {\n    format!("Hello, {name}!")\n}\n',
    'pub fn greet(name: &str, excited: bool) -> String {\n    format!("Hello, {name}{}", if excited { "!" } else { "." })\n}\n',
  ],
  'samples/main.go': [
    'package main\n\nimport "fmt"\n\nfunc main() {\n\tfmt.Println("Hello, world!")\n}\n',
    'package main\n\nimport "fmt"\n\nfunc main() {\n\tname := "world"\n\tfmt.Printf("Hello, %s!\\n", name)\n}\n',
  ],
  'samples/Program.cs': [
    'Console.WriteLine("Hello, world!");\n',
    'var name = args.Length > 0 ? args[0] : "world";\nConsole.WriteLine($"Hello, {name}!");\n',
  ],
  'samples/style.css': [
    '.greeting {\n  color: #06c;\n  font-weight: bold;\n}\n',
    '.greeting {\n  color: #c60;\n  font-weight: 600;\n  letter-spacing: 0.02em;\n}\n',
  ],
  'samples/data.json': [
    '{\n  "name": "playground",\n  "branches": 40\n}\n',
    '{\n  "name": "playground",\n  "branches": 47,\n  "tags": true\n}\n',
  ],
  'samples/script.sh': [
    '#!/bin/sh\necho "Hello, world!"\n',
    '#!/bin/sh\nname="${1:-world}"\necho "Hello, $name!"\n',
  ],
};

const readme = `# Playground

Made by \`npm run playground\` to try **Fastforward** by hand.

## What is here

- Branches lagging behind, ahead of and diverged from their upstreams
- Branches never pushed, and tags only here
- Merges, stashes and uncommitted changes

## Bubbles

| Kind | Example |
|---|---|
| Branch | \`lagging-01\` |
| Tag | \`release-1\` |

\`\`\`ts
export function greet(name: string): string {
  return \`Hello, \${name}!\`;
}
\`\`\`

> Rebuild it whenever you like.

![Logo](images/logo.png)
`;

let main = commit('refs/heads/main', {
  changes: [{ path: 'README.md', content: readme }],
  message: 'Start the playground',
});
const first = main;
const notes = [];
let noteText = '';
for (let note = 1; note <= 6; note++) {
  noteText += `note ${note}\n`;
  main = commit('refs/heads/main', {
    from: main,
    changes: [{ path: 'notes.txt', content: noteText }],
    message: `Add note ${note}`,
  });
  notes.push(main);
}
lightweight('release-1', notes[1]);
annotated('release-2', notes[3], 'Release 2');
lightweight('release-3', notes[5]);
for (let k = 1; k <= copies; k++) {
  lightweight(
    `draft-${String(k).padStart(2, '0')}`,
    notes[notes.length - 1 - ((k - 1) % notes.length)],
  );
}
lightweight('moved', notes[2]);
pointer('refs/playground/tags/moved', notes[4]);

main = commit('refs/heads/main', {
  from: main,
  changes: [
    ...Object.entries(samples).map(([file, [original]]) => ({
      path: file,
      content: original,
    })),
    { path: 'samples/old-name.txt', content: 'This file is renamed later.\n' },
    { path: 'samples/obsolete.txt', content: 'This file is deleted later.\n' },
  ],
  message: searchable('Add code samples in several languages', [
    'code',
    'syntax',
    'language',
    'typescript',
    'python',
    'rust',
    'go',
    'csharp',
    'css',
    'json',
    'shell',
  ]),
});
const piled = main;
for (let pile = 1; pile <= 6; pile++) {
  lightweight(`pile-${pile}`, piled);
}
main = commit('refs/heads/main', {
  from: main,
  changes: Object.entries(samples).map(([file, [, second]]) => ({
    path: file,
    content: second,
  })),
  message: searchable('Change every code sample', [
    'code',
    'syntax',
    'word diff',
    'change',
  ]),
});
main = commit('refs/heads/main', {
  from: main,
  changes: [
    {
      path: 'images/logo.png',
      content: png(64, 64, (x, y) => [
        shade(x * 0.2),
        shade(0.4 + y * 0.3),
        204,
      ]),
    },
  ],
  message: searchable('Add a logo', ['image', 'picture', 'png', 'logo']),
});
main = commit('refs/heads/main', {
  from: main,
  changes: [
    {
      path: 'images/logo.png',
      content: png(64, 64, (x, y) => [
        204,
        shade(0.4 + y * 0.3),
        shade(x * 0.2),
      ]),
    },
    {
      path: 'images/photo.png',
      content: png(256, 160, (x, y) => [shade(x), shade(y), shade(1 - x * y)]),
    },
  ],
  message: searchable('Recolor the logo and add a photo', [
    'image',
    'picture',
    'png',
    'logo',
    'photo',
    'change',
  ]),
});
main = commit('refs/heads/main', {
  from: main,
  changes: [{ path: 'samples/data.bin', content: binary(4096, 1) }],
  message: searchable('Add a binary file', ['binary', 'bin']),
});
main = commit('refs/heads/main', {
  from: main,
  changes: [{ path: 'samples/data.bin', content: binary(4096, 2) }],
  message: searchable('Change the binary file', ['binary', 'bin', 'change']),
});
main = commit('refs/heads/main', {
  from: main,
  changes: [
    {
      path: 'long-lines.txt',
      content:
        Array.from({ length: 20 }, (_, i) => sentence(i, 250)).join('\n') +
        '\n',
    },
    {
      path: 'large.txt',
      content:
        Array.from(
          { length: 40_000 },
          (_, i) => `line ${i + 1}: ${sentence(i, 8)}`,
        ).join('\n') + '\n',
    },
  ],
  message: searchable('Add a file of very long lines and a large file', [
    'long line',
    'wrap',
    'large',
    'big',
    'size',
  ]),
});
main = commit('refs/heads/main', {
  from: main,
  changes: [
    { path: 'notes with spaces.txt', content: 'A name with spaces.\n' },
    {
      path: 'ünïcödé – 名前.md',
      content: '# Ünïcödé\n\nA name beyond ASCII.\n',
    },
  ],
  message: searchable(
    'Add files whose names have spaces and characters beyond ASCII',
    ['unicode', 'spaces', 'name', 'non-ascii'],
  ),
});
main = commit('refs/heads/main', {
  from: main,
  changes: [{ rename: ['samples/old-name.txt', 'samples/new-name.txt'] }],
  message: searchable('Rename a sample', ['rename', 'renamed', 'move']),
});
main = commit('refs/heads/main', {
  from: main,
  changes: [{ delete: 'samples/obsolete.txt' }],
  message: searchable('Delete an obsolete sample', [
    'delete',
    'deleted',
    'remove',
  ]),
});

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
onMain(
  searchable('Add three thousand files at once', [
    'many files',
    'bulk',
    'thousands',
  ]),
  Array.from({ length: 3000 }, (_, i) => ({
    path: `bulk/file-${String(i + 1).padStart(4, '0')}.txt`,
    content: `file ${i + 1}\n`,
  })),
);

const everything = `# Everything Markdown renders

Text with *emphasis*, **strong**, ~~strike~~, \`inline code\` and a [link](https://example.com).
A bare address becomes a link too: https://example.com/docs

## Lists

- One
  - Nested
    - Deeper
- Two

1. First
2. Second

- [x] A task done
- [ ] A task left

## Table

| Left | Center | Right |
|:-----|:------:|------:|
| a | b | c |
| longer cell | 42 | 3.14 |

## Code

\`\`\`ts
export const answer: number = 42;
\`\`\`

\`\`\`python
print("Hello, world!")
\`\`\`

\`\`\`diff
- removed
+ added
\`\`\`

\`\`\`
no language at all
\`\`\`

## Quotes

> A quote
>> A quote in a quote

---

## HTML GitHub keeps

<details><summary>Click to open</summary>

Hidden until opened.

</details>

Press <kbd>Ctrl</kbd>+<kbd>C</kbd>, write H<sub>2</sub>O and E = mc<sup>2</sup>.

## Images

![The playground logo](../../images/logo.png)
`;
const everythingChanged = everything
  .replace('- Two', '- Two\n- Three, new')
  .replace('| a | b | c |', '| a | b | c |\n| added | row | 7 |')
  .replace('Hidden until opened.', 'Hidden until opened, and changed.');
const languages = {
  'sample.html': '<!doctype html>\n<p class="greeting">Hello, world!</p>\n',
  'sample.xml': '<greeting to="world">Hello</greeting>\n',
  'sample.yaml': 'greeting:\n  to: world\n  excited: true\n',
  'sample.toml': '[greeting]\nto = "world"\nexcited = true\n',
  'sample.sql': "SELECT 'Hello, world!' AS greeting;\n",
  'Sample.java':
    'class Sample {\n  public static void main(String[] args) {\n    System.out.println("Hello, world!");\n  }\n}\n',
  'sample.kt': 'fun main() {\n    println("Hello, world!")\n}\n',
  'sample.swift': 'print("Hello, world!")\n',
  'sample.rb': 'puts "Hello, world!"\n',
  'sample.php': '<?php\necho "Hello, world!";\n',
  'sample.c':
    '#include <stdio.h>\n\nint main(void) {\n  puts("Hello, world!");\n}\n',
  'sample.cpp':
    '#include <iostream>\n\nint main() {\n  std::cout << "Hello, world!\\n";\n}\n',
  'sample.h': '#pragma once\n\nvoid greet(const char *world);\n',
  'sample.lua': 'print("Hello, world!")\n',
  'sample.ps1': 'Write-Output "Hello, world!"\n',
  'sample.bat': '@echo off\necho Hello, world!\n',
  'sample.ini': '[greeting]\nto=world\n',
  'sample.diff':
    '--- a/world\n+++ b/world\n@@ -1 +1 @@\n-Hello\n+Hello, world!\n',
  'sample.graphql': 'query Greeting {\n  world { hello }\n}\n',
  'Sample.vue':
    '<template>\n  <p>Hello, {{ world }}!</p>\n</template>\n\n<script setup>\nconst world = "world";\n</script>\n',
  'Sample.svelte':
    '<script>\n  let world = "world";\n</script>\n\n<p>Hello, {world}!</p>\n',
  'sample.tsx':
    'export const Greeting = () => <p className="greeting">Hello, world!</p>;\n',
  'sample.jsx': 'export const Greeting = () => <p>Hello, world!</p>;\n',
  'sample.scss': '$world: #06c;\n\n.greeting {\n  color: $world;\n}\n',
  'sample.less': '@world: #06c;\n\n.greeting {\n  color: @world;\n}\n',
  'sample.r': 'print("Hello, world!")\n',
  'sample.jl': 'println("Hello, world!")\n',
  'sample.hs': 'main :: IO ()\nmain = putStrLn "Hello, world!"\n',
  'sample.ex': 'IO.puts("Hello, world!")\n',
  'sample.dart': "void main() {\n  print('Hello, world!');\n}\n",
  'sample.scala': '@main def hello() = println("Hello, world!")\n',
  'sample.pl': 'print "Hello, world!\\n";\n',
  'sample.zig':
    'const std = @import("std");\n\npub fn main() void {\n    std.debug.print("Hello, world!\\n", .{});\n}\n',
  Dockerfile: 'FROM alpine\nCMD ["echo", "Hello, world!"]\n',
  Makefile: 'world:\n\techo "Hello, world!"\n',
};
const vector = (fill: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">\n  <rect width="96" height="96" rx="16" fill="#eee"/>\n  <circle cx="48" cy="48" r="32" fill="${fill}"/>\n</svg>\n`;
const decoded = (text: string) => Buffer.from(text, 'base64');
const imageKinds = [
  {
    extension: 'png',
    terms: ['png', 'portable network graphics'],
    versions: () => [
      png(48, 48, (x, y) => [shade(x * 0.3), shade(0.4 + y * 0.4), 200]),
      png(48, 48, (x, y) => [220, shade(0.4 + y * 0.4), shade(x * 0.3)]),
    ],
  },
  {
    extension: 'jpg',
    terms: ['jpg', 'jpeg', 'photo'],
    versions: () => images.jpg.map(decoded),
  },
  {
    extension: 'jpeg',
    terms: ['jpeg', 'jpg', 'photo'],
    versions: () => images.jpeg.map(decoded),
  },
  { extension: 'gif', terms: ['gif'], versions: () => images.gif.map(decoded) },
  {
    extension: 'webp',
    terms: ['webp'],
    versions: () => images.webp.map(decoded),
  },
  {
    extension: 'avif',
    terms: ['avif'],
    versions: () => images.avif.map(decoded),
  },
  {
    extension: 'bmp',
    terms: ['bmp', 'bitmap'],
    versions: () => images.bmp.map(decoded),
  },
  {
    extension: 'ico',
    terms: ['ico', 'icon', 'favicon'],
    versions: () => images.ico.map(decoded),
  },
  {
    extension: 'svg',
    terms: ['svg', 'vector', 'xml'],
    versions: () => [vector('#06c'), vector('#c60')],
  },
];
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
    { path: 'showcase/images/animated.gif', content: decoded(images.animated) },
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
const manyLines = (word: string) =>
  `${Array.from({ length: 30_000 }, (_, i) => `${word} ${i + 1}`).join('\n')}\n`;
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
    ].map(([from, to]): Change => ({ rename: [everyWay(from), everyWay(to)] })),
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

let feature = main;
let featureText = '';
for (let step = 1; step <= 2; step++) {
  featureText += `feature step ${step}\n`;
  feature = commit('refs/playground/merged', {
    from: feature,
    changes: [{ path: 'merged/feature.txt', content: featureText }],
    message: `Build the merged feature, step ${step}`,
  });
}
main = commit('refs/heads/main', {
  from: main,
  merges: [feature],
  changes: [{ path: 'merged/feature.txt', content: featureText }],
  message: searchable("Merge branch 'merged-feature'", ['merge', 'merged']),
});
const octopus = ['a', 'b', 'c'].map((part) =>
  commit(`refs/playground/octopus-${part}`, {
    from: main,
    changes: [
      { path: `merged/octopus-${part}.txt`, content: `octopus ${part}\n` },
    ],
    message: `Add octopus part ${part}`,
  }),
);
main = commit('refs/heads/main', {
  from: main,
  merges: octopus,
  changes: ['a', 'b', 'c'].map((part) => ({
    path: `merged/octopus-${part}.txt`,
    content: `octopus ${part}\n`,
  })),
  message: searchable(
    "Merge branches 'octopus-a', 'octopus-b' and 'octopus-c'",
    ['merge', 'octopus'],
  ),
});
let changelog = '';
for (const entry of ['the merges', 'the samples']) {
  changelog += `Noted ${entry}.\n`;
  main = commit('refs/heads/main', {
    from: main,
    changes: [{ path: 'CHANGELOG.md', content: changelog }],
    message: `Note ${entry} in the changelog`,
  });
}

const tracked = ['main'];
const appended = new Map<string, string>();
const append = (
  ref: string,
  from: number,
  file: string,
  k: number,
  what: string,
) => {
  let tip = from;
  let text = appended.get(`${from} ${file}`) ?? '';
  for (let j = 1; j <= k; j++) {
    text += `${what} ${j}\n`;
    tip = commit(ref, {
      from: tip,
      changes: [{ path: file, content: text }],
      message: `${what} (${j} of ${k})`,
    });
    appended.set(`${tip} ${file}`, text);
  }
  return tip;
};
const start = (name: string) => {
  const tip = commit(`refs/heads/${name}`, {
    from: main,
    changes: [{ path: `${name}.txt`, content: 'shared\n' }],
    message: `Start ${name}`,
  });
  appended.set(`${tip} ${name}.txt`, 'shared\n');
  pointer(`refs/playground/${name}`, tip);
  tracked.push(name);
  return tip;
};
const lagging = (name: string, k: number) =>
  append(
    `refs/playground/${name}`,
    start(name),
    `${name}.txt`,
    k,
    `Add work only the remote has to ${name}`,
  );
const ahead = (name: string, k: number) =>
  append(
    `refs/heads/${name}`,
    start(name),
    `${name}-mine.txt`,
    k,
    `Add unpushed work to ${name}`,
  );

for (let k = 1; k <= copies; k++) {
  const t = String(k).padStart(2, '0');
  lagging(`lagging-${t}`, k);
  ahead(`ahead-${t}`, k);
  const diverged = `diverged-${t}`;
  const base = start(diverged);
  append(
    `refs/playground/${diverged}`,
    base,
    `${diverged}.txt`,
    k,
    `Add work only the remote has to ${diverged}`,
  );
  append(
    `refs/heads/${diverged}`,
    base,
    `${diverged}-mine.txt`,
    k,
    `Add unpushed work to ${diverged}`,
  );
  append(
    `refs/heads/local-only-${t}`,
    main,
    `local-only-${t}.txt`,
    k,
    `Add unpushed work to local-only-${t}`,
  );
}
lagging('in-worktree', 2);
ahead('protected-ahead', 1);
const nested =
  'feature/team/a-very-long-branch-name-that-keeps-going-to-show-how-bubbles-wrap';
pointer(`refs/heads/${nested}`, main);
pointer(`refs/playground/${nested}`, main);
tracked.push(nested);
pointer('refs/heads/gone-upstream', main);
pointer('refs/heads/blocked-pull', main);
commit('refs/playground/blocked-pull', {
  from: main,
  changes: [
    {
      path: 'samples/style.css',
      content: `${samples['samples/style.css'][1]}\n.incoming {\n  color: green;\n}\n`,
    },
  ],
  message:
    'Change the style on the remote, where the working tree changes it too',
});
tracked.push('blocked-pull');
const remoteOnly = [1, 2, 3].map((n) => {
  const name = `remote-only-${n}`;
  commit(`refs/playground/${name}`, {
    from: main,
    changes: [{ path: `${name}.txt`, content: `only on the remote ${n}\n` }],
    message: `Add work only the remote has, on ${name}`,
  });
  return name;
});
for (let team = 1; team <= 10; team++) {
  for (let n = 1; n <= 30; n++) {
    pointer(
      `refs/heads/crowd/team-${String(team).padStart(2, '0')}/branch-${String((team - 1) * 30 + n).padStart(3, '0')}`,
      first,
    );
  }
}
let odd = main;
let oddText = '';
for (const [message, author] of [
  [
    'Explain in one very long subject line everything this commit does, why it does it, what it leaves for later, who asked for it in the first place, and when',
    undefined,
  ],
  [
    'Explain a change in a body\n\nThe subject stays short, and the body says the rest.\n\n- point one\n- point two\n',
    undefined,
  ],
  ['Celebrate the release 🎉🚀', undefined],
  [
    'Commit from far in the future, in an odd time zone',
    'Zoë Ångström 李 <zoe@example.com> 4070908800 +1345',
  ],
  [
    'Commit from long ago, in another odd time zone',
    'Playground <playground@example.com> 86400 -1200',
  ],
] as const) {
  oddText += `${message.split('\n')[0]}\n`;
  odd = commit('refs/heads/odd-commits', {
    from: odd,
    changes: [{ path: 'odd-commits.txt', content: oddText }],
    message,
    author,
  });
}
for (const [side, content] of [
  ['conflict-ours', 'ours\n'],
  ['conflict-theirs', 'theirs\n'],
  ['rebasing', 'rebasing\n'],
]) {
  commit(`refs/heads/${side}`, {
    from: main,
    changes: [{ path: 'conflict.txt', content }],
    message: `Write the ${side} side of a conflict`,
  });
}
if (flags.has('--large')) {
  let tip = main;
  for (let i = 1; i <= longHistory; i++) {
    tip = commit('refs/heads/long-history', {
      from: tip,
      changes: [{ path: 'long-history.txt', content: `step ${i}\n` }],
      message: `Take step ${i} of a long history`,
    });
  }
}
write('done\n');

fs.mkdirSync(local, { recursive: true });
git(folder, ['init', '--quiet', '--bare', '--initial-branch=main', remote]);
git(local, ['init', '--quiet', '--initial-branch=main']);
for (const repository of [local, remote]) {
  git(repository, ['config', marker, 'true']);
}
git(remote, ['config', 'uploadpack.allowFilter', 'true']);
git(
  local,
  ['-c', 'core.ignorecase=false', 'fast-import', '--quiet', '--done'],
  Buffer.concat(stream),
);
git(local, ['branch', '--force', 'follows-main', 'main~2']);
git(local, ['remote', 'add', 'origin', remote]);
git(local, [
  'push',
  '--quiet',
  'origin',
  'refs/heads/main:refs/heads/main',
  ...tracked
    .slice(1)
    .map((name) => `refs/playground/${name}:refs/heads/${name}`),
  ...[
    'release-1',
    'release-2',
    'release-3',
    'pile-1',
    'pile-2',
    'pile-3',
    'pile-4',
    'pile-5',
    'pile-6',
  ].map((tag) => `refs/tags/${tag}`),
  'refs/playground/tags/moved:refs/tags/moved',
  ...remoteOnly.map((name) => `refs/playground/${name}:refs/heads/${name}`),
]);
git(
  local,
  ['update-ref', '--stdin'],
  git(local, ['for-each-ref', '--format=delete %(refname)', 'refs/playground']),
);
git(local, ['fetch', '--quiet', 'origin']);
git(local, ['remote', 'set-head', 'origin', 'main']);
fs.writeFileSync(
  path.join(remote, 'hooks', 'pre-receive'),
  [
    '#!/bin/sh',
    'while read old new ref; do',
    '  if [ "$ref" = refs/heads/protected-ahead ]; then',
    '    echo "The playground\'s pre-receive hook protects protected-ahead, so this push is refused." >&2',
    '    exit 1',
    '  fi',
    'done',
    '',
  ].join('\n'),
  { mode: 0o755 },
);
const upstreamOf = (name: string, remoteName: string, merge: string) =>
  `[branch "${name}"]\n\tremote = ${remoteName}\n\tmerge = ${merge}\n`;
fs.appendFileSync(
  path.join(local, '.git', 'config'),
  [
    ...tracked.map((name) => upstreamOf(name, 'origin', `refs/heads/${name}`)),
    upstreamOf('gone-upstream', 'origin', 'refs/heads/gone-upstream'),
    upstreamOf('follows-main', '.', 'refs/heads/main'),
  ].join(''),
);

if (flags.has('--two-remotes')) {
  git(folder, ['init', '--quiet', '--bare', '--initial-branch=main', upstream]);
  git(upstream, ['config', marker, 'true']);
  git(local, [
    'push',
    '--quiet',
    upstream,
    'main:main',
    'main~1:refs/heads/upstream-only',
    'refs/tags/release-1',
  ]);
  git(local, ['remote', 'add', 'upstream', upstream]);
  git(local, ['fetch', '--quiet', 'upstream']);
  git(local, [
    'branch',
    '--quiet',
    '--track',
    'tracks-upstream',
    'upstream/main',
  ]);
}

git(local, ['reset', '--quiet', '--hard', 'main']);
git(local, ['worktree', 'add', '--quiet', worktree, 'in-worktree']);

const stops = (cwd: string, args: readonly string[]) => {
  try {
    execFileSync('git', args, {
      cwd,
      env: { ...process.env, ...identity },
      stdio: 'ignore',
    });
  } catch {
    return;
  }
  throw new Error(`git ${args.join(' ')} was meant to stop on a conflict.`);
};
git(local, ['worktree', 'add', '--quiet', conflict, 'conflict-ours']);
stops(conflict, ['merge', '--no-edit', 'conflict-theirs']);
git(local, ['worktree', 'add', '--quiet', rebasing, 'rebasing']);
stops(rebasing, ['rebase', 'conflict-theirs']);
git(local, ['worktree', 'add', '--quiet', '--detach', detached, 'main']);
for (const step of [1, 2]) {
  git(detached, [
    'commit',
    '--quiet',
    '--allow-empty',
    '--message',
    `Commit on no branch, step ${step} of 2`,
  ]);
}

const remoteUrl = pathToFileURL(remote).href;
git(folder, ['clone', '--quiet', '--depth', '20', remoteUrl, shallow]);
git(folder, ['clone', '--quiet', '--filter=blob:none', remoteUrl, partial]);
git(folder, ['clone', '--quiet', remote, noRemote]);
git(noRemote, ['remote', 'remove', 'origin']);
fs.mkdirSync(empty);
git(empty, ['init', '--quiet', '--initial-branch=main']);
for (const repository of [shallow, partial, noRemote, empty]) {
  git(repository, ['config', marker, 'true']);
}

const edit = (file: string, content: string) =>
  fs.writeFileSync(path.join(local, file), content);
edit('notes.txt', `${noteText}a note to stash\n`);
git(local, ['stash', 'push', '--quiet', '--message', 'Stash a note']);
edit('README.md', `${readme}\nA stashed line.\n`);
edit('scratch.txt', 'An untracked file, stashed too.\n');
git(local, [
  'stash',
  'push',
  '--quiet',
  '--include-untracked',
  '--message',
  'Stash a change with an untracked file',
]);
edit(
  'samples/app.ts',
  `${samples['samples/app.ts'][1]}\nexport const staged = true;\n`,
);
git(local, ['add', 'samples/app.ts']);
git(local, ['mv', 'samples/data.json', 'samples/settings.json']);
git(local, ['mv', 'samples/main.py', 'samples/greet.py']);
edit(
  'samples/greet.py',
  `${samples['samples/main.py'][1]}print(greet("staged"))\n`,
);
git(local, ['add', 'samples/greet.py']);
git(local, ['mv', 'samples/lib.rs', 'samples/greet.rs']);
edit(
  'samples/greet.rs',
  `${samples['samples/lib.rs'][1]}\npub const UNSTAGED: bool = true;\n`,
);
fs.mkdirSync(path.join(local, 'moved'));
git(local, ['mv', 'notes with spaces.txt', 'moved/notes with spaces.txt']);
edit('samples/added.txt', 'A file added and staged.\n');
git(local, ['add', 'samples/added.txt']);
git(local, ['rm', '--quiet', 'samples/Program.cs']);
fs.renameSync(
  path.join(local, 'samples', 'main.go'),
  path.join(local, 'samples', 'hello.go'),
);
edit(
  'samples/style.css',
  `${samples['samples/style.css'][1]}\n.unstaged {\n  color: red;\n}\n`,
);
fs.rmSync(path.join(local, 'samples', 'script.sh'));
edit('draft.md', '# Draft\n\nAn untracked file.\n');

console.log(
  `Made ${local}, with its remote and worktrees beside it: ${[remote, worktree, conflict, rebasing, detached, shallow, partial, empty, noRemote, ...(flags.has('--two-remotes') ? [upstream] : [])].map((made) => path.basename(made)).join(', ')}.`,
);
