import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { suite, test } from 'vitest';

const appFolder = path.join(__dirname, '..', '..', '..');

interface Icons {
  readonly windowsSizes: readonly number[];
  readonly iconFileNames: readonly string[];
  readonly iconFiles: () => Record<string, Uint8Array>;
  readonly imagesOfIconFile: (
    file: string,
    bytes: Uint8Array,
  ) => Record<string, unknown>;
}

async function loadIcons(): Promise<Icons> {
  const loaded: Icons = await import(
    pathToFileURL(path.join(appFolder, 'scripts', 'icons.mts')).href
  );
  return loaded;
}

suite('Icons', () => {
  test('keeps every icon in build as the drawing renders it, so a drawing changed without running npm run icons fails here', async () => {
    const { iconFiles, imagesOfIconFile } = await loadIcons();
    const rendered = iconFiles();
    assert.deepStrictEqual(
      Object.entries(rendered)
        .filter(([file, bytes]) => {
          const kept = path.join(appFolder, file);
          return (
            !fs.existsSync(kept) ||
            !isDeepStrictEqual(
              imagesOfIconFile(file, fs.readFileSync(kept)),
              imagesOfIconFile(file, bytes),
            )
          );
        })
        .map(([file]) => file),
      [],
    );
  });

  test('gives Windows an image at every size its scales from 100% to 400% ask of a taskbar, a title bar, a list and a large icon, so it never shrinks a larger one', async () => {
    const { windowsSizes } = await loadIcons();
    const asked = [16, 24, 32, 48].flatMap((size) =>
      [1, 1.25, 1.5, 2, 2.5, 3, 4]
        .map((scale) => size * scale)
        .filter((pixels) => Number.isInteger(pixels) && pixels <= 96),
    );
    assert.deepStrictEqual(
      [...new Set(asked)].filter((pixels) => !windowsSizes.includes(pixels)),
      [],
    );
  });

  test('points electron-builder at the icons it writes for Windows, macOS and Linux', async () => {
    const { iconFileNames } = await loadIcons();
    const { build } = JSON.parse(
      fs.readFileSync(path.join(appFolder, 'package.json'), 'utf8'),
    );
    assert.deepStrictEqual(
      [build.win.icon, build.mac.icon, build.linux.icon].filter(
        (icon: string) =>
          !iconFileNames.some(
            (file) => file === icon || file.startsWith(`${icon}/`),
          ),
      ),
      [],
    );
  });
});
