import { dotnetFiles } from './dotnetSamples.mts';
import { pdf, png, shade } from './formats.mts';
import { images } from './gitImages.mts';
import { decoded, plainPng, vector } from './imageSamples.mts';
import type { Content } from './planContents.mts';

const plan = `# Plan

The plan the canvas every-attribute.canvas points at twice: at its Steps by a heading, and at one line of them by the id of its block.

## Goals

- Read every attribute of JSON Canvas
- Draw each node where the file puts it
- Write the canvas back as it was read

## Steps

1. Open every-attribute.canvas with Open with Canvas
2. Open each file node with Enter or a double click
3. Move a node, save, and compare the lines that changed

Each file node opens the file it names in this folder. ^3f1c2a

## Notes

What else is here: [[readme]], notes.txt and data.csv.
`;

const readme = `# Resources

The files the canvases of this folder point at, so every file node and every group background opens something:

| File | Kind |
| --- | --- |
| Plan.md | Markdown, with a heading and a block a node points at |
| readme.md | Markdown |
| notes.txt | Plain text |
| data.csv | Comma-separated values |
| Program.cs | C# |
| app.ts | TypeScript |
| photo.png, wide.png, cork.png | PNG images |
| sky.jpg | A JPEG photo |
| diagram.svg | A vector image |
| paper.pdf, handout.pdf | PDFs |
`;

const notes = `Notes taken while trying the canvas

- Pan with Space and a drag, or the wheel.
- Zoom with Ctrl and the wheel, around the pointer.
- A file node shows the head of its file, a link node the title of its page.
- Groups hold the nodes that lie wholly inside them.
`;

const data = `name,kind,bytes,opened
Plan.md,markdown,612,yes
readme.md,markdown,598,yes
notes.txt,text,236,no
data.csv,csv,190,no
Program.cs,csharp,540,yes
app.ts,typescript,402,no
`;

const app = `interface CanvasNode {
  readonly id: string;
  readonly type: 'text' | 'file' | 'link' | 'group';
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export function bounds(nodes: readonly CanvasNode[]) {
  const left = Math.min(...nodes.map((node) => node.x));
  const top = Math.min(...nodes.map((node) => node.y));
  const right = Math.max(...nodes.map((node) => node.x + node.width));
  const bottom = Math.max(...nodes.map((node) => node.y + node.height));
  return { left, top, width: right - left, height: bottom - top };
}
`;

const cork = () =>
  png(64, 64, (x, y) => {
    const grain = Math.abs(
      Math.sin(x * 91 + y * 47) * Math.cos(x * 13 - y * 29),
    );
    return [shade(0.62 + grain * 0.2), shade(0.45 + grain * 0.15), shade(0.3)];
  });

export const obsidianResources: Readonly<Record<string, () => Content>> = {
  'Plan.md': () => plan,
  'readme.md': () => readme,
  'notes.txt': () => notes,
  'data.csv': () => data,
  'Program.cs': () => dotnetFiles['Program.cs'] ?? '',
  'app.ts': () => app,
  'photo.png': () => plainPng(320, 200, 210),
  'wide.png': () => plainPng(480, 160, 30),
  'cork.png': cork,
  'sky.jpg': () => decoded(images.jpg[0] ?? ''),
  'diagram.svg': () => vector('#06c'),
  'paper.pdf': () =>
    pdf([
      {
        lines: [
          'A paper the canvas points at',
          '',
          'Its first page, as a file node shows the head of a file.',
        ],
      },
      {
        lines: ['Its second page', '', 'Opened with Enter on its node.'],
      },
    ]),
  'handout.pdf': () =>
    pdf([
      {
        lines: [
          'A handout of one page',
          '',
          'Every file of the resources folder opens from a node.',
        ],
      },
    ]),
};
