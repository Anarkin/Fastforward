export const binary = (length: number, seed: number) => {
  const bytes = Buffer.alloc(length);
  let state = seed;
  for (let i = 0; i < length; i++) {
    state = (state * 1103515245 + 12345) >>> 0;
    bytes[i] = state >>> 24;
  }
  return bytes;
};
const words = ['fast', 'forward', 'commit', 'branch', 'merge', 'rebase', 'tag'];
export const sentence = (seed: number, count: number) =>
  Array.from(
    { length: count },
    (_, i) => words[(seed + i * 3) % words.length],
  ).join(' ');

export const everything = `# Everything Markdown renders

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
export const everythingChanged = everything
  .replace('- Two', '- Two\n- Three, new')
  .replace('| a | b | c |', '| a | b | c |\n| added | row | 7 |')
  .replace('Hidden until opened.', 'Hidden until opened, and changed.');
export const languages = {
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

const fence = '```';
export const diagrams = `# Diagrams

Mermaid diagrams are drawn; plain text diagrams stay as they are.

## A flowchart

${fence}mermaid
flowchart LR
  Page[Page] -- asks --> Main[Main process]
  Main -- checks --> Repository[(Repository)]
  Main -- runs --> Git{{git}}
  Git -- reads --> Repository
  Main -- sends rows --> Page
  Page -- tokenizes in --> Worker[Syntax worker]
${fence}

## A sequence diagram

${fence}mermaid
sequenceDiagram
  actor Person
  participant Page
  participant Main as Main process
  participant Remote
  Person->>Page: Pull
  Page->>Main: pull main
  Main->>Remote: git fetch --all
  Remote-->>Main: new commits
  Main->>Main: git merge --ff-only
  Main-->>Page: refs changed
  Page-->>Person: Pulled 3 commits
${fence}

## A state diagram

${fence}mermaid
stateDiagram-v2
  [*] --> Clean
  Clean --> Changed: edit a file
  Changed --> Staged: git add
  Staged --> Clean: git commit
  Changed --> Clean: git restore
  Staged --> Changed: git restore --staged
${fence}

## A diagram that cannot be drawn

${fence}mermaid
flowchart LR
  A -->
${fence}

## Plain text architecture

${fence}text
+--------------------------------------------------+
|                  Electron window                 |
|  +--------------------+   +-------------------+  |
|  |        Page        |   |   Syntax worker   |  |
|  |  React, markdown,  |-->|  shiki, Oniguruma |  |
|  |  images, diagrams  |<--|  TextMate grammars|  |
|  +---------^----------+   +-------------------+  |
+------------|-------------------------------------+
             | messages, checked on arrival
+------------v-------------------------------------+
|                   Main process                   |
|   history per worktree, refs, fetches, settings  |
+------------+--------------------------+----------+
             |                          |
        +----v----+               +-----v------+
        |   git   |-------------->| Repository |
        +---------+               +------------+
${fence}

${fence}text
 local                       origin
 -----                       ------
 main  o---o---o---o         main  o---o---o
                   \\                         \\
 topic              o---o    topic            o
                                              ^
            fetch  <------------------------- |
            push   -------------------------> |
${fence}

${fence}
Request flow, without a language

  [ Pull ] --> page --> main --> git fetch --all
                                   |
                                   v
                              git merge --ff-only
                                   |
                                   v
                     refs changed --> page redraws
${fence}
`;
