import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

export interface ObsidianCanvases {
  readonly obsidianCanvases: Readonly<Record<string, string>>;
  readonly everyAttribute: string;
  readonly unicodeAndPlaces: string;
}

const playground = path.join(
  __dirname,
  '..',
  '..',
  '..',
  'scripts',
  'playground',
);

export async function obsidianCanvasesLoaded(): Promise<ObsidianCanvases> {
  const loaded: ObsidianCanvases = await import(
    pathToFileURL(path.join(playground, 'obsidianCanvases.mts')).href
  );
  return loaded;
}
