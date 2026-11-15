import { png, shade } from './formats.mts';
import { changesOnMain } from './gitChanges.mts';
import {
  annotated,
  commit,
  lightweight,
  pointer,
  searchable,
} from './gitImport.mts';
import { binary, sentence } from './samples.mts';

export const copies = 10;

export const samples = {
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

export const readme = `# Playground

Made by \`npm run playground:git\` to try **Fastforward** by hand.

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

export const pushedTags = [
  'release-1',
  'release-2',
  'release-3',
  'pile-1',
  'pile-2',
  'pile-3',
  'pile-4',
  'pile-5',
  'pile-6',
];

export function historyOfMain() {
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
      {
        path: 'samples/old-name.txt',
        content: 'This file is renamed later.\n',
      },
      {
        path: 'samples/obsolete.txt',
        content: 'This file is deleted later.\n',
      },
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
        content: png(256, 160, (x, y) => [
          shade(x),
          shade(y),
          shade(1 - x * y),
        ]),
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

  main = changesOnMain(main);

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
  return { main, first, noteText };
}
