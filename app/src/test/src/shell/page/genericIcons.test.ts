import * as assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { suite, test } from 'vitest';
import {
  iconOutlines,
  showGenericIcons,
} from '../../../../shell/page/genericIcons';

type Page = Parameters<typeof showGenericIcons>[0];

function posingAsPage(fake: object): Page {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return fake as unknown as Page;
}

function fakePage(look: { color: string; opacity: string; ratio: number }) {
  const variables = new Map<string, string>();
  const listeners = new Map<string, () => void>();
  const page = {
    get devicePixelRatio() {
      return look.ratio;
    },
    Path2D: class {
      constructor(readonly path: string) {}
    },
    matchMedia: (query: string) => ({
      addEventListener: (_type: string, listener: () => void) =>
        listeners.set(query, listener),
      removeEventListener: () => listeners.delete(query),
    }),
    getComputedStyle: () => ({ color: look.color, opacity: look.opacity }),
    document: {
      body: { append: () => undefined },
      documentElement: {
        style: {
          setProperty: (name: string, value: string) =>
            variables.set(name, value),
        },
      },
      createElement: (tag: string) => {
        if (tag !== 'canvas') {
          return { style: {}, remove: () => undefined };
        }
        const done: string[] = [];
        const context = {
          lineWidth: 0,
          lineCap: '',
          lineJoin: '',
          globalAlpha: 1,
          globalCompositeOperation: 'source-over',
          fillStyle: '',
          scale: (x: number, y: number) => done.push(`scale ${x} ${y}`),
          stroke: (path: { path: string }) =>
            done.push(
              `stroke ${context.lineWidth} ${context.lineCap} ${context.lineJoin} ${path.path}`,
            ),
          fillRect: (...box: number[]) =>
            done.push(
              `fill ${context.globalCompositeOperation} ${context.fillStyle} ${context.globalAlpha} ${box.join(' ')}`,
            ),
        };
        const canvas = {
          width: 0,
          height: 0,
          getContext: () => context,
          toDataURL: () =>
            `${canvas.width}x${canvas.height} ${done.join('; ')}`,
        };
        return canvas;
      },
    },
  };
  return { page: posingAsPage(page), variables, listeners };
}

const file = iconOutlines.file
  .map((path) => `stroke 1.2 round round ${path}`)
  .join('; ');

const folder = iconOutlines.folder
  .map((path) => `stroke 1.2 round round ${path}`)
  .join('; ');

suite('Generic file icons', () => {
  test('draws the outline of a file and of a folder once for the page, as large as 16 pixels are on its screen, in the muted color of the theme and dimmed as hidden files are, and hands them to the styles as images, so a row shows its icon as a background of its own rather than cut out of a color by a mask, which had the browser paint a layer for each icon, 1.4 ms of every step of a folder of 20,000 files dragged by its scrollbar', () => {
    const { page, variables } = fakePage({
      color: 'color(srgb 0 0 0 / 0.45)',
      opacity: '0.5',
      ratio: 1.25,
    });
    showGenericIcons(page);
    assert.deepStrictEqual(Object.fromEntries(variables), {
      '--device-pixel': '0.8px',
      '--file-icon': `url("20x20 scale 1.25 1.25; ${file}; fill source-in color(srgb 0 0 0 / 0.45) 1 0 0 16 16")`,
      '--folder-icon': `url("20x20 scale 1.25 1.25; ${folder}; fill source-in color(srgb 0 0 0 / 0.45) 1 0 0 16 16")`,
      '--hidden-file-icon': `url("20x20 scale 1.25 1.25; ${file}; fill source-in color(srgb 0 0 0 / 0.45) 0.5 0 0 16 16")`,
      '--hidden-folder-icon': `url("20x20 scale 1.25 1.25; ${folder}; fill source-in color(srgb 0 0 0 / 0.45) 0.5 0 0 16 16")`,
    });
  });

  test('draws them again once the theme turns dark or light and once the window comes to a screen of another scale, as the icons of a light theme stayed dark on a dark one, and those of one scale blurred at another', () => {
    const look = { color: 'rgb(0, 0, 0)', opacity: '0.5', ratio: 1 };
    const { page, variables, listeners } = fakePage(look);
    const stop = showGenericIcons(page);
    assert.match(
      variables.get('--file-icon') ?? '',
      /^url\("16x16 scale 1 1; .* rgb\(0, 0, 0\) 1 /,
    );

    look.color = 'rgb(255, 255, 255)';
    listeners.get('(prefers-color-scheme: dark)')?.();
    assert.match(
      variables.get('--file-icon') ?? '',
      / rgb\(255, 255, 255\) 1 /,
    );

    look.ratio = 1.5;
    listeners.get('(resolution: 1dppx)')?.();
    assert.match(
      variables.get('--folder-icon') ?? '',
      /^url\("24x24 scale 1.5 1.5; /,
    );

    stop();
    assert.deepStrictEqual([...listeners.keys()], []);
  });

  test('draws the outlines the masks of the other lists cut out of a color, path for path, so a file looks alike in the commander and in a list of git', () => {
    const css = readFileSync(
      join(__dirname, '../../../../shell/page/window.css'),
      'utf8',
    );
    const pathsOf = (name: string) => {
      const image = new RegExp(`--${name}-outline: url\\("([^"]*)"\\)`).exec(
        css,
      );
      return [
        ...decodeURIComponent(image?.[1] ?? '').matchAll(/ d='([^']*)'/g),
      ].map((match) => match[1]);
    };
    assert.deepStrictEqual(
      { file: pathsOf('file'), folder: pathsOf('folder') },
      { file: [...iconOutlines.file], folder: [...iconOutlines.folder] },
    );
    for (const name of ['file', 'folder']) {
      assert.match(
        css,
        new RegExp(
          `--${name}-outline: url\\("[^"]*viewBox='0 0 16 16' fill='none' stroke='black' stroke-width='1.2' stroke-linecap='round' stroke-linejoin='round'`,
        ),
      );
    }
  });
});
