import type { Locator, Page } from 'playwright-core';
import type { SeenTile } from '../../tools/commander/page/tileRecords';
import { waitFor } from '../helpers/fixtures';
import { untilSettled } from './waits';

export const tilesShown = (pane: Locator): Promise<SeenTile[]> =>
  pane.evaluate((side) => {
    const layer = side.querySelector('.commander-layer');
    return layer instanceof HTMLElement && layer.seenTiles !== undefined
      ? [...layer.seenTiles()]
      : [];
  });

export const tileNames = async (pane: Locator): Promise<string[]> =>
  (await tilesShown(pane)).map((tile) => tile.name);

export const tilesCount = async (pane: Locator): Promise<number> =>
  (await tilesShown(pane)).length;

export const selectedTile = async (pane: Locator): Promise<string> =>
  (await tilesShown(pane)).find((tile) => tile.classes.includes('selected'))
    ?.name ?? '';

export const tilesAcross = async (pane: Locator): Promise<number> => {
  const tiles = await tilesShown(pane);
  return tiles.filter((tile) => tile.top === tiles[0]?.top).length;
};

export async function tileOf(pane: Locator, name: string): Promise<SeenTile> {
  let found: SeenTile | undefined;
  await waitFor(async () => {
    found = (await tilesShown(pane)).find((tile) => tile.name === name);
    return found !== undefined;
  }, `the tile of ${name} drawn`);
  if (found === undefined) {
    throw new Error(`No tile of ${name}`);
  }
  return found;
}

export const tileNamed = async (
  pane: Locator,
  name: string,
): Promise<SeenTile | undefined> =>
  (await tilesShown(pane)).find((tile) => tile.name === name);

export async function clickTile(
  page: Page,
  pane: Locator,
  name?: string,
): Promise<void> {
  if (name !== undefined) {
    await tileOf(pane, name);
  }
  const tile = await untilSettled(
    async () => {
      const tiles = await tilesShown(pane);
      return name === undefined
        ? tiles[0]
        : tiles.find((each) => each.name === name);
    },
    `the tile of ${name ?? 'the first file'} at rest`,
    { quiet: 150, accepted: (found) => found !== undefined },
  );
  if (tile === undefined) {
    throw new Error('No tile to click');
  }
  await page.mouse.click(
    tile.left + tile.width / 2,
    tile.top + tile.height / 2,
  );
}
